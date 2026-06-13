# Phase 2: Multi-Tool Orchestration & Rules Engine

## Overview

Surface the Phase 1 infrastructure (workflows, queues, event bus, scoring, snaphots) as composable batch tools and an automated rules engine. Users can analyze/fix all posts on one or many sites, and configure event-driven or scheduled automation.

---

## Section 1: Batch Tools

### `batch-analyze`

Analyze all (or filtered) posts on a site.

- **Params:** `siteId` (required), `postType` (optional, filter by post type), `plugins` (optional, list of analyzer plugins to run)
- **Behavior:**
  - Iterates posts via WP client
  - Emits `analysis:start` / `analysis:complete` / `analysis:failed` per post
  - Aggregates scores via `ScoringEngine`
  - Creates a `Snapshot` with results
- **Output:** `{ success, totalPosts, passed, failed, overallScore, snapshotId }`

### `batch-apply`

Apply fixes to all (or filtered) posts on a site.

- **Params:** `siteId`, `postType` (optional), `plugins` (optional), `dryRun` (boolean, default false)
- **Behavior:**
  - Creates snapshot BEFORE applying (rollback point)
  - Iterates posts through retry pipeline + circuit breaker per-post
  - Emits `apply:start` / `apply:complete` / `apply:rollback` per post
- **Output:** `{ success, totalPosts, applied, failed, snapshotId }`

### `multi-site-analyze`

Run batch-analyze across multiple sites in parallel.

- **Params:** `siteIds` (array), `postType` (optional), `plugins` (optional)
- **Concurrency:** Respects `PriorityQueue` lane concurrency limits
- **Output:** `{ success, results: { [siteId]: batchResult } }`

### `multi-site-apply`

Rollout with canary: apply to one site first, wait for score confirmation, then roll out to the rest.

- **Params:** `siteIds` (array, first = canary), `postType` (optional), `plugins` (optional), `minScore` (confirmation threshold, default 0.7)
- **Behavior:**
  - Applies to canary site
  - Runs batch-analyze on canary; if `overallScore >= minScore`, proceeds to remaining sites
  - If canary fails, emits alert and stops
- **Output:** `{ success, canaryResult, rolloutResults }`

---

## Section 2: Rules Engine

### Architecture

```
[Event Bus] → [RulesEngine] → [Condition Check] → [Action Execution]
                                          ↕
                                    [DB: automation_rules]
```

### Rule Model

```typescript
interface Rule {
  id: string;
  name: string;
  enabled: boolean;
  trigger: {
    type: "event" | "schedule";
    pattern?: string;    // event type pattern (e.g. "site:post-published")
    cron?: string;       // cron expression for scheduled rules
  };
  condition?: {
    field: string;       // dot-path into event payload or context
    operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte";
    value: unknown;
  };
  action: {
    type: "batch-analyze" | "batch-apply" | "multi-site-analyze" | "multi-site-apply" | "webhook" | "log";
    params: Record<string, unknown>;
  };
}
```

### Built-in Rules (Optional, Configurable)

| Name | Trigger | Condition | Action |
|---|---|---|---|
| Auto-fix on publish | `event: site:post-published` | site score < 0.7 | `batch-apply` on that post |
| Weekly audit | `schedule: 0 6 * * 1` | none | `multi-site-analyze` |
| Score drop alert | `event: analysis:complete` | score < prev score - 0.1 | `webhook` + audit log |

### Storage

Migration v7: `automation_rules` table with `id TEXT PK`, `name TEXT`, `enabled INT`, `trigger_json TEXT`, `condition_json TEXT`, `action_json TEXT`, `created_at INT`, `updated_at INT`.

---

## Section 3: Implementation Plan

### Task 1: Migration v7 — automation_rules table
- Add migration to `migration-runner.ts`
- Create `automation_rules` table

### Task 2: RulesEngine
- `src/infrastructure/rules-engine.ts`
- Event matching, condition evaluation, action dispatch
- Load rules from DB at startup
- CRUD tools: `automation-add-rule`, `automation-list-rules`, `automation-remove-rule`

### Task 3: batch-analyze tool
- `src/plugins/orchestration/batch-analyze.ts`
- Iterate posts, emit per-post events, aggregate scoring

### Task 4: batch-apply tool
- `src/plugins/orchestration/batch-apply.ts`
- Snapshot before, retry + circuit breaker per post

### Task 5: multi-site variants
- `src/plugins/orchestration/multi-site.ts`
- Canary rollout logic

### Task 6: Schedule integration
- Wire cron rules into existing `JobScheduler`
- On scheduler tick, check for due rules and queue them

### Task 7: Wire into index.ts + tests
- Register new tools
- Integration tests for batch + rules
- Full regression

---

## Files

```
src/infrastructure/rules-engine.ts          (new)
src/plugins/orchestration/batch-analyze.ts   (new)
src/plugins/orchestration/batch-apply.ts     (new)
src/plugins/orchestration/multi-site.ts      (new)
src/infrastructure/migration-runner.ts       (edit — add v7)
src/index.ts                                 (edit — register tools)
tests/infrastructure/rules-engine.test.ts    (new)
tests/plugins/orchestration/*.test.ts        (new)
```
