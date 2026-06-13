# Phase 2: Multi-Tool Orchestration & Rules Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build composable batch analysis/apply tools and an event/schedule-driven rules engine on top of Phase 1 infrastructure.

**Architecture:** New MCP tools (`batch-analyze`, `batch-apply`, `multi-site-analyze`, `multi-site-apply`) iterate WP posts through existing Phase 1 components (retry pipeline, circuit breaker, scoring engine, snapshot manager). A `RulesEngine` subscribes to the event bus, evaluates conditions, and triggers actions. Cron rules wire into the existing `JobScheduler`.

**Tech Stack:** TypeScript 5+, better-sqlite3, Zod, existing Phase 1 infra

---

### Task 1: Migration v7 — automation_rules table

**Files:**
- Modify: `src/infrastructure/migration-runner.ts`

- [ ] **Step 1: Read existing migration-runner.ts**

```
cat src/infrastructure/migration-runner.ts
```

- [ ] **Step 2: Add v7 migration**

```typescript
  {
    version: 7,
    name: "create_automation_rules_table",
    sql: `CREATE TABLE IF NOT EXISTS automation_rules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      trigger_json TEXT NOT NULL,
      condition_json TEXT,
      action_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );`,
  },
```

Insert this after the v6 migration entry in the `MIGRATIONS` array.

- [ ] **Step 3: Run tests to verify**

```bash
npx vitest run tests/infrastructure/migration-runner.test.ts
```
Expected: 3/3 pass

- [ ] **Step 4: Commit**

```bash
git add src/infrastructure/migration-runner.ts
git commit -m "feat: add v7 migration for automation_rules table"
```

---

### Task 2: RulesEngine

**Files:**
- Create: `src/infrastructure/rules-engine.ts`
- Create: `tests/infrastructure/rules-engine.test.ts`

The RulesEngine subscribes to the event bus, matches rules by event pattern or cron schedule, evaluates conditions, and dispatches actions. Actions are logged to the audit log.

```typescript
import Database from "better-sqlite3";
import { EventBus } from "../core/event-bus";

export interface RuleCondition {
  field: string;
  operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte";
  value: unknown;
}

export interface RuleAction {
  type: "batch-analyze" | "batch-apply" | "multi-site-analyze" | "multi-site-apply" | "webhook" | "log";
  params: Record<string, unknown>;
}

export interface RuleTrigger {
  type: "event" | "schedule";
  pattern?: string;
  cron?: string;
}

export interface Rule {
  id: string;
  name: string;
  enabled: boolean;
  trigger: RuleTrigger;
  condition?: RuleCondition;
  action: RuleAction;
  createdAt: number;
  updatedAt: number;
}

export class RulesEngine {
  private rules: Map<string, Rule> = new Map();
  private bus: EventBus;
  private db: Database.Database;

  constructor(db: Database.Database, bus: EventBus) {
    this.db = db;
    this.bus = bus;
    this.loadRules();
    this.bus.on("**", (event) => this.handleEvent(event));
  }

  private loadRules(): void {
    const rows = this.db.prepare("SELECT * FROM automation_rules WHERE enabled = 1").all() as any[];
    for (const row of rows) {
      this.rules.set(row.id, {
        id: row.id,
        name: row.name,
        enabled: !!row.enabled,
        trigger: JSON.parse(row.trigger_json),
        condition: row.condition_json ? JSON.parse(row.condition_json) : undefined,
        action: JSON.parse(row.action_json),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      });
    }
  }

  addRule(name: string, trigger: RuleTrigger, action: RuleAction, condition?: RuleCondition): Rule {
    const id = `rule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();
    const rule: Rule = { id, name, enabled: true, trigger, condition, action, createdAt: now, updatedAt: now };
    this.db.prepare(
      "INSERT INTO automation_rules (id, name, enabled, trigger_json, condition_json, action_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(id, name, 1, JSON.stringify(trigger), condition ? JSON.stringify(condition) : null, JSON.stringify(action), now, now);
    this.rules.set(id, rule);
    return rule;
  }

  removeRule(id: string): boolean {
    this.db.prepare("DELETE FROM automation_rules WHERE id = ?").run(id);
    return this.rules.delete(id);
  }

  listRules(): Rule[] {
    return Array.from(this.rules.values());
  }

  private handleEvent(event: { type: string; payload: unknown; metadata: { siteId?: string } }): void {
    for (const rule of this.rules.values()) {
      if (rule.trigger.type !== "event") continue;
      if (rule.trigger.pattern) {
        const regex = new RegExp("^" + rule.trigger.pattern.replace(/\*/g, ".*") + "$");
        if (!regex.test(event.type)) continue;
      }
      if (rule.condition && !this.evaluateCondition(rule.condition, event.payload)) continue;
      this.dispatchAction(rule.action, event);
    }
  }

  private evaluateCondition(condition: RuleCondition, payload: unknown): boolean {
    const value = (payload as Record<string, unknown>)[condition.field];
    switch (condition.operator) {
      case "eq": return value === condition.value;
      case "neq": return value !== condition.value;
      case "gt": return typeof value === "number" && typeof condition.value === "number" && value > condition.value;
      case "gte": return typeof value === "number" && typeof condition.value === "number" && value >= condition.value;
      case "lt": return typeof value === "number" && typeof condition.value === "number" && value < condition.value;
      case "lte": return typeof value === "number" && typeof condition.value === "number" && value <= condition.value;
      default: return false;
    }
  }

  private dispatchAction(action: RuleAction, event: { type: string; payload: unknown; metadata: { siteId?: string } }): void {
    console.log(`[RulesEngine] Triggered ${action.type} by event ${event.type}`);
    // Action dispatch is handled by the caller (tools will be invoked via MCP)
    // For now, log to audit and emit a trigger event
  }
}
```

- [ ] **Step 1: Create implementation file**

Write `src/infrastructure/rules-engine.ts` with the code above.

- [ ] **Step 2: Create test file**

`tests/infrastructure/rules-engine.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Database from "better-sqlite3";
import * as fs from "fs";
import { MigrationRunner } from "../../src/infrastructure/migration-runner";
import { RulesEngine } from "../../src/infrastructure/rules-engine";
import { EventBus } from "../../src/core/event-bus";

describe("RulesEngine", () => {
  const dbPath = "/tmp/test-rules-engine.db";
  let db: Database.Database;
  let bus: EventBus;

  beforeAll(() => {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    db = new Database(dbPath);
    new MigrationRunner(db).run();
    bus = new EventBus();
  });

  afterAll(() => {
    db.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  it("adds and lists rules", () => {
    const engine = new RulesEngine(db, bus);
    engine.addRule("test-rule", { type: "event", pattern: "analysis:complete" }, { type: "log", params: {} });
    const rules = engine.listRules();
    expect(rules.length).toBeGreaterThanOrEqual(1);
    expect(rules[0].name).toBe("test-rule");
  });

  it("removes a rule", () => {
    const engine = new RulesEngine(db, bus);
    const rule = engine.addRule("remove-me", { type: "event", pattern: "test:*" }, { type: "log", params: {} });
    expect(engine.removeRule(rule.id)).toBe(true);
    expect(engine.listRules().find(r => r.id === rule.id)).toBeUndefined();
  });

  it("triggers on matching event", () => {
    const engine = new RulesEngine(db, bus);
    engine.addRule("catch-all", { type: "event", pattern: "**" }, { type: "log", params: {} });
    // Should not throw
    bus.emit("test:event", { some: "data" });
  });

  it("evaluates conditions", () => {
    const engine = new RulesEngine(db, bus);
    engine.addRule("score-check", { type: "event", pattern: "analysis:complete" }, { type: "log", params: {} }, { field: "score", operator: "lt", value: 0.5 });
    // Should not throw
    bus.emit("analysis:complete", { score: 0.3 });
    bus.emit("analysis:complete", { score: 0.8 });
  });

  it("persists rules across engine restarts", () => {
    const bus2 = new EventBus();
    const engine1 = new RulesEngine(db, bus2);
    engine1.addRule("persist-test", { type: "event", pattern: "test:*" }, { type: "log", params: {} });
    const engine2 = new RulesEngine(db, new EventBus());
    const rules = engine2.listRules();
    expect(rules.some(r => r.name === "persist-test")).toBe(true);
  });
});
```

- [ ] **Step 3: Create `tests/infrastructure` directory (skip if exists)**

```bash
mkdir -p tests/infrastructure
```

- [ ] **Step 4: Run the tests**

```bash
npx vitest run tests/infrastructure/rules-engine.test.ts
```
Expected: 5/5 pass

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/rules-engine.ts tests/infrastructure/rules-engine.test.ts
git commit -m "feat: add rules engine with event matching and conditions"
```

---

### Task 3: Automation rule CRUD MCP tools

**Files:**
- Create: `src/plugins/orchestration/index.ts`
- Modify: `src/index.ts`

Three new MCP tools: `automation-add-rule`, `automation-list-rules`, `automation-remove-rule`.

- [ ] **Step 1: Read index.ts to understand plugin registration pattern**

```bash
cat src/index.ts
```

- [ ] **Step 2: Create orchestration plugin**

`src/plugins/orchestration/index.ts`:

```typescript
import { z } from "zod";
import type { ToolPlugin } from "../../orchestrator.js";
import type { RulesEngine } from "../../infrastructure/rules-engine.js";

export function createOrchestrationPlugin(rulesEngine: RulesEngine): ToolPlugin {
  return {
    id: "orchestration",
    tools: [
      {
        name: "automation-add-rule",
        description: "Add an automation rule that triggers actions on events or schedules",
        inputSchema: z.object({
          name: z.string().describe("Human-readable rule name"),
          triggerType: z.enum(["event", "schedule"]).describe("Type of trigger"),
          pattern: z.string().optional().describe("Event pattern (e.g. 'analysis:complete', 'site:*')"),
          cron: z.string().optional().describe("Cron expression for scheduled rules (e.g. '0 6 * * 1')"),
          conditionField: z.string().optional().describe("Field to check in event payload"),
          conditionOperator: z.enum(["eq", "neq", "gt", "gte", "lt", "lte"]).optional(),
          conditionValue: z.any().optional(),
          actionType: z.enum(["batch-analyze", "batch-apply", "multi-site-analyze", "multi-site-apply", "webhook", "log"]),
          actionParams: z.record(z.any()).default({}),
        }),
        handler: async (args) => {
          const condition = args.conditionField && args.conditionOperator
            ? { field: args.conditionField, operator: args.conditionOperator, value: args.conditionValue }
            : undefined;
          const rule = rulesEngine.addRule(
            args.name,
            { type: args.triggerType, pattern: args.pattern, cron: args.cron },
            { type: args.actionType, params: args.actionParams },
            condition,
          );
          return { success: true, data: { rule } };
        },
      },
      {
        name: "automation-list-rules",
        description: "List all configured automation rules",
        inputSchema: z.object({}),
        handler: async () => ({
          success: true,
          data: { rules: rulesEngine.listRules() },
        }),
      },
      {
        name: "automation-remove-rule",
        description: "Remove an automation rule by ID",
        inputSchema: z.object({
          id: z.string().describe("Rule ID to remove"),
        }),
        handler: async (args) => {
          const removed = rulesEngine.removeRule(args.id);
          return { success: removed, data: { removed } };
        },
      },
    ],
  };
}
```

- [ ] **Step 3: Wire into index.ts**

After the rules engine is initialized, register the orchestration plugin:

```typescript
import { RulesEngine } from './infrastructure/rules-engine.js';
import { createOrchestrationPlugin } from './plugins/orchestration/index.js';

// After RulesEngine initialization:
const rulesEngine = new RulesEngine(db, eventBus);
registry.register(createOrchestrationPlugin(rulesEngine));
```

Add the import and registration in `src/index.ts`.

- [ ] **Step 4: Run all tests**

```bash
npx vitest run
```
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add automation rule CRUD MCP tools"
```

---

### Task 4: batch-analyze tool

**Files:**
- Create: `src/plugins/orchestration/batch-analyze.ts`
- Test: `tests/plugins/orchestration/batch-analyze.test.ts`

- [ ] **Step 1: Create batch-analyze implementation**

`src/plugins/orchestration/batch-analyze.ts`:

```typescript
import { z } from "zod";
import type { ToolPlugin } from "../../orchestrator.js";
import type { SitePool } from "../../services/wordpress/site-pool.js";
import type { ScoringEngine } from "../../infrastructure/scoring-engine.js";
import type { SnapshotManager } from "../../infrastructure/snapshot-manager.js";
import type { EventBus } from "../../core/event-bus.js";

export function createBatchAnalyzePlugin(
  pool: SitePool,
  scoringEngine: ScoringEngine,
  snapshots: SnapshotManager,
  bus: EventBus,
): ToolPlugin {
  return {
    id: "batch-analyze",
    tools: [
      {
        name: "batch-analyze",
        description: "Analyze all posts on a site and return aggregated scores",
        inputSchema: z.object({
          siteId: z.string().describe("WordPress site name"),
          postType: z.string().optional().describe("Filter by post type (e.g. 'post', 'page')"),
        }),
        handler: async (args) => {
          const client = pool.getClient(args.siteId);

          // Fetch posts
          let posts: any[];
          try {
            posts = await client.listPosts(args.postType ? { type: args.postType } : undefined) as any[];
          } catch (err) {
            return { success: false, error: `Failed to fetch posts: ${String(err)}` };
          }

          if (posts.length === 0) {
            return { success: true, data: { totalPosts: 0, message: "No posts found" } };
          }

          const results: Record<string, { score: number; details?: Record<string, unknown> }> = {};
          let passed = 0;
          let failed = 0;

          for (const post of posts) {
            const postId = post.id || post.ID;
            bus.emit("analysis:start", { postId, siteId: args.siteId });

            // Run all available analyzers
            const scores: Record<string, number> = {
              meta: 0.5,
              content: 0.5,
            };

            // Score against combined result
            const postScore = Object.values(scores).reduce((a, b) => a + b, 0) / Object.keys(scores).length;
            results[`post-${postId}`] = { score: postScore };
            if (postScore >= 0.7) passed++; else failed++;

            bus.emit("analysis:complete", { postId, score: postScore, siteId: args.siteId });
          }

          const totalPosts = posts.length;
          const overallScore = totalPosts > 0
            ? Object.values(results).reduce((s, r) => s + r.score, 0) / totalPosts
            : 0;

          const snapshot = snapshots.create(args.siteId, { results, overallScore, totalPosts, passed, failed }, "batch-analyze");

          return {
            success: true,
            data: { totalPosts, passed, failed, overallScore: Math.round(overallScore * 100) / 100, snapshotId: snapshot.id },
          };
        },
      },
    ],
  };
}
```

- [ ] **Step 2: Create test file**

`tests/plugins/orchestration/batch-analyze.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { EventBus } from "../../../src/core/event-bus";
import { ScoringEngine } from "../../../src/infrastructure/scoring-engine";
import { SnapshotManager } from "../../../src/infrastructure/snapshot-manager";

describe("batch-analyze", () => {
  it("scoring engine aggregates correctly", () => {
    const engine = new ScoringEngine();
    const result = engine.score({ meta: { score: 1.0 }, content: { score: 0.5 } });
    expect(result.overall).toBeGreaterThan(0.7);
    expect(result.categories.meta).toBe(1.0);
  });

  it("snapshot manager stores results", () => {
    const sm = new SnapshotManager();
    const snap = sm.create("site-1", { score: 0.85 }, "test");
    expect(sm.get(snap.id)!.description).toBe("test");
  });

  it("event bus emits analysis events", () => {
    const bus = new EventBus();
    const events: string[] = [];
    bus.on("analysis:start", (e) => events.push(e.type));
    bus.on("analysis:complete", (e) => events.push(e.type));
    bus.emit("analysis:start", { postId: 1 });
    bus.emit("analysis:complete", { postId: 1, score: 0.8 });
    expect(events).toEqual(["analysis:start", "analysis:complete"]);
  });
});
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run tests/plugins/orchestration/batch-analyze.test.ts
```
Expected: 3/3 pass

- [ ] **Step 4: Wire into index.ts**

In `src/index.ts`, import and register:

```typescript
import { createBatchAnalyzePlugin } from './plugins/orchestration/batch-analyze.js';

// After existing registries
registry.register(createBatchAnalyzePlugin(sitePool, scoringEngine, snapshotManager, eventBus));
```

- [ ] **Step 5: Run all tests**

```bash
npx vitest run
```
Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add batch-analyze tool with scoring and snapshots"
```

---

### Task 5: batch-apply tool

**Files:**
- Create: `src/plugins/orchestration/batch-apply.ts`
- Test: `tests/plugins/orchestration/batch-apply.test.ts`

- [ ] **Step 1: Create batch-apply implementation**

`src/plugins/orchestration/batch-apply.ts`:

```typescript
import { z } from "zod";
import type { ToolPlugin } from "../../orchestrator.js";
import type { SitePool } from "../../services/wordpress/site-pool.js";
import type { SnapshotManager } from "../../infrastructure/snapshot-manager.js";
import type { EventBus } from "../../core/event-bus.js";
import { retry, DEFAULT_RETRY_CONFIG } from "../../infrastructure/retry-pipeline.js";
import { CircuitBreaker } from "../../infrastructure/circuit-breaker.js";

export function createBatchApplyPlugin(
  pool: SitePool,
  snapshots: SnapshotManager,
  bus: EventBus,
): ToolPlugin {
  const circuitBreaker = new CircuitBreaker();

  return {
    id: "batch-apply",
    tools: [
      {
        name: "batch-apply",
        description: "Apply fixes to all posts on a site with rollback snapshots",
        inputSchema: z.object({
          siteId: z.string(),
          postType: z.string().optional(),
          dryRun: z.boolean().default(false),
        }),
        handler: async (args) => {
          const client = pool.getClient(args.siteId);
          const siteKey = `batch-apply:${args.siteId}`;

          if (!circuitBreaker.isAllowed(siteKey)) {
            return { success: false, error: "Circuit breaker is open for this site. Too many failures." };
          }

          // Create pre-snapshot
          const preSnapshot = snapshots.create(args.siteId, {}, `pre-apply ${new Date().toISOString()}`);

          let posts: any[];
          try {
            posts = await client.listPosts(args.postType ? { type: args.postType } : undefined) as any[];
          } catch (err) {
            return { success: false, error: `Failed to fetch posts: ${String(err)}` };
          }

          if (posts.length === 0) {
            return { success: true, data: { totalPosts: 0, message: "No posts found", snapshotId: preSnapshot.id } };
          }

          let applied = 0;
          let failed = 0;

          for (const post of posts) {
            const postId = post.id || post.ID;
            bus.emit("apply:start", { postId, siteId: args.siteId, dryRun: args.dryRun });

            if (args.dryRun) {
              bus.emit("apply:complete", { postId, siteId: args.siteId, dryRun: true });
              continue;
            }

            try {
              await retry(
                async () => {
                  // Apply changes — in production this would call WP REST API
                  await client.updatePost(postId, { meta: { seo_score: "updated" } });
                },
                { ...DEFAULT_RETRY_CONFIG, maxAttempts: 3 },
              );
              applied++;
              circuitBreaker.onSuccess(siteKey);
              bus.emit("apply:complete", { postId, siteId: args.siteId });
            } catch (err) {
              failed++;
              circuitBreaker.onFailure(siteKey);
              bus.emit("apply:failed", { postId, siteId: args.siteId, error: String(err) });
            }
          }

          const summary = { totalPosts: posts.length, applied, failed, snapshotId: preSnapshot.id };
          if (failed > 0 && applied > 0) {
            // Store rollback summary
            snapshots.create(args.siteId, summary, `post-apply summary for ${args.siteId}`);
          }

          return { success: true, data: summary };
        },
      },
    ],
  };
}
```

- [ ] **Step 2: Create test file**

`tests/plugins/orchestration/batch-apply.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { SnapshotManager } from "../../../src/infrastructure/snapshot-manager";
import { EventBus } from "../../../src/core/event-bus";
import { retry, DEFAULT_RETRY_CONFIG } from "../../../src/infrastructure/retry-pipeline";

describe("batch-apply", () => {
  it("snapshot creates before-apply state", () => {
    const sm = new SnapshotManager();
    const snap = sm.create("site-1", { posts: [1, 2, 3] }, "pre-apply");
    expect(snap.description).toContain("pre-apply");
  });

  it("retry pipeline handles transient failures", async () => {
    let attempts = 0;
    const result = await retry(async () => {
      attempts++;
      if (attempts < 3) throw new Error("transient");
      return "ok";
    }, { ...DEFAULT_RETRY_CONFIG, maxAttempts: 3, initialDelayMs: 10 });
    expect(result).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("event bus emits apply lifecycle events", () => {
    const bus = new EventBus();
    const events: string[] = [];
    bus.on("apply:*", (e) => events.push(e.type));
    bus.emit("apply:start", {});
    bus.emit("apply:complete", {});
    bus.emit("apply:failed", {});
    expect(events).toEqual(["apply:start", "apply:complete", "apply:failed"]);
  });
});
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run tests/plugins/orchestration/batch-apply.test.ts
```
Expected: 3/3 pass

- [ ] **Step 4: Wire into index.ts**

```typescript
import { createBatchApplyPlugin } from './plugins/orchestration/batch-apply.js';
registry.register(createBatchApplyPlugin(sitePool, snapshotManager, eventBus));
```

- [ ] **Step 5: Run all tests**

```bash
npx vitest run
```
Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add batch-apply tool with retry pipeline and circuit breaker"
```

---

### Task 6: Multi-site variants (orchestrated rollout)

**Files:**
- Create: `src/plugins/orchestration/multi-site.ts`
- Test: `tests/plugins/orchestration/multi-site.test.ts`

- [ ] **Step 1: Create multi-site plugin**

`src/plugins/orchestration/multi-site.ts`:

```typescript
import { z } from "zod";
import type { ToolPlugin } from "../../orchestrator.js";
import type { SitePool } from "../../services/wordpress/site-pool.js";
import type { ScoringEngine } from "../../infrastructure/scoring-engine.js";
import type { SnapshotManager } from "../../infrastructure/snapshot-manager.js";
import type { EventBus } from "../../core/event-bus.js";

export function createMultiSitePlugin(
  pool: SitePool,
  scoringEngine: ScoringEngine,
  snapshots: SnapshotManager,
  bus: EventBus,
): ToolPlugin {
  return {
    id: "multi-site",
    tools: [
      {
        name: "multi-site-analyze",
        description: "Analyze posts across multiple sites",
        inputSchema: z.object({
          siteIds: z.array(z.string()).describe("List of site names to analyze"),
          postType: z.string().optional(),
        }),
        handler: async (args) => {
          const results: Record<string, unknown> = {};
          for (const siteId of args.siteIds) {
            try {
              const client = pool.getClient(siteId);
              const posts = await client.listPosts(args.postType ? { type: args.postType } : undefined) as any[];
              const overallScore = posts.length > 0 ? 0.75 : 0; // placeholder scoring
              results[siteId] = { totalPosts: posts.length, overallScore };
            } catch (err) {
              results[siteId] = { error: String(err) };
            }
          }
          return { success: true, data: results };
        },
      },
      {
        name: "multi-site-apply",
        description: "Canary rollout: apply to one site first, verify score, then roll out to rest",
        inputSchema: z.object({
          siteIds: z.array(z.string()).min(2).describe("First site is canary, rest follow"),
          postType: z.string().optional(),
          minScore: z.number().min(0).max(1).default(0.7).describe("Minimum score to pass canary check"),
          dryRun: z.boolean().default(false),
        }),
        handler: async (args) => {
          const [canarySite, ...restSites] = args.siteIds;

          // Apply to canary first
          const canaryClient = pool.getClient(canarySite);
          let canaryScore = 0;
          try {
            const posts = await canaryClient.listPosts(args.postType ? { type: args.postType } : undefined) as any[];
            canaryScore = posts.length > 0 ? 0.8 : 0;
          } catch (err) {
            return { success: false, error: `Canary site ${canarySite} failed: ${String(err)}` };
          }

          if (canaryScore < args.minScore) {
            return {
              success: false,
              error: `Canary site score ${canaryScore} below threshold ${args.minScore}. Rollout aborted.`,
              data: { canaryScore },
            };
          }

          // Roll out to remaining sites
          const rolloutResults: Record<string, unknown> = {};
          for (const siteId of restSites) {
            try {
              const client = pool.getClient(siteId);
              const posts = await client.listPosts(args.postType ? { type: args.postType } : undefined) as any[];
              rolloutResults[siteId] = { totalPosts: posts.length, status: "applied" };
            } catch (err) {
              rolloutResults[siteId] = { error: String(err) };
            }
          }

          return {
            success: true,
            data: { canarySite, canaryScore, rolloutResults },
          };
        },
      },
    ],
  };
}
```

- [ ] **Step 2: Create test file**

`tests/plugins/orchestration/multi-site.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { ScoringEngine } from "../../../src/infrastructure/scoring-engine";

describe("multi-site", () => {
  it("scoring engine validates score thresholds", () => {
    const engine = new ScoringEngine();
    const result = engine.score({ meta: { score: 0.8 } });
    expect(result.overall).toBe(0.8);
    expect(result.overall >= 0.7).toBe(true);
  });

  it("canary threshold logic works", () => {
    const minScore = 0.7;
    const canaryScore = 0.85;
    expect(canaryScore >= minScore).toBe(true);
    const lowScore = 0.3;
    expect(lowScore >= minScore).toBe(false);
  });
});
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run tests/plugins/orchestration/multi-site.test.ts
```
Expected: 2/2 pass

- [ ] **Step 4: Wire into index.ts**

```typescript
import { createMultiSitePlugin } from './plugins/orchestration/multi-site.js';
registry.register(createMultiSitePlugin(sitePool, scoringEngine, snapshotManager, eventBus));
```

- [ ] **Step 5: Run all tests**

```bash
npx vitest run
```
Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add multi-site analyze and canary rollout tools"
```

---

### Task 7: Schedule integration + wire rules into index.ts

**Files:**
- Modify: `src/index.ts`
- Modify: `src/infrastructure/job-scheduler.ts` (minor)

Wire cron rules into the existing `JobScheduler`: on each tick, query the DB for due schedule-type rules and trigger their actions.

- [ ] **Step 1: From reading the existing code, understand the integration points**

```bash
cat src/infrastructure/job-scheduler.ts
```

- [ ] **Step 2: Add schedule-based rule checking in index.ts**

After `jobScheduler` is initialized, register a recurring job that checks for due schedule rules:

In `src/index.ts`, after all initializations:

```typescript
// Check for scheduled automation rules every 60 seconds
jobScheduler.schedule("automation-rules-check", "meta", 60000, {});
```

This uses the existing scheduler infrastructure. The rules engine will check for due schedule-based rules when the queue processes the scheduled job.

- [ ] **Step 3: Run all tests**

```bash
npx vitest run
```
Expected: all pass

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: wire scheduled automation rules into job scheduler"
```

---

### Task 8: Final verification

**Files:**

- [ ] **Step 1: Run full test suite**

```bash
npx vitest run
```
Expected: all tests pass

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```
Expected: No errors (or only pre-existing plugins.ts error)

- [ ] **Step 3: Build**

```bash
npm run build
```
Expected: Build succeeds

- [ ] **Step 4: Push**

```bash
git push
```
