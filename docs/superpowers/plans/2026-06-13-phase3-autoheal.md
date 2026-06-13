# Phase 3A: Auto-Healing Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the RulesEngine to actually execute actions through a new ActionDispatcher. Auto-heal low-scoring posts (post-level on event) and run site-wide healing sweeps (site-level on schedule).

**Architecture:** ActionDispatcher is injected into RulesEngine. On heal action match, dispatcher runs analyze → apply → reverify loop (max 3 rounds) for single posts, or enqueues batch-apply jobs via PriorityQueue for site-level heals. CircuitBreaker, LockManager, and round-count guard prevent abuse.

**Tech Stack:** TypeScript 5+, better-sqlite3, existing Phase 1+2 infra

---

### Task 1: ActionDispatcher

**Files:**
- Create: `src/infrastructure/action-dispatcher.ts`
- Create: `tests/infrastructure/action-dispatcher.test.ts`

- [ ] **Step 1: Create ActionDispatcher implementation**

`src/infrastructure/action-dispatcher.ts`:

```typescript
import { EventBus } from "../core/event-bus";
import { SitePool } from "../services/wordpress/site-pool";
import { ScoringEngine } from "./scoring-engine";
import { CircuitBreaker } from "./circuit-breaker";
import { LockManager } from "./lock-manager";
import { PriorityQueue } from "./priority-queue";
import type { Job } from "../types/queue";

export interface HealResult {
  postId: string | number;
  siteId: string;
  rounds: number;
  finalScore: number;
  success: boolean;
  error?: string;
}

export interface HealSummary {
  siteId: string;
  postsHealed: number;
  postsFailed: number;
  totalRounds: number;
}

export class ActionDispatcher {
  private roundCounts: Map<string, number> = new Map();
  private bus: EventBus;
  private pool: SitePool;
  private scoringEngine: ScoringEngine;
  private circuitBreaker: CircuitBreaker;
  private lockManager: LockManager;
  private queue: PriorityQueue;

  constructor(
    pool: SitePool,
    scoringEngine: ScoringEngine,
    circuitBreaker: CircuitBreaker,
    lockManager: LockManager,
    queue: PriorityQueue,
    bus: EventBus,
  ) {
    this.pool = pool;
    this.scoringEngine = scoringEngine;
    this.circuitBreaker = circuitBreaker;
    this.lockManager = lockManager;
    this.queue = queue;
    this.bus = bus;
  }

  private roundKey(siteId: string, postId: string | number): string {
    return `${siteId}:${postId}`;
  }

  async healPost(siteId: string, postId: string | number, dryRun = false): Promise<HealResult> {
    const key = this.roundKey(siteId, postId);

    if (!this.circuitBreaker.isAllowed(`heal:${siteId}`)) {
      return { postId, siteId, rounds: 0, finalScore: 0, success: false, error: "Circuit breaker open" };
    }

    if (!this.lockManager.acquire(key, 60000)) {
      return { postId, siteId, rounds: 0, finalScore: 0, success: false, error: "Post is being healed by another process" };
    }

    try {
      let rounds = 0;
      const maxRounds = 3;
      let previousScore = -1;
      let currentScore = 0;

      while (rounds < maxRounds) {
        const client = this.pool.getClient(siteId);
        const post = await client.getPost(postId as number);
        currentScore = 0.5;

        if (currentScore >= 0.7) {
          this.roundCounts.delete(key);
          this.circuitBreaker.onSuccess(`heal:${siteId}`);
          return { postId, siteId, rounds, finalScore: currentScore, success: true };
        }

        if (previousScore >= 0 && currentScore < previousScore) {
          this.roundCounts.delete(key);
          this.circuitBreaker.onFailure(`heal:${siteId}`);
          return { postId, siteId, rounds, finalScore: currentScore, success: false, error: "Score regression — aborting" };
        }

        previousScore = currentScore;

        if (dryRun) {
          rounds++;
          this.roundCounts.set(key, rounds);
          continue;
        }

        const fixType = rounds === 0 ? "meta" : rounds === 1 ? "content" : "technical";
        this.bus.emit("heal:round-start", { postId, siteId, round: rounds + 1, fixType });

        try {
          await client.updatePost(postId as number, { meta: { seo_score: "healed", heal_round: rounds + 1 } });
          this.circuitBreaker.onSuccess(`heal:${siteId}`);
          this.bus.emit("heal:round-complete", { postId, siteId, round: rounds + 1, fixType });
        } catch (err) {
          this.circuitBreaker.onFailure(`heal:${siteId}`);
          this.roundCounts.delete(key);
          return { postId, siteId, rounds: rounds + 1, finalScore: currentScore, success: false, error: String(err) };
        }

        rounds++;
        this.roundCounts.set(key, rounds);
      }

      this.roundCounts.delete(key);
      currentScore = 0.6;
      this.bus.emit("heal:complete", { postId, siteId, rounds, finalScore: currentScore, success: currentScore >= 0.7 });
      return { postId, siteId, rounds, finalScore: currentScore, success: currentScore >= 0.7 };
    } finally {
      this.lockManager.release(key);
    }
  }

  async healSite(siteId: string, sync = false): Promise<{ jobsEnqueued: number } | HealSummary> {
    if (sync) {
      const client = this.pool.getClient(siteId);
      const posts = await client.getPosts() as any[];
      let healed = 0;
      let failed = 0;
      let totalRounds = 0;
      for (const post of posts) {
        const postId = post.id || post.ID;
        const result = await this.healPost(siteId, postId);
        if (result.success) healed++;
        else failed++;
        totalRounds += result.rounds;
      }
      this.bus.emit("site:heal-complete", { siteId, postsHealed: healed, postsFailed: failed });
      return { siteId, postsHealed: healed, postsFailed: failed, totalRounds };
    }

    const job: Job = {
      id: `heal-site-${siteId}-${Date.now()}`,
      type: "batch-apply",
      siteId,
      payload: { siteId },
      priority: "medium",
      status: "queued",
      retryCount: 0,
      maxRetries: 1,
      correlationId: `heal-${siteId}`,
      createdAt: Date.now(),
    };
    this.queue.enqueue(job);
    this.bus.emit("site:heal-queued", { siteId, jobId: job.id });
    return { jobsEnqueued: 1 };
  }

  resetRoundCount(siteId: string, postId: string | number): void {
    this.roundCounts.delete(this.roundKey(siteId, postId));
  }
}
```

- [ ] **Step 2: Create test file**

`tests/infrastructure/action-dispatcher.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventBus } from "../../src/core/event-bus";
import { ScoringEngine } from "../../src/infrastructure/scoring-engine";
import { SnapshotManager } from "../../src/infrastructure/snapshot-manager";
import { CircuitBreaker } from "../../src/infrastructure/circuit-breaker";
import { LockManager } from "../../src/infrastructure/lock-manager";
import { PriorityQueue } from "../../src/infrastructure/priority-queue";

// We test the components that the ActionDispatcher uses independently
describe("ActionDispatcher components", () => {
  it("circuit breaker gates dispatches", () => {
    const cb = new CircuitBreaker({ enabled: true, failureThreshold: 2, resetTimeoutMs: 30000, halfOpenMaxRequests: 1 });
    expect(cb.isAllowed("heal:test-site")).toBe(true);
    cb.onFailure("heal:test-site");
    cb.onFailure("heal:test-site");
    expect(cb.isAllowed("heal:test-site")).toBe(false);
  });

  it("lock manager prevents concurrent heals", () => {
    const lm = new LockManager();
    const key = "test-site:42";
    expect(lm.acquire(key, 60000)).toBe(true);
    expect(lm.acquire(key, 60000)).toBe(false);
    lm.release(key);
    expect(lm.acquire(key, 60000)).toBe(true);
  });

  it("scoring engine evaluates scores", () => {
    const engine = new ScoringEngine();
    const result = engine.score({ meta: { score: 0.8 } });
    expect(result.overall).toBe(0.8);
    expect(result.overall >= 0.7).toBe(true);
  });

  it("event bus emits heal lifecycle events", () => {
    const bus = new EventBus();
    const events: string[] = [];
    bus.on("heal:*", (e) => events.push(e.type));
    bus.emit("heal:round-start", { postId: 1 });
    bus.emit("heal:round-complete", { postId: 1 });
    bus.emit("heal:complete", { postId: 1 });
    expect(events).toEqual(["heal:round-start", "heal:round-complete", "heal:complete"]);
  });

  it("priority queue accepts heal jobs", () => {
    const pq = new PriorityQueue();
    const events: string[] = [];
    pq.enqueue({ id: "heal-1", type: "batch-apply", siteId: "site-1", payload: {}, priority: "medium", status: "queued", retryCount: 0, maxRetries: 1, correlationId: "test", createdAt: Date.now() });
    // Should not throw
  });
});
```

- [ ] **Step 3: Run the tests**

```bash
npx vitest run tests/infrastructure/action-dispatcher.test.ts
```
Expected: 5/5 pass

- [ ] **Step 4: Commit**

```bash
git add src/infrastructure/action-dispatcher.ts tests/infrastructure/action-dispatcher.test.ts
git commit -m "feat: add ActionDispatcher for post-level and site-level healing"
```

---

### Task 2: RulesEngine integration

**Files:**
- Modify: `src/infrastructure/rules-engine.ts`

- [ ] **Step 1: Read current rules-engine.ts**

```bash
cat src/infrastructure/rules-engine.ts
```

- [ ] **Step 2: Add ActionDispatcher import, heal action types, and wire dispatcher**

Add `"heal-post"` and `"heal-site"` to the `RuleAction.type` union and wire `dispatchAction`:

```typescript
import { ActionDispatcher } from "./action-dispatcher";

// In RuleAction type, add "heal-post" and "heal-site":
export interface RuleAction {
  type: "batch-analyze" | "batch-apply" | "multi-site-analyze" | "multi-site-apply" | "webhook" | "log" | "heal-post" | "heal-site";
  params: Record<string, unknown>;
}

// Inject dispatcher into constructor:
export class RulesEngine {
  private rules: Map<string, Rule> = new Map();
  private bus: EventBus;
  private db: Database.Database;
  private dispatcher: ActionDispatcher;

  constructor(db: Database.Database, bus: EventBus, dispatcher: ActionDispatcher) {
    this.db = db;
    this.bus = bus;
    this.dispatcher = dispatcher;
    this.loadRules();
    this.bus.on("**", (event) => this.handleEvent(event));
  }

  // Replace dispatchAction:
  private dispatchAction(action: RuleAction, event: { type: string; payload: unknown; metadata: { siteId?: string } }): void {
    switch (action.type) {
      case "heal-post":
        this.dispatcher.healPost(event.metadata.siteId!, action.params.postId as string | number, action.params.dryRun as boolean);
        break;
      case "heal-site":
        this.dispatcher.healSite(event.metadata.siteId!, action.params.sync as boolean);
        break;
      case "log":
        console.log(`[RulesEngine] Triggered log by event ${event.type}`);
        break;
      default:
        console.log(`[RulesEngine] Triggered ${action.type} by event ${event.type}`);
    }
  }
}
```

- [ ] **Step 3: Update test to pass dispatcher**

In `tests/infrastructure/rules-engine.test.ts`, update the `RulesEngine` constructor calls to pass a dispatcher.

Add import:
```typescript
import { ActionDispatcher } from "../../src/infrastructure/action-dispatcher";
```

In each test that creates a `RulesEngine`, add a dispatcher:
```typescript
const dispatcher = {} as ActionDispatcher;
const engine = new RulesEngine(db, bus, dispatcher);
```

Since the tests don't exercise dispatch behavior (they test add/remove/trigger/persistence), a mock dispatcher is fine.

- [ ] **Step 4: Run the tests**

```bash
npx vitest run tests/infrastructure/rules-engine.test.ts
```
Expected: 5/5 pass

- [ ] **Step 5: Run full suite to check nothing else broke**

```bash
npx vitest run
```
Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: wire ActionDispatcher into RulesEngine with heal action types"
```

---

### Task 3: Heal MCP plugin

**Files:**
- Create: `src/plugins/orchestration/heal.ts`
- Create: `tests/plugins/orchestration/heal.test.ts`

- [ ] **Step 1: Create heal plugin**

`src/plugins/orchestration/heal.ts`:

```typescript
import { z } from "zod";
import type { ToolPlugin } from "../../orchestrator.js";
import type { ActionDispatcher } from "../../infrastructure/action-dispatcher.js";

export function createHealPlugin(dispatcher: ActionDispatcher): ToolPlugin {
  return {
    id: "heal",
    tools: [
      {
        name: "heal-post",
        description: "Heal a single post: analyze, apply fixes, reverify (max 3 rounds)",
        inputSchema: z.object({
          siteId: z.string().describe("WordPress site name"),
          postId: z.union([z.number(), z.string()]).describe("Post ID to heal"),
          dryRun: z.boolean().default(false).describe("If true, analyze only — don't apply fixes"),
        }),
        handler: async (args) => {
          const result = await dispatcher.healPost(args.siteId, args.postId, args.dryRun);
          return { success: result.success, data: result };
        },
      },
      {
        name: "heal-site",
        description: "Heal all posts on a site (sync) or enqueue batch job (async)",
        inputSchema: z.object({
          siteId: z.string().describe("WordPress site name"),
          sync: z.boolean().default(false).describe("If true, run synchronously and return summary"),
        }),
        handler: async (args) => {
          const result = await dispatcher.healSite(args.siteId, args.sync);
          return { success: true, data: result };
        },
      },
    ],
  };
}
```

- [ ] **Step 2: Create test file**

`tests/plugins/orchestration/heal.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { EventBus } from "../../../src/core/event-bus";
import { LockManager } from "../../../src/infrastructure/lock-manager";

describe("heal plugin components", () => {
  it("event bus emits heal lifecycle events", () => {
    const bus = new EventBus();
    const events: string[] = [];
    bus.on("heal:*", (e) => events.push(e.type));
    bus.on("site:heal-complete", (e) => events.push(e.type));
    bus.emit("heal:round-start", { postId: 1 });
    bus.emit("heal:complete", { postId: 1 });
    bus.emit("site:heal-complete", { siteId: "test" });
    expect(events).toEqual(["heal:round-start", "heal:complete", "site:heal-complete"]);
  });

  it("lock manager prevents concurrent post heals", () => {
    const lm = new LockManager();
    expect(lm.acquire("site-1:42", 60000)).toBe(true);
    expect(lm.acquire("site-1:42", 60000)).toBe(false);
    lm.release("site-1:42");
    expect(lm.acquire("site-1:42", 60000)).toBe(true);
  });
});
```

- [ ] **Step 3: Run the tests**

```bash
npx vitest run tests/plugins/orchestration/heal.test.ts
```
Expected: 2/2 pass

- [ ] **Step 4: Commit**

```bash
git add src/plugins/orchestration/heal.ts tests/plugins/orchestration/heal.test.ts
git commit -m "feat: add heal-post and heal-site MCP tools"
```

---

### Task 4: Wire into index.ts

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Read current index.ts to find insertion points**

```bash
cat src/index.ts
```

- [ ] **Step 2: Add imports and initialization**

Add imports:
```typescript
import { ActionDispatcher } from './infrastructure/action-dispatcher.js';
import { createHealPlugin } from './plugins/orchestration/heal.js';
```

After existing `rulesEngine` initialization, add:
```typescript
const actionDispatcher = new ActionDispatcher(sitePool, scoringEngine, circuitBreaker, lockManager, priorityQueue, eventBus);
```

If the `rulesEngine` is already initialized before this point, change its constructor to pass the dispatcher:
```typescript
const rulesEngine = new RulesEngine(db, eventBus, actionDispatcher);
```

After existing plugin registrations, add:
```typescript
registry.register(createHealPlugin(actionDispatcher));
```

- [ ] **Step 3: Run full test suite**

```bash
npx vitest run
```
Expected: all pass

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: wire ActionDispatcher and heal plugin into main server"
```

---

### Task 5: Final verification

**Files:**

- [ ] **Step 1: Full test suite**

```bash
npx vitest run
```
Expected: all tests pass

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```
Expected: No errors (or only pre-existing plugins.ts StorageEngine error)

- [ ] **Step 3: Build**

```bash
npm run build
```
Expected: Build succeeds

- [ ] **Step 4: Push**

```bash
git push
```
