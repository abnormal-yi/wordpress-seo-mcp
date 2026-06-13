# Phase 3B: SEO Performance Monitoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a scheduled SEO monitoring service that tracks score history, detects anomalies, and alerts via event bus + webhook.

**Architecture:** MonitorService runs on a JobScheduler interval, scores all sites via SitePool/ScoringEngine, stores time-series data in `score_history` SQLite table, runs AnomalyDetector on each cycle, emits `monitor:alert` events which trigger WebhookDispatcher.

**Tech Stack:** TypeScript 5+, better-sqlite3, Zod, existing EventBus/ScoringEngine/SitePool/JobScheduler/WebhookDispatcher

---

### Task 1: V8 Migration (score_history + monitor_config tables)

**Files:**
- Create: `src/migrations/v8_create_monitor_tables.ts`
- Test: `tests/infrastructure/migration-runner.test.ts` (existing — will verify v8 applies)

- [ ] **Step 1: Write the migration**

```typescript
// src/migrations/v8_create_monitor_tables.ts
import type { Migration } from "../infrastructure/migration-runner";

const migration: Migration = {
  version: 8,
  name: "create_monitor_tables",
  up: `
    CREATE TABLE IF NOT EXISTS score_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id TEXT NOT NULL,
      post_id TEXT,
      score REAL NOT NULL,
      component_scores TEXT,
      analyzed_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_score_history_site ON score_history(site_id, analyzed_at);
    CREATE INDEX IF NOT EXISTS idx_score_history_post ON score_history(post_id, analyzed_at);

    CREATE TABLE IF NOT EXISTS monitor_config (
      site_id TEXT PRIMARY KEY,
      min_score REAL NOT NULL DEFAULT 0.5,
      max_drop_percent REAL NOT NULL DEFAULT 20,
      window_size INTEGER NOT NULL DEFAULT 5,
      webhook_url TEXT
    );
  `,
  down: `
    DROP TABLE IF EXISTS score_history;
    DROP TABLE IF EXISTS monitor_config;
  `,
};

export default migration;
```

- [ ] **Step 2: Register the migration in migration-runner.ts**

Open `src/infrastructure/migration-runner.ts` and add the import + register call.

```typescript
// Add to imports
import v8 from "../migrations/v8_create_monitor_tables";

// Add to migrations array after v7
v8,
```

- [ ] **Step 3: Run tests to verify migration applies cleanly**

Run: `npx vitest run tests/infrastructure/migration-runner.test.ts`
Expected: PASS (v8 migration applies without error)

- [ ] **Step 4: Commit**

```bash
git add src/migrations/v8_create_monitor_tables.ts src/infrastructure/migration-runner.ts
git commit -m "feat: add v8 migration for monitor tables"
```

---

### Task 2: AnomalyDetector

**Files:**
- Create: `src/infrastructure/anomaly-detector.ts`
- Test: `tests/infrastructure/anomaly-detector.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// tests/infrastructure/anomaly-detector.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Database from "better-sqlite3";
import * as fs from "fs";
import { AnomalyDetector, type AlertResult } from "../../src/infrastructure/anomaly-detector";

describe("AnomalyDetector", () => {
  const dbPath = "/tmp/test-anomaly-detector.db";
  let db: Database.Database;

  beforeAll(() => {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    db = new Database(dbPath);
    db.exec(`
      CREATE TABLE score_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        site_id TEXT NOT NULL,
        post_id TEXT,
        score REAL NOT NULL,
        component_scores TEXT,
        analyzed_at INTEGER NOT NULL
      );
      CREATE INDEX idx_score_history_site ON score_history(site_id, analyzed_at);
    `);
  });

  afterAll(() => {
    db.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  it("returns no alerts when insufficient history", () => {
    const detector = new AnomalyDetector();
    db.exec("DELETE FROM score_history");
    db.prepare("INSERT INTO score_history (site_id, score, analyzed_at) VALUES (?, ?, ?)").run("site-1", 0.8, 100);
    const result = detector.check("site-1", 0.7, db, { windowSize: 5 });
    expect(result).toEqual([]);
  });

  it("returns absolute threshold alert when score below minScore", () => {
    const detector = new AnomalyDetector();
    db.exec("DELETE FROM score_history");
    // Insert more than window_size entries so we have history
    for (let i = 0; i < 6; i++) {
      db.prepare("INSERT INTO score_history (site_id, score, analyzed_at) VALUES (?, ?, ?)").run("site-1", 0.8, 1000 + i);
    }
    const result = detector.check("site-1", 0.3, db, { windowSize: 5, minScore: 0.5 });
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].alertType).toBe("below_min_score");
  });

  it("returns relative drop alert when score drops significantly", () => {
    const detector = new AnomalyDetector();
    db.exec("DELETE FROM score_history");
    for (let i = 0; i < 6; i++) {
      db.prepare("INSERT INTO score_history (site_id, score, analyzed_at) VALUES (?, ?, ?)").run("site-1", 0.9, 1000 + i);
    }
    const result = detector.check("site-1", 0.5, db, { windowSize: 5, maxDropPercent: 20 });
    const drops = result.filter(r => r.alertType === "relative_drop");
    expect(drops.length).toBeGreaterThanOrEqual(1);
    expect(drops[0].dropPercent).toBeGreaterThan(20);
  });

  it("deduplicates alerts for unchanged score", () => {
    const detector = new AnomalyDetector();
    db.exec("DELETE FROM score_history");
    for (let i = 0; i < 6; i++) {
      db.prepare("INSERT INTO score_history (site_id, score, analyzed_at) VALUES (?, ?, ?)").run("site-1", 0.9, 1000 + i);
    }
    const first = detector.check("site-1", 0.3, db, { windowSize: 5, minScore: 0.5 });
    expect(first.filter(a => a.alertType === "below_min_score").length).toBe(1);
    const second = detector.check("site-1", 0.3, db, { windowSize: 5, minScore: 0.5 });
    // Same score — should deduplicate
    const secondAlerts = second.filter(a => a.alertType === "below_min_score");
    expect(secondAlerts.length).toBe(0);
  });

  it("returns no alerts when score is healthy", () => {
    const detector = new AnomalyDetector();
    db.exec("DELETE FROM score_history");
    for (let i = 0; i < 6; i++) {
      db.prepare("INSERT INTO score_history (site_id, score, analyzed_at) VALUES (?, ?, ?)").run("site-1", 0.85, 1000 + i);
    }
    const result = detector.check("site-1", 0.82, db, { windowSize: 5, minScore: 0.5, maxDropPercent: 20 });
    expect(result).toEqual([]);
  });

  it("re-alerts when score changes after dedup", () => {
    const detector = new AnomalyDetector();
    db.exec("DELETE FROM score_history");
    for (let i = 0; i < 6; i++) {
      db.prepare("INSERT INTO score_history (site_id, score, analyzed_at) VALUES (?, ?, ?)").run("site-1", 0.9, 1000 + i);
    }
    detector.check("site-1", 0.3, db, { windowSize: 5, minScore: 0.5 });
    const second = detector.check("site-1", 0.25, db, { windowSize: 5, minScore: 0.5 });
    const alerts = second.filter(a => a.alertType === "below_min_score");
    expect(alerts.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npx vitest run tests/infrastructure/anomaly-detector.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write AnomalyDetector implementation**

```typescript
// src/infrastructure/anomaly-detector.ts
import type Database from "better-sqlite3";

export interface AlertResult {
  siteId: string;
  alertType: "below_min_score" | "relative_drop";
  currentScore: number;
  previousAvg: number;
  threshold: number;
  dropPercent?: number;
  timestamp: number;
}

export interface AnomalyConfig {
  minScore: number;
  maxDropPercent: number;
  windowSize: number;
}

const lastAlerts = new Map<string, { score: number; type: string }>();

export class AnomalyDetector {
  check(siteId: string, currentScore: number, db: Database.Database, config: AnomalyConfig): AlertResult[] {
    const windowSize = Math.max(2, config.windowSize);
    const minScore = Math.max(0, Math.min(1, config.minScore));
    const maxDrop = Math.max(0, config.maxDropPercent);

    const rows = db.prepare(
      "SELECT score FROM score_history WHERE site_id = ? ORDER BY analyzed_at DESC LIMIT ?"
    ).all(siteId, windowSize) as { score: number }[];

    if (rows.length < windowSize) return [];

    const previousAvg = rows.reduce((sum, r) => sum + r.score, 0) / rows.length;
    const dropPercent = previousAvg > 0 ? ((previousAvg - currentScore) / previousAvg) * 100 : 0;
    const results: AlertResult[] = [];

    if (currentScore < minScore) {
      const key = `${siteId}:below_min_score`;
      const last = lastAlerts.get(key);
      if (!last || last.score !== currentScore) {
        lastAlerts.set(key, { score: currentScore, type: "below_min_score" });
        results.push({
          siteId, alertType: "below_min_score", currentScore, previousAvg,
          threshold: minScore, timestamp: Date.now(),
        });
      }
    }

    if (dropPercent > maxDrop) {
      const key = `${siteId}:relative_drop`;
      const last = lastAlerts.get(key);
      if (!last || last.score !== currentScore) {
        lastAlerts.set(key, { score: currentScore, type: "relative_drop" });
        results.push({
          siteId, alertType: "relative_drop", currentScore, previousAvg,
          threshold: maxDrop, dropPercent, timestamp: Date.now(),
        });
      }
    }

    return results;
  }
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `npx vitest run tests/infrastructure/anomaly-detector.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/anomaly-detector.ts tests/infrastructure/anomaly-detector.test.ts
git commit -m "feat: add AnomalyDetector for score regression detection"
```

---

### Task 3: MonitorService

**Files:**
- Create: `src/infrastructure/monitor-service.ts`
- Test: `tests/infrastructure/monitor-service.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// tests/infrastructure/monitor-service.test.ts
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import Database from "better-sqlite3";
import * as fs from "fs";
import { EventBus } from "../../src/core/event-bus";
import { ScoringEngine } from "../../src/infrastructure/scoring-engine";
import { MonitorService } from "../../src/infrastructure/monitor-service";

describe("MonitorService", () => {
  const dbPath = "/tmp/test-monitor-service.db";
  let db: Database.Database;

  beforeAll(() => {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    db = new Database(dbPath);
    db.exec(`
      CREATE TABLE IF NOT EXISTS score_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        site_id TEXT NOT NULL,
        post_id TEXT,
        score REAL NOT NULL,
        component_scores TEXT,
        analyzed_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_score_history_site ON score_history(site_id, analyzed_at);
    `);
  });

  afterAll(() => {
    db.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  it("stores scores in history table", async () => {
    const bus = new EventBus();
    const sc = new ScoringEngine();
    const pool = { getClient: vi.fn().mockReturnValue({ getPosts: vi.fn().mockResolvedValue([]) }) } as any;
    const webhook = { dispatch: vi.fn() } as any;
    const service = new MonitorService(db, bus, sc, pool, webhook);

    db.exec("DELETE FROM score_history");
    await service.runCycle(["site-1"]);

    const rows = db.prepare("SELECT * FROM score_history").all();
    expect(rows.length).toBe(1);
    expect((rows as any[])[0].site_id).toBe("site-1");
  });

  it("emits cycle-complete event", async () => {
    const bus = new EventBus();
    const sc = new ScoringEngine();
    const pool = { getClient: vi.fn().mockReturnValue({ getPosts: vi.fn().mockResolvedValue([]) }) } as any;
    const webhook = { dispatch: vi.fn() } as any;
    const service = new MonitorService(db, bus, sc, pool, webhook);

    const events: string[] = [];
    bus.on("monitor:cycle-complete", (e) => events.push(e.type));

    db.exec("DELETE FROM score_history");
    await service.runCycle(["site-1"]);

    expect(events).toContain("monitor:cycle-complete");
  });

  it("scores posts and stores per-post entries", async () => {
    const bus = new EventBus();
    const sc = new ScoringEngine();
    const mockPosts = [
      { id: 1, title: "Test", content: "a".repeat(200), yoast_head_json: {} },
      { id: 2, title: "", content: "short", yoast_head_json: null },
    ];
    const pool = { getClient: vi.fn().mockReturnValue({ getPosts: vi.fn().mockResolvedValue(mockPosts) }) } as any;
    const webhook = { dispatch: vi.fn() } as any;
    const service = new MonitorService(db, bus, sc, pool, webhook);

    db.exec("DELETE FROM score_history");
    await service.runCycle(["site-1"]);

    const rows = db.prepare("SELECT * FROM score_history ORDER BY id").all() as any[];
    // 2 per-post entries + 1 site aggregate
    expect(rows.length).toBe(3);
    expect(rows[0].post_id).toBe("1");
    expect(rows[1].post_id).toBe("2");
    expect(rows[2].post_id).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npx vitest run tests/infrastructure/monitor-service.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write MonitorService implementation**

```typescript
// src/infrastructure/monitor-service.ts
import Database from "better-sqlite3";
import { EventBus } from "../core/event-bus";
import { ScoringEngine } from "./scoring-engine";
import { AnomalyDetector } from "./anomaly-detector";
import type { SitePool } from "../services/wordpress/site-pool";
import type { WebhookDispatcher } from "./webhook-dispatcher";

export class MonitorService {
  private db: Database.Database;
  private bus: EventBus;
  private scoringEngine: ScoringEngine;
  private pool: SitePool;
  private webhook: WebhookDispatcher;
  private detector: AnomalyDetector;

  constructor(
    db: Database.Database,
    bus: EventBus,
    scoringEngine: ScoringEngine,
    pool: SitePool,
    webhook: WebhookDispatcher,
  ) {
    this.db = db;
    this.bus = bus;
    this.scoringEngine = scoringEngine;
    this.pool = pool;
    this.webhook = webhook;
    this.detector = new AnomalyDetector();
  }

  async runCycle(siteIds: string[]): Promise<void> {
    const now = Date.now();

    for (const siteId of siteIds) {
      try {
        this.bus.emit("monitor:cycle-start", { siteId });

        const client = this.pool.getClient(siteId);
        const posts = await client.getPosts() as any[];
        const insertPost = this.db.prepare(
          "INSERT INTO score_history (site_id, post_id, score, component_scores, analyzed_at) VALUES (?, ?, ?, ?, ?)"
        );
        const insertSite = this.db.prepare(
          "INSERT INTO score_history (site_id, score, component_scores, analyzed_at) VALUES (?, ?, ?, ?)"
        );

        let totalScore = 0;

        for (const post of posts) {
          const postId = post.id ?? post.ID;
          const score = this.scoringEngine.score({
            meta: { score: post.yoast_head_json ? 0.8 : 0.3 },
            content: { score: (post.content?.length || 0) > 100 ? 0.8 : 0.3 },
            technical: { score: post.title ? 0.7 : 0.4 },
          });
          totalScore += score.overall;

          insertPost.run(siteId, String(postId), score.overall, JSON.stringify(score.components ?? {}), now);
        }

        const siteScore = posts.length > 0 ? totalScore / posts.length : 0;
        insertSite.run(siteId, siteScore, JSON.stringify({}), now);

        const alerts = this.detector.check(siteId, siteScore, this.db, {
          minScore: 0.5,
          maxDropPercent: 20,
          windowSize: 5,
        });

        for (const alert of alerts) {
          this.bus.emit("monitor:alert", alert);
          this.webhook.dispatch(siteId, "monitor:alert", alert).catch(() => {});
        }

        this.bus.emit("monitor:cycle-complete", { siteId, siteScore, postsScored: posts.length });
      } catch (err) {
        console.error(`[MonitorService] Cycle failed for ${siteId}:`, err);
      }
    }
  }
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `npx vitest run tests/infrastructure/monitor-service.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/monitor-service.ts tests/infrastructure/monitor-service.test.ts
git commit -m "feat: add MonitorService for scheduled SEO monitoring"
```

---

### Task 4: Monitor MCP Plugin (tools)

**Files:**
- Create: `src/plugins/monitoring/index.ts`
- Test: `tests/plugins/monitoring.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// tests/plugins/monitoring.test.ts
import { describe, it, expect, vi } from "vitest";
import { createMonitoringPlugin } from "../../src/plugins/monitoring/index";

function makeService(): any {
  return {
    runCycle: vi.fn().mockResolvedValue(undefined),
  };
}

describe("MonitoringPlugin", () => {
  it("returns monitor-status tool", () => {
    const plugin = createMonitoringPlugin(makeService(), {} as any);
    const tool = plugin.tools.find(t => t.name === "monitor-status");
    expect(tool).toBeDefined();
    expect(tool?.inputSchema).toBeDefined();
  });

  it("returns monitor-history tool", () => {
    const plugin = createMonitoringPlugin(makeService(), {} as any);
    const tool = plugin.tools.find(t => t.name === "monitor-history");
    expect(tool).toBeDefined();
  });

  it("returns monitor-configure tool", () => {
    const plugin = createMonitoringPlugin(makeService(), {} as any);
    const tool = plugin.tools.find(t => t.name === "monitor-configure");
    expect(tool).toBeDefined();
  });

  it("returns monitor-alerts tool", () => {
    const plugin = createMonitoringPlugin(makeService(), {} as any);
    const tool = plugin.tools.find(t => t.name === "monitor-alerts");
    expect(tool).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npx vitest run tests/plugins/monitoring.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the monitoring plugin**

```typescript
// src/plugins/monitoring/index.ts
import { z } from "zod";
import Database from "better-sqlite3";
import type { ToolPlugin } from "../../orchestrator.js";
import type { MonitorService } from "../../infrastructure/monitor-service.js";

interface AlertRow {
  id: number;
  site_id: string;
  alert_type: string;
  current_score: number;
  previous_avg: number;
  threshold: number;
  created_at: number;
}

export function createMonitoringPlugin(service: MonitorService, db: Database.Database): ToolPlugin {
  return {
    id: "monitoring",
    tools: [
      {
        name: "monitor-status",
        description: "Show current SEO health status for a site",
        inputSchema: z.object({
          siteId: z.string().describe("WordPress site name"),
        }),
        handler: async (args) => {
          const latest = db.prepare(
            "SELECT score, analyzed_at FROM score_history WHERE site_id = ? AND post_id IS NULL ORDER BY analyzed_at DESC LIMIT 1"
          ).get(args.siteId) as { score: number; analyzed_at: number } | undefined;

          const recent = db.prepare(
            "SELECT score FROM score_history WHERE site_id = ? AND post_id IS NULL ORDER BY analyzed_at DESC LIMIT 5"
          ).all(args.siteId) as { score: number }[];

          let trend: string;
          if (!latest || recent.length < 2) {
            trend = "insufficient_data";
          } else {
            const sorted = recent.map(r => r.score);
            const first = sorted[sorted.length - 1];
            const last = sorted[0];
            const diff = last - first;
            trend = diff > 0.02 ? "up" : diff < -0.02 ? "down" : "flat";
          }

          return {
            success: true,
            data: {
              latestScore: latest?.score ?? null,
              analyzedAt: latest?.analyzed_at ?? null,
              trend,
            },
          };
        },
      },
      {
        name: "monitor-history",
        description: "Get score history for a site",
        inputSchema: z.object({
          siteId: z.string(),
          limit: z.number().min(1).max(100).default(20),
        }),
        handler: async (args) => {
          const rows = db.prepare(
            "SELECT score, component_scores, analyzed_at FROM score_history WHERE site_id = ? AND post_id IS NULL ORDER BY analyzed_at DESC LIMIT ?"
          ).all(args.siteId, args.limit) as { score: number; component_scores: string; analyzed_at: number }[];

          return {
            success: true,
            data: {
              entries: rows.map(r => ({
                score: r.score,
                componentScores: JSON.parse(r.component_scores || "{}"),
                analyzedAt: r.analyzed_at,
              })),
            },
          };
        },
      },
      {
        name: "monitor-configure",
        description: "Configure monitoring thresholds for a site",
        inputSchema: z.object({
          siteId: z.string(),
          minScore: z.number().min(0).max(1).optional(),
          maxDropPercent: z.number().min(0).max(100).optional(),
          windowSize: z.number().min(2).max(50).optional(),
          webhookUrl: z.string().url().optional(),
        }),
        handler: async (args) => {
          const existing = db.prepare("SELECT * FROM monitor_config WHERE site_id = ?").get(args.siteId) as any;
          if (existing) {
            db.prepare(
              "UPDATE monitor_config SET min_score = COALESCE(?, min_score), max_drop_percent = COALESCE(?, max_drop_percent), window_size = COALESCE(?, window_size), webhook_url = COALESCE(?, webhook_url) WHERE site_id = ?"
            ).run(args.minScore ?? null, args.maxDropPercent ?? null, args.windowSize ?? null, args.webhookUrl ?? null, args.siteId);
          } else {
            db.prepare(
              "INSERT INTO monitor_config (site_id, min_score, max_drop_percent, window_size, webhook_url) VALUES (?, ?, ?, ?, ?)"
            ).run(args.siteId, args.minScore ?? 0.5, args.maxDropPercent ?? 20, args.windowSize ?? 5, args.webhookUrl ?? null);
          }
          return { success: true, data: { siteId: args.siteId, configured: true } };
        },
      },
      {
        name: "monitor-alerts",
        description: "List recent monitoring alerts for a site",
        inputSchema: z.object({
          siteId: z.string().optional(),
          limit: z.number().min(1).max(100).default(50),
        }),
        handler: async (args) => {
          let rows: AlertRow[];
          if (args.siteId) {
            rows = db.prepare(
              "SELECT * FROM monitor_alerts WHERE site_id = ? ORDER BY created_at DESC LIMIT ?"
            ).all(args.siteId, args.limit) as AlertRow[];
          } else {
            rows = db.prepare(
              "SELECT * FROM monitor_alerts ORDER BY created_at DESC LIMIT ?"
            ).all(args.limit) as AlertRow[];
          }
          return { success: true, data: { alerts: rows } };
        },
      },
    ],
  };
}
```

Note: The `monitor-alerts` tool references a `monitor_alerts` table. This table is populated by the MonitorService when the AnomalyDetector returns alerts. The v8 migration needs to be updated to include this table.

- [ ] **Step 4: Update v8 migration to include monitor_alerts table**

Add to the migration SQL:
```sql
CREATE TABLE IF NOT EXISTS monitor_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id TEXT NOT NULL,
  alert_type TEXT NOT NULL,
  current_score REAL NOT NULL,
  previous_avg REAL NOT NULL,
  threshold REAL NOT NULL,
  drop_percent REAL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_monitor_alerts_site ON monitor_alerts(site_id, created_at);
```

- [ ] **Step 5: Update MonitorService to persist alerts**

In `src/infrastructure/monitor-service.ts`, add an insert after detecting alerts:

```typescript
// After the detector.check() call:
const insertAlert = this.db.prepare(
  "INSERT INTO monitor_alerts (site_id, alert_type, current_score, previous_avg, threshold, drop_percent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
);
for (const alert of alerts) {
  insertAlert.run(alert.siteId, alert.alertType, alert.currentScore, alert.previousAvg, alert.threshold, alert.dropPercent ?? null, now);
}
```

- [ ] **Step 6: Run tests — expect PASS**

Run: `npx vitest run tests/plugins/monitoring.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 7: Commit**

```bash
git add src/plugins/monitoring/index.ts tests/plugins/monitoring.test.ts src/migrations/v8_create_monitor_tables.ts src/infrastructure/monitor-service.ts
git commit -m "feat: add monitoring MCP plugin with status/history/configure/alert tools"
```

---

### Task 5: Wire into index.ts + verification

**Files:**
- Modify: `src/index.ts`
- Modify: `src/infrastructure/monitor-service.ts`

- [ ] **Step 1: Add MonitorService startup to index.ts**

After the existing `actionDispatcher` creation, add:

```typescript
// After: const rulesEngine = new RulesEngine(db, eventBus, actionDispatcher);
import { MonitorService } from './infrastructure/monitor-service.js';
import { createMonitoringPlugin } from './plugins/monitoring/index.js';

const monitorService = new MonitorService(db, eventBus, scoringEngine, sitePool, webhookDispatcher);

// Start monitoring cycle every 30 minutes
jobScheduler.schedule("monitor-cycle", "low", 30 * 60 * 1000, {});
```

Register the plugin:
```typescript
// After: registry.register(createMultiSitePlugin(...));
registry.register(createMonitoringPlugin(monitorService, db));
```

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit 2>&1`
Expected: only the pre-existing `StorageEngine` error

- [ ] **Step 3: Run all tests**

Run: `npx vitest run 2>&1 | tail -15`
Expected: all tests pass

- [ ] **Step 4: Run build**

Run: `npm run build`
Expected: Build success

- [ ] **Step 5: Commit and push**

```bash
git add -A && git commit -m "feat: wire MonitorService into index.ts with 30-min cycle" && git push
```
