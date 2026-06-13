# Phase 3A: Auto-Healing Pipeline Design

## Overview

Wire the RulesEngine to actually execute actions through a new `ActionDispatcher`. Auto-heal low-scoring posts automatically (post-level on event) and run site-wide healing sweeps (site-level on schedule).

## Architecture

```
[Event Bus] → [RulesEngine] → [ActionDispatcher] → [batch-analyze / batch-apply / single-post apply]
                                  ↕
                            [PriorityQueue]  ← site-level jobs
                                  ↕
                            [CircuitBreaker] ← per-site failure gating
                                  ↕
                            [LockManager]    ← per-post concurrency guard
```

## Components

### ActionDispatcher (`src/infrastructure/action-dispatcher.ts`)

Injected into `RulesEngine` to bridge event matching → tool execution.

```typescript
interface HealResult {
  postId: string | number;
  siteId: string;
  rounds: number;
  finalScore: number;
  success: boolean;
  error?: string;
}

interface HealSummary {
  siteId: string;
  postsHealed: number;
  postsFailed: number;
  totalRounds: number;
}
```

Methods:
- `healPost(siteId, postId, dryRun?)` → `Promise<HealResult>`
  - Loop: analyze → if score < 0.7 → apply meta fix → reverify → if still low → apply content fix → reverify → if still low → apply technical fix → reverify
  - Max 3 rounds. Track via `Map<siteId:postId, number>`.
  - If score drops between rounds → abort with `heal:failed`.
  - Check `CircuitBreaker.isAllowed()` before dispatching.
  - Acquire `LockManager` lock per `siteId:postId` — skip if locked.
  - On success: `circuitBreaker.onSuccess()`. On failure: `circuitBreaker.onFailure()`.

- `healSite(siteId, sync?)` → `Promise<{ jobsEnqueued: number } | HealSummary>`
  - If `sync: true`: run batch-apply synchronously, return summary.
  - If `sync: false` (default): enqueue `batch-apply` job to `PriorityQueue`, return count.

### Action Types

Add to `RuleAction.type` union:
- `"heal-post"` — trigger per-post healing
- `"heal-site"` — trigger site-wide healing

### RulesEngine Changes

`dispatchAction()` now calls `ActionDispatcher` instead of `console.log`:

```typescript
private dispatchAction(action, event): void {
  switch (action.type) {
    case "heal-post":
      this.dispatcher.healPost(event.metadata.siteId!, action.params.postId, action.params.dryRun);
      break;
    case "heal-site":
      this.dispatcher.healSite(event.metadata.siteId!, action.params.sync);
      break;
    case "log":
      console.log(`[RulesEngine] Triggered log by event ${event.type}`);
      break;
    // batch-analyze, batch-apply, multi-site variants, webhook handled by tool registration
  }
}
```

### Heal Plugin (`src/plugins/orchestration/heal.ts`)

Two MCP tools for manual triggering:
- `heal-post` — params: `siteId`, `postId`, `dryRun?`
- `heal-site` — params: `siteId`, `sync?`

## Error Handling

| Concern | Mitigation |
|---------|-----------|
| Infinite loops | Max 3 rounds per post, tracked in-memory `Map<string, number>` |
| Circuit breaker | `isAllowed()` check before each heal dispatch |
| Concurrent heals | `LockManager` per `siteId:postId` |
| Score regression | Compare each round; if dropped, abort |
| No posts to heal | `healSite` returns `{ postsHealed: 0 }` no-op |
| Dry-run | Analyze without applying, return would-fix report |

## Files

- Create: `src/infrastructure/action-dispatcher.ts`
- Create: `src/plugins/orchestration/heal.ts`
- Create: `tests/infrastructure/action-dispatcher.test.ts`
- Create: `tests/plugins/orchestration/heal.test.ts`
- Modify: `src/infrastructure/rules-engine.ts` — wire dispatcher, add heal action types
- Modify: `src/index.ts` — initialize dispatcher, wire into RulesEngine, register heal plugin

## Testing

**action-dispatcher.test.ts** (6 tests):
1. `healPost` dispatches analyze → apply → reverify loop
2. Stops after 3 rounds (round limit)
3. Respects circuit breaker when open
4. Aborts on score regression
5. dry-run returns report without applying
6. `healSite` enqueues batch-apply job

**heal.test.ts** (2 tests):
1. Event bus emits heal lifecycle events
2. Lock manager prevents concurrent heals
