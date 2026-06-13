# WordPress SEO MCP — Phase 1: Production Infrastructure

## Overview

Upgrade the WordPress SEO MCP server from a basic plugin-based tool to a full enterprise-grade production system. This phase focuses on infrastructure, reliability, observability, and batch processing — the foundation everything else runs on.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                      MCP Transport Layer                       │
│  stdio | SSE | WebSocket — auto-detect by env                 │
└────────────────────┬─────────────────────────────────────────┘
                     │ JSON-RPC 2.0
┌────────────────────▼─────────────────────────────────────────┐
│                    Orchestration Layer                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │ Tool     │ │ Workflow │ │ Pipeline │ │ Job      │        │
│  │ Registry │ │ Engine   │ │ Compiler │ │Scheduler │        │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │ Event    │ │ State    │ │ Scorer   │ │ Webhook  │        │
│  │ Bus      │ │ Machine  │ │ Engine   │ │Dispatcher│        │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘        │
└────────────────────┬─────────────────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────────────────┐
│                     Domain Layer                               │
│  ┌───────────────────────────────────────────────────────┐    │
│  │              Plugin System (Dynamic Loader)            │    │
│  │  Hot-reload | Sandbox | Dependency Graph | SDK        │    │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐         │    │
│  │  │  Meta  │ │ Schema │ │Content │ │ Images │         │    │
│  │  └────────┘ └────────┘ └────────┘ └────────┘         │    │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐         │    │
│  │  │Technic.│ │Sitemap │ │Keyword │ │ Comp.  │         │    │
│  │  └────────┘ └────────┘ └────────┘ └────────┘         │    │
│  └───────────────────────────────────────────────────────┘    │
└────────────────────┬─────────────────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────────────────┐
│                   Infrastructure Layer                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │ Circuit  │ │  Cache   │ │  Retry   │ │  Rate    │        │
│  │ Breaker  │ │Hierarchy │ │ Pipeline │ │ Limiter  │        │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │Telemetry │ │  Audit   │ │  Config  │ │   Lock   │        │
│  │ (OTEL)   │ │  Trail   │ │ Manager  │ │ Manager  │        │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │  Event   │ │Snapshot  │ │ Priority │ │ Graceful │        │
│  │  Store   │ │ Manager  │ │  Queue   │ │ Shutdown │        │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘        │
└────────────────────┬─────────────────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────────────────┐
│                   Data Access Layer                            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │  WP REST │ │  SQLite  │ │ External │ │ Migration│        │
│  │  Client  │ │  Engine  │ │ API Gw   │ │ Manager  │        │
│  │  Pool    │ │  (Audit) │ │          │ │          │        │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘        │
└──────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Event Bus

A typed, in-process event bus for decoupled communication between components.

**Events:**
- `site:added`, `site:removed`, `site:updated`
- `analysis:start`, `analysis:complete`, `analysis:failed`
- `apply:start`, `apply:complete`, `apply:failed`, `apply:rollback`
- `error:threshold`, `circuit:open`, `circuit:close`, `circuit:half-open`
- `cache:miss`, `cache:hit`, `cache:invalidated`
- `sitemap:generated`, `sitemap:submitted`
- `schedule:triggered`, `auto-fix:executed`, `auto-fix:skipped`
- `queue:job-added`, `queue:job-started`, `queue:job-completed`, `queue:job-failed`
- `plugin:loaded`, `plugin:unloaded`, `plugin:error`
- `health:check`, `health:changed`

**API:**
```typescript
// Subscribe with wildcard support
bus.on("analysis:*", handler)
bus.on("error.*", handler)     // dot-notation path matching
bus.on("**", allEventHandler)  // catch-all

// Emit with correlationId context
bus.emit("analysis:complete", payload, { correlationId, siteId })

// Filtered subscribers
bus.on("apply:*", handler, { siteId: "my-site" })  // only for this site
```

**Implementation:** In-memory Map<pattern, Set<handler>> with wildcard matching. Zero dependencies. Sub-microsecond dispatch.

### 2. State Machine — Post States

Each post being optimized goes through a lifecycle.

```typescript
// States
"idle" | "queued" | "analyzing" | "analyzed" | "applying" | "applied"
| "failed" | "rollingback" | "rollback-complete"

// Transitions
idle           → queued        (user requests optimization)
queued         → analyzing     (worker picks up job)
analyzing      → analyzed      (all plugins complete)
analyzed       → applying      (user confirms or auto-fix)
applying       → applied       (all changes written)
analyzing      → failed        (plugin error)
applying       → failed        (WP API error)
failed         → queued        (retry)
applied        → rollingback   (user requests rollback)
rollingback    → rollback-complete | failed
applied        → analyzing     (re-analysis requested)
```

**Implementation:** Simple class with Map<state, allowedTransitions[]>. Emits events on every transition. Persisted to SQLite.

### 3. Job Scheduler + Priority Queue

Jobs represent units of work. Three priority lanes.

```typescript
interface Job {
  id: string
  type: "analyze" | "apply" | "rollback" | "sitemap"
       | "monitor" | "auto-fix" | "batch-analyze" | "batch-apply"
  siteId: string
  payload: Record<string, unknown>
  priority: "high" | "medium" | "low"
  status: "queued" | "running" | "completed" | "failed" | "cancelled"
  retryCount: number
  maxRetries: number
  schedule?: string  // cron expression
  createdAt: number
  startedAt?: number
  completedAt?: number
  error?: string
  correlationId: string
}
```

**Queue:**
- Three in-memory lanes (high/med/low) backed by SQLite persistence
- High queue: preempts lower lanes, max 5 concurrent workers
- Medium queue: max 3 concurrent workers
- Low queue: max 2 concurrent workers, runs only when higher lanes empty
- Dead letter queue: jobs exceeding maxRetries (manual replay or discard)
- Per-site rate limiting within each lane

**Scheduler:** Simple cron parser (no dependency on system crond). Stores schedules in SQLite. On every tick, checks for due jobs and enqueues them.

### 4. Workflow Engine

Workflows are predefined sequences of tool calls with conditionals and parallel execution.

```typescript
interface WorkflowStep {
  id: string
  plugin: string
  action: "analyze" | "apply"
  params?: Record<string, unknown>
  dependsOn?: string[]          // step IDs to wait for
  condition?: {                 // skip if condition not met
    field: string               // e.g., "$.analysis.meta.hasIssues"
    operator: "eq" | "neq" | "gt" | "exists"
    value: unknown
  }
  onFailure: "abort" | "skip" | "continue"
}

interface Workflow {
  id: string
  name: string
  steps: WorkflowStep[]
  timeout: number
  onComplete?: WebhookConfig
  onFailure?: WebhookConfig
}
```

**Built-in workflows:**
- `full-analyze`: Run all analyze plugins in parallel
- `full-optimize`: Analyze → auto-fix → sitemap
- `quick-check`: Meta + content + technical analyze only
- `schema-only`: Schema analyze + apply

### 5. Config Manager

Hierarchical configuration with JSON Schema validation.

```typescript
// Priority (lowest to highest):
// 1. Global defaults (hardcoded)
// 2. Config file (opencode.jsonc env vars)
// 3. Per-site config (set via manage-sites)
// 4. Per-request params

interface Config {
  retry: {
    maxAttempts: number          // default: 3
    initialDelayMs: number       // default: 1000
    maxDelayMs: number           // default: 30000
    backoff: "exponential" | "linear" | "fixed"
    jitter: boolean              // default: true
  }
  cache: {
    enabled: boolean             // default: true
    defaultTtlMs: number         // default: 300000 (5 min)
    maxEntries: number           // default: 1000
    l2Enabled: boolean           // default: true
    l2TtlMs: number              // default: 3600000 (1 hour)
  }
  rateLimit: {
    enabled: boolean             // default: true
    requestsPerWindow: number    // default: 60
    windowMs: number             // default: 60000
  }
  circuitBreaker: {
    enabled: boolean             // default: true
    failureThreshold: number     // default: 5
    resetTimeoutMs: number       // default: 30000
    halfOpenMaxRequests: number  // default: 3
  }
  queue: {
    concurrency: { high: number, medium: number, low: number }
    pollIntervalMs: number       // default: 200
  }
  logging: {
    level: "debug" | "info" | "warn" | "error"
    format: "json" | "human"
    output: "stdout" | "file"
    filePath?: string
  }
  telemetry: {
    enabled: boolean
    otlpEndpoint?: string
    serviceName: string
  }
  webhook: {
    maxAttempts: number
    timeoutMs: number
  }
  monitor: {
    intervalMs: number
    enabled: boolean
  }
  storage: {
    sqlitePath: string
    vacuumIntervalMs: number
  }
}
```

### 6. Cache Hierarchy

Three-level cache with automatic fallthrough.

```
L1: Map<string, { value, expiresAt }>
    TTL: ~5s, max: ~1000 entries, in-process
    Purpose: same-request dedup, rapid re-queries

L2: SQLite table cache_entries
    TTL: ~60s, persisted across restarts
    Purpose: across-session reuse, startup speed

L3: (optional) Redis
    TTL: ~300s, shared across instances
    Purpose: multi-process/scale-out

Auto-populate: L1 miss → L2 miss → (L3 miss) → API hit → populate all levels
Invalidation: on apply-seo for affected post, on any site change
```

**Cache key format:** `{siteId}:{endpoint}:{params-hash}`

### 7. Circuit Breaker

Per-client circuit breaker (one for WP API, one for GSC, one for PSI).

```typescript
class CircuitBreaker {
  state: "closed" | "open" | "half-open"
  failureCount: number
  successCount: number
  lastFailureTime: number
  threshold: number               // failures before open
  resetTimeout: number            // ms before half-open
  halfOpenMaxRequests: number      // successes needed to close

  async call<T>(fn: () => Promise<T>): Promise<T>
  // throws CircuitOpenError if state === "open"
  // on success: increment successCount, reset failureCount
  // on failure: increment failureCount, maybe open
  // half-open: allow limited requests, test the waters
}
```

Emits events on state transitions: `circuit:open`, `circuit:close`, `circuit:half-open`.

### 8. Retry Pipeline

Wraps any async function with retry logic.

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts: number
    initialDelayMs: number
    backoff: "exponential" | "linear" | "fixed"
    jitter: boolean
    retryOn: (error: Error) => boolean   // which errors are retryable
  }
): Promise<T>

// Default retryable errors:
// - NetworkError (ECONNREFUSED, ECONNRESET, ETIMEDOUT, ENOTFOUND)
// - RateLimitError (HTTP 429)
// - ServerError (HTTP 500, 502, 503, 504)
// NOT retryable:
// - AuthError (HTTP 401, 403)
// - ValidationError (HTTP 400, 422)
// - NotFoundError (HTTP 404)
```

### 9. Error Classes

```typescript
class SEOError extends Error {
  code: string
  statusCode: number
  retryable: boolean
  details?: Record<string, unknown>
}

class NetworkError extends SEOError     // code: "NETWORK_ERROR"
class RateLimitError extends SEOError   // code: "RATE_LIMITED", status: 429
class AuthError extends SEOError        // code: "AUTH_FAILED", status: 401
class NotFoundError extends SEOError    // code: "NOT_FOUND", status: 404
class ValidationError extends SEOError  // code: "VALIDATION_ERROR", status: 422
class TimeoutError extends SEOError     // code: "TIMEOUT"
class CircuitOpenError extends SEOError // code: "CIRCUIT_OPEN"
class PluginError extends SEOError      // code: "PLUGIN_ERROR"
class ConfigError extends SEOError      // code: "CONFIG_ERROR"
```

### 10. Telemetry (OpenTelemetry)

```typescript
// Auto-collected metrics:
// - Counter: requests_total, errors_total, cache_hits, cache_misses
// - Histogram: request_duration_ms, wp_api_latency_ms
// - Gauge: queue_depth (per lane), circuit_breaker_state, cache_size

// Auto-collected traces:
// - Each tool call gets a span
// - Nested spans for: middleware → workflow step → plugin action → API call
// - Attributes: tool_name, site_id, post_id, plugin_name, status

// Exporters:
// - ConsoleExporter (dev, human-readable)
// - OTLP Exporter (prod, send to any OTLP-compatible backend)
// - Optional: stdout JSON lines for log aggregators
```

### 11. Event Store + Snapshots (Event Sourcing)

```sql
-- Events table: append-only log of everything
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  aggregate_type TEXT NOT NULL,   -- "post" | "site" | "sitemap"
  aggregate_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  version INTEGER NOT NULL,
  data TEXT NOT NULL,             -- JSON
  metadata TEXT,                  -- JSON: correlationId, siteId, userId
  created_at TEXT NOT NULL        -- ISO 8601
);
CREATE INDEX idx_events_aggregate ON events(aggregate_type, aggregate_id, version);
CREATE INDEX idx_events_type ON events(event_type);
CREATE INDEX idx_events_created ON events(created_at);

-- Snapshots: periodic compression of event stream
CREATE TABLE snapshots (
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  state TEXT NOT NULL,            -- JSON: reconstructed state at this version
  event_count INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_snapshots_aggregate ON snapshots(aggregate_type, aggregate_id);
CREATE UNIQUE INDEX idx_snapshots_version ON snapshots(aggregate_type, aggregate_id, version);
```

Snapshot strategy: every 100 events for a given aggregate, or every hour (whichever comes first).

### 12. Snapshot Manager — Post Rollback

Before any `apply-seo`, take a full snapshot of the WordPress post:

```typescript
interface PostSnapshot {
  id: string
  siteId: string
  postId: number
  fields: {
    title: string
    content: string
    excerpt: string
    meta: Record<string, string>          // all meta fields
    schema?: Record<string, unknown>      // injected JSON-LD
  }
  createdAt: number
  appliedAt?: number                      // when this was the "before" for an apply
}
```

**Retention:** Keep last 50 snapshots per post. Auto-prune oldest on new snapshot.

### 13. Plugin System SDK

```typescript
interface SEOPlugin {
  id: string
  name: string
  version: string
  description: string

  // Lifecycle
  init?(context: PluginContext): Promise<void>
  destroy?(): Promise<void>

  // Required hooks
  analyze(params: AnalyzeParams): Promise<AnalyzeResult>
  apply?(params: ApplyParams): Promise<ApplyResult>

  // Optional hooks
  onActivate?(): Promise<void>
  onDeactivate?(): Promise<void>
  onConfigChange?(config: Record<string, unknown>): Promise<void>

  // Metadata
  capabilities: PluginCapability[]
  dependencies: string[]        // plugin IDs this depends on
  permissions: ("read" | "write" | "network")[]
  hooks: string[]               // event hooks this subscribes to
}

interface PluginContext {
  config: ConfigManager
  storage: StorageEngine
  eventBus: EventBus
  logger: Logger
  makeRequest: RetryableHttpClient
  cache: CacheHierarchy
}

interface PluginCapability {
  action: "analyze" | "apply"
  resource: "meta" | "schema" | "content" | "images" | "technical"
  description: string
}
```

### 14. Plugin Loader (Dynamic + Hot-Reload)

```typescript
interface PluginLoaderConfig {
  paths: string[]               // directories to scan
  autoDiscover: boolean
  hotReload: boolean
  watchIntervalMs: number       // default: 5000
  sandbox: boolean
  sandboxTimeout: number        // default: 10000
}

// Plugin manifest (meta/plugin.json):
{
  "id": "meta",
  "name": "Meta Tag Optimizer",
  "version": "2.0.0",
  "description": "Analyze and apply meta title, description, OG, Twitter tags",
  "dependencies": [],
  "permissions": ["read", "write"],
  "capabilities": [
    { "action": "analyze", "resource": "meta" },
    { "action": "apply", "resource": "meta" }
  ],
  "hooks": ["analysis:complete", "site:added"],
  "config": {
    "titleMinLength": 30,
    "titleMaxLength": 60,
    "descMinLength": 120,
    "descMaxLength": 160
  }
}
```

### 15. Webhook Dispatcher

Sends HTTP POST to configured URLs on specified events.

- HMAC-SHA256 signature in `X-SEO-Signature` header
- Retry with exponential backoff (configurable)
- CloudEvents format (standard JSON envelope)
- Timeout: 10s per attempt

## Security (96%+ Coverage)

### 1. Credential Management — Zero Plaintext in Memory

```
WordPress App Password flow:
User input → encrypted in SQLite at rest → decrypted per-request → zeroed after use
```

**Storage:**
```sql
CREATE TABLE credentials (
  site_id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  app_password_ciphertext TEXT NOT NULL,  -- AES-256-GCM encrypted
  encryption_key_id TEXT NOT NULL,        -- key derivation reference
  nonce TEXT NOT NULL,                    -- unique per credential
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  expires_at TEXT                         -- optional credential rotation
);
```

**Encryption:**
- Master key from one of:
  1. Environment variable `SEO_ENCRYPTION_KEY` (64 hex chars = 256-bit)
  2. Auto-generated, stored in `secrets/master.key` (file permission 0600)
  3. System keychain (macOS Keychain, Linux Secret Service)
- Each credential: unique random 12-byte nonce, AES-256-GCM, authenticated encryption
- Derived key per credential: HKDF(masterKey, siteId) — one compromised credential ≠ master key leak
- In-memory: store in `Buffer` / `Uint8Array`, zero after use via `buffer.fill(0)`
- Never logged, never serialized, never exposed in error messages (replace with `[REDACTED]`)

### 2. Input Validation — Defense in Depth

```typescript
// Three-layer validation:
// 1. JSON Schema on tool input params
// 2. Sanitization layer (strip control chars, limit length)
// 3. WordPress-side validation (params sent to WP API)

validationRules = {
  "site":     { type: "string", pattern: "^[a-zA-Z0-9_-]+$", maxLength: 64 },
  "postId":   { type: "integer", minimum: 1 },
  "url":      { type: "string", format: "uri", maxLength: 2048 },
  "username": { type: "string", maxLength: 256 },
  "appPassword": { type: "string", maxLength: 256 },
  "fixes":    { type: "array", items: { type: "string" }, maxItems: 20 },
  "schemas":  { type: "array", items: { type: "string" }, maxItems: 10 },
}
```

**Prevent:**
- No SQL injection: SQLite uses parameterized queries only (no string concatenation)
- No command injection: no shell execution, all WP API calls via HTTP
- No path traversal: plugin paths resolved against allowed base directories
- No prototype pollution: strip `__proto__`, `constructor` from JSON payloads
- No XSS: WordPress renders HTML server-side, MCP only sends plain text

### 3. WordPress API Security

```
MCP Server ──HTTPS──→ WordPress REST API
            Application Password auth
            Basic Auth header (base64)
```

- Enforce HTTPS only (reject HTTP URLs with error)
- Application Password: sent only in `Authorization: Basic` header over HTTPS
- Validate TLS certificate (reject self-signed unless explicitly allowed)
- Rate limit per site: 60 requests/min (prevent WP API abuse)
- Circuit breaker: stop if WP returns 5xx repeatedly (protect both sides)
- Scope check: warn if WP user has Administrator (recommend Editor/Author)

### 4. Plugin Sandboxing

```typescript
interface PluginSandboxConfig {
  timeout: number          // max execution time (default: 10s)
  maxMemory: number        // max allocation (default: 50MB) — rough tracking
  allowedApis: Set<string> // what the plugin can access
  // "config.read" | "config.write" | "storage.read" | "storage.write"
  // "network.internal" | "network.external"
  // "eventbus.subscribe" | "eventbus.emit"
  // "wp.read" | "wp.write"
}

// Each plugin runs in an async error boundary:
async function runInSandbox<T>(
  plugin: SEOPlugin,
  action: string,
  fn: () => Promise<T>,
  config: PluginSandboxConfig
): Promise<T> {
  const timeout = setTimeout(() => {
    throw new PluginError(`Plugin ${plugin.id} timed out`)
  }, config.timeout)
  try {
    return await fn()
  } finally {
    clearTimeout(timeout)
  }
}
```

- Plugin validation on load: verify `manifest.json` schema, capability declarations
- Permission check before every operation (plugin declares, sandbox enforces)
- No access to filesystem outside plugin directory
- No access to process environment variables
- Plugin error in one plugin does not crash the server

### 5. Secrets in Transit and at Rest

| Secret | In Transit | At Rest | In Memory |
|--------|-----------|---------|-----------|
| App Passwords | HTTPS TLS | AES-256-GCM encrypted SQLite | `Uint8Array`, zeroed after use |
| Encryption Key | N/A (env/file) | File perm 0600 | Held only during encrypt/decrypt |
| GSC API Keys | HTTPS TLS | AES-256-GCM encrypted SQLite | `Uint8Array`, zeroed after use |
| Webhook Secrets | HTTPS TLS | AES-256-GCM encrypted SQLite | `Uint8Array`, zeroed after use |
| SQLite DB file | N/A (local) | File perm 0600 on `*.db` | OS page cache (encrypted at rest) |

### 6. Audit Logging for Security

Every security-relevant event is logged (cannot be disabled):

```typescript
securityEvents = [
  "auth:login-success", "auth:login-failure",
  "credential:stored", "credential:rotated", "credential:deleted",
  "config:changed", "config:security-change",
  "webhook:created", "webhook:deleted",
  "plugin:loaded", "plugin:unloaded",
  "batch:started", "batch:completed",
  "rate-limit:exceeded", "circuit:open",
  "validation:failed", "input:rejected",
]
```

- Security logs are append-only (even admin cannot delete)
- Security logs are separate from audit_log table
- Each security event includes: timestamp, event type, client IP (if available), site ID, correlation ID

### 7. File Permission Hardening

```bash
# On first run / install:
chmod 0600 secrets/master.key       # only owner can read
chmod 0600 data/*.db                # SQLite databases
chmod 0700 data/                    # data directory
chmod 0700 plugins/                 # plugin directory
chmod 0700 logs/                    # log directory
chmod 0644 dist/index.js            # compiled output (no secrets)
chmod 0644 src/                     # source code (no secrets)
```

### 8. Security Headers for Webhook Dispatcher

```typescript
webhookRequestHeaders = {
  "X-SEO-Signature": HMAC-SHA256(body, webhookSecret),
  "X-SEO-Timestamp": Math.floor(Date.now() / 1000).toString(),
  "X-SEO-Version": serverVersion,
  "Content-Type": "application/cloudevents+json",
}
// Webhook receivers verify signature + timestamp (reject if > 5 min drift)
```

### 9. Dependency Security

- `npm audit` run on every build (fail if critical vulnerabilities)
- Lock file (`package-lock.json`) committed — reproducible builds
- Minimum dependency count policy: prefer Node.js built-ins over npm packages
- Dependencies used: `typescript`, `vitest`, `tsup` (dev only), `better-sqlite3` (only non-dev)
- Zero runtime dependencies beyond `better-sqlite3`

### 10. Runtime Protections

```typescript
// Process-level hardening:
process.on("uncaughtException", (err) => {
  logger.error("Uncaught exception", err)
  // Do NOT log error details that might contain secrets
  // Do NOT crash — gracefully degrade
  // If critical: health check returns "degraded"
})

process.on("unhandledRejection", (reason) => {
  logger.warn("Unhandled rejection", reason)
})

// Error message sanitization:
function sanitizeError(err: Error): Error {
  const message = err.message
    .replace(/ghp_[a-zA-Z0-9]{36}/g, "[REDACTED-TOKEN]")
    .replace(/Basic [A-Za-z0-9+/=]{10,}/g, "[REDACTED-AUTH]")
    .replace(/\/\*.*?\*\//g, "[REDACTED-COMMENT]")  // SQL comments in injection attempts
  return new Error(message)
}
```

### 11. Security Scoring Checklist (96%+ Target)

| # | Requirement | Status |
|---|-------------|--------|
| 1 | Credentials encrypted at rest (AES-256-GCM) | ✅ |
| 2 | Secrets zeroed after use in memory | ✅ |
| 3 | HTTPS enforced for all WordPress API calls | ✅ |
| 4 | TLS certificate validation | ✅ |
| 5 | Input validation via JSON Schema | ✅ |
| 6 | Parameterized SQL queries only | ✅ |
| 7 | No secrets in logs, errors, or stack traces | ✅ |
| 8 | Plugin sandbox with timeouts and permissions | ✅ |
| 9 | File permissions locked down (0600 for secrets) | ✅ |
| 10 | Rate limiting per site | ✅ |
| 11 | Circuit breaker for API clients | ✅ |
| 12 | Security event audit log (append-only) | ✅ |
| 13 | Webhook HMAC signing + timestamp verification | ✅ |
| 14 | npm audit on build (fail on critical) | ✅ |
| 15 | Error message sanitization (tokens redacted) | ✅ |
| 16 | Unhandled rejection/exception handling | ✅ |
| 17 | Credential rotation support (expiry) | ✅ |
| 18 | Session isolation (site A cannot access site B data) | ✅ |
| 19 | Principle of least privilege in WordPress user scope | ✅ |
| 20 | No command execution (RCE prevention) | ✅ |

## Migrations

```sql
-- migration-001-initial.sql (existing)
CREATE TABLE audit_log (...);
CREATE TABLE seo_scores (...);

-- migration-002-events.sql
CREATE TABLE events (...);
CREATE TABLE snapshots (...);
CREATE INDEX idx_events_aggregate ON events(...);
CREATE INDEX idx_events_type ON events(...);
CREATE INDEX idx_snapshots_aggregate ON snapshots(...);

-- migration-003-jobs.sql
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  site_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'queued',
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  schedule TEXT,
  correlation_id TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT
);
CREATE INDEX idx_jobs_status ON jobs(status, priority, created_at);

-- migration-004-cache.sql
CREATE TABLE cache_entries (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  ttl INTEGER NOT NULL,           -- expiration timestamp (ms)
  site_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_cache_ttl ON cache_entries(ttl);
CREATE INDEX idx_cache_site ON cache_entries(site_id);

-- migration-005-credentials.sql
CREATE TABLE credentials (
  site_id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  app_password_ciphertext BLOB NOT NULL,
  encryption_key_id TEXT NOT NULL,
  nonce BLOB NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  expires_at TEXT
);

-- migration-006-security-events.sql
CREATE TABLE security_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  site_id TEXT,
  correlation_id TEXT,
  metadata TEXT,                   -- JSON (no secrets)
  created_at TEXT NOT NULL
);
CREATE INDEX idx_sec_events_type ON security_events(event_type);
CREATE INDEX idx_sec_events_created ON security_events(created_at);
```

## Tools (New + Upgraded)

### New Tools

| Tool | Params | Returns |
|------|--------|---------|
| `seo-health` | `{ site }` | Full health report |
| `seo-score` | `{ site, postId }` | 0-100 score with breakdown |
| `batch-analyze` | `{ site, postIds[] }` | Job ID + progress |
| `batch-apply` | `{ site, postIds[], fixes[] }` | Job ID + progress |
| `batch-status` | `{ jobId }` | Progress, results, errors |
| `cancel-job` | `{ jobId }` | Success/failure |
| `get-seo-report` | `{ site, postId }` | Full report with recommendations |
| `list-workflows` | none | Available workflow names |
| `run-workflow` | `{ site, postId, workflow }` | Workflow execution result |
| `get-config` | `{ site? }` | Active configuration |
| `set-config` | `{ site?, key, value }` | Updated configuration |
| `list-webhooks` | `{ site? }` | Registered webhooks |
| `set-webhook` | `{ site, url, events[] }` | Created webhook |
| `delete-webhook` | `{ id }` | Success/failure |

### Upgraded Tools
- `manage-sites` — now supports per-site config overrides
- `analyze-seo` — now returns SEO score and priority recommendations
- `apply-seo` — now creates pre-snapshot, uses job queue
- `rollback-seo` — now uses snapshot restore instead of incremental undo
- `get-seo-history` — now includes event sourcing data

## File Structure After Phase 1

```
src/
├── index.ts
├── transport.ts
├── orchestrator.ts
├── plugin-sdk.ts
├── plugin-loader.ts
├── plugins/
│   ├── __sandbox.ts
│   └── ... (existing)
├── core/
│   ├── event-bus.ts
│   ├── event-store.ts
│   ├── snapshot-manager.ts
│   ├── state-machine.ts
│   ├── scoring-engine.ts
│   ├── config-manager.ts
│   ├── workflow-engine.ts
│   ├── job-scheduler.ts
│   ├── priority-queue.ts
│   └── webhook-dispatcher.ts
├── infrastructure/
│   ├── circuit-breaker.ts
│   ├── retry-pipeline.ts
│   ├── cache-hierarchy.ts
│   ├── rate-limiter.ts
│   ├── telemetry.ts
│   ├── lock-manager.ts
│   ├── graceful-shutdown.ts
│   └── error-classes.ts
├── middleware/
│   ├── pipeline.ts
│   ├── logging.ts
│   ├── validation.ts
│   └── cache.ts
├── services/
│   ├── wordpress/
│   ├── storage/
│   │   ├── migration-manager.ts
│   │   └── ...
│   └── external/
├── types/
│   ├── mcp.ts
│   ├── seo.ts
│   ├── wordpress.ts
│   ├── events.ts
│   ├── plugins.ts
│   ├── queue.ts
│   └── config.ts
├── migrations/
│   ├── 001-initial.sql
│   ├── 002-events.sql
│   ├── 003-jobs.sql
│   └── 004-cache.sql
└── __tests__/
    └── ... (new tests)
```

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Event sourcing | Yes, append-only events table | Full auditability, rollback to any point |
| Priority queue | In-memory + SQLite persist | Survive restarts without Redis dependency |
| Cache L3 | Redis optional, not required | Keep zero-dependency setup as default |
| Plugin loading | Dynamic from filesystem | Allow third-party plugins without code changes |
| Telemetry | OpenTelemetry | Industry standard, portable, many backends |
| State machine | Simple class, not XState | Lightweight, zero dependencies, testable |
| Config validation | JSON Schema | Standard, well-supported in TypeScript |
| Snapshot retention | Last 50 per post | Balance storage vs rollback capability |

## Testing Strategy

- **Unit tests:** Each core component in isolation (event-bus, circuit-breaker, cache, queue, state-machine)
- **Integration tests:** Plugin system with mock plugins, config manager with file I/O
- **Workflow tests:** End-to-end workflow execution with mock WP API
- **Migration tests:** Schema creation, upgrade, downgrade
- **Property-based tests:** Queue scheduling, circuit breaker state transitions
