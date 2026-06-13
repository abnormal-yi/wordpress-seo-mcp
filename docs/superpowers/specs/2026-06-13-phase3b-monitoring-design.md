# Phase 3B: SEO Performance Monitoring

## Overview

Proactive SEO performance monitoring with trend tracking and anomaly detection. Periodically scores all sites, stores time-series history, and alerts on regressions.

## Architecture

```
[JobScheduler] → [MonitorService] → [ScoringEngine] → [score_history table]
                                       ↓
                              [AnomalyDetector] → detects drops
                                       ↓
                              [EventBus] → [WebhookDispatcher]
```

## Data Model

### `score_history` table (v8 migration)

```sql
CREATE TABLE score_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id TEXT NOT NULL,
  post_id TEXT,
  score REAL NOT NULL,
  component_scores TEXT,
  analyzed_at INTEGER NOT NULL
);
CREATE INDEX idx_score_history_site ON score_history(site_id, analyzed_at);
CREATE INDEX idx_score_history_post ON score_history(post_id, analyzed_at);
```

- `post_id` is NULL for site-level aggregate scores, non-null for per-post detail
- `component_scores` is JSON: `{"meta": 0.8, "content": 0.6, "technical": 0.7}`

### `monitor_config` table (v8 migration)

```sql
CREATE TABLE monitor_config (
  site_id TEXT PRIMARY KEY,
  min_score REAL NOT NULL DEFAULT 0.5,
  max_drop_percent REAL NOT NULL DEFAULT 20,
  window_size INTEGER NOT NULL DEFAULT 5,
  webhook_url TEXT
);
```

## Components

### MonitorService (`src/infrastructure/monitor-service.ts`)

Constructor dependencies:
- `Database` (better-sqlite3)
- `EventBus`
- `ScoringEngine`
- `SitePool`
- `WebhookDispatcher`
- `JobScheduler`

**`start()`** — Registers a recurring job via `jobScheduler.schedule("monitor-cycle", "low", intervalMs)`.

**`runCycle()`** — Core logic:
1. Query all configured sites from SitePool or `monitor_config`
2. For each site, fetch posts via `pool.getClient(siteId).getPosts()`
3. Score each post using `ScoringEngine.score()`
4. Compute site aggregate (mean of post scores)
5. Store both per-post and site-aggregate rows in `score_history`
6. Pass site aggregate to anomaly detector
7. Emit `monitor:cycle-complete` event with summary

### AnomalyDetector (`src/infrastructure/anomaly-detector.ts`)

- **`check(siteId, currentScore, db)`** → `AlertResult[]`
- Reads last `window_size` aggregate scores for the site
- If fewer than `window_size` entries exist, skip (not enough data)
- Computes moving average of previous entries (excluding current)
- Checks:
  - `currentScore < minScore` → absolute threshold breach
  - `(prevAvg - currentScore) / prevAvg * 100 > maxDropPercent` → relative drop breach
- Deduplication: same `siteId:alertType` only re-fires after score changes
- Returns `{ siteId, alertType, currentScore, previousAvg, threshold, timestamp }[]`

### Event Flow

```
monitor:cycle-start  → payload: { siteId }
monitor:cycle-complete → payload: { siteId, siteScore, postsScored }
monitor:alert        → payload: { siteId, alertType, currentScore, previousAvg, dropPercent }
```

On `monitor:alert`:
- EventBus emits for internal subscribers (RulesEngine can react)
- If `webhook_url` is configured in `monitor_config`, `WebhookDispatcher.dispatch()` is called

## MCP Tools

### `monitor-status`
- Input: `siteId: string`
- Output: `{ latestScore, trend ("up"|"down"|"flat"), lastNEntries: [...], alertCount }`

### `monitor-history`
- Input: `siteId: string`, `limit?: number` (default 20)
- Output: `{ entries: [{ score, componentScores, analyzedAt }] }`

### `monitor-configure`
- Input: `siteId: string`, `minScore?: number`, `maxDropPercent?: number`, `windowSize?: number`, `webhookUrl?: string`
- Output: `{ success: true }`

### `monitor-alerts`
- Input: `siteId?: string`, `limit?: number` (default 50)
- Output: `{ alerts: [...] }`

## Error Handling

- `runCycle()` wraps entire cycle in try/catch — one failing site doesn't block others
- `pool.getClient()` failure per site is caught and logged, cycle continues
- DB write failures are logged, cycle continues
- AnomalyDetector validation: if `window_size` < 2, default to 5. If `min_score` out of [0,1], clamp.

## Testing

- `MonitorService` unit tests with mocked SitePool + ScoringEngine + EventBus
- `AnomalyDetector` unit tests: threshold breach, relative drop, deduplication, insufficient data
- Integration test: full cycle with in-memory SQLite, fake posts, verify history table populated
- MCP tool tests via mocked `MonitorService`

## Migration

V8 migration creates `score_history` and `monitor_config` tables.
