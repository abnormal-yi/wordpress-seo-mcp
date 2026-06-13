# Phase 1: Production Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade WordPress SEO MCP server from basic toolset to enterprise-grade production system with event sourcing, priority queues, circuit breakers, encrypted credential storage, plugin SDK, scoring engine, workflows, webhooks, telemetry, and batch processing.

**Architecture:** Three-layer event-driven architecture (Orchestration → Domain → Infrastructure) with typed event bus as the backbone for all inter-component communication. Plugin system with dynamic loading, sandboxing, and dependency resolution. Priority queue with 3 lanes (high/med/low) backed by SQLite persistence. Circuit breaker and retry pipelines wrapping all external API calls.

**Tech Stack:** TypeScript 5+, Node.js 20, better-sqlite3, JSON Schema validation, native Node crypto (AES-256-GCM), OpenTelemetry API

---

## Structure

### Files to Create

```
src/
├── core/
│   ├── event-bus.ts             # Typed event bus with wildcard patterns + filters
│   ├── event-store.ts           # Event sourcing SQLite append-log
│   ├── snapshot-manager.ts      # Post snapshots for rollback
│   ├── state-machine.ts         # Post lifecycle state transitions
│   ├── scoring-engine.ts        # Multi-layer SEO scoring (0-100)
│   ├── config-manager.ts        # Hierarchical config with JSON Schema
│   ├── workflow-engine.ts       # Multi-step workflow execution
│   ├── job-scheduler.ts         # Cron-based scheduling
│   ├── priority-queue.ts        # 3-lane priority queue with persistence
│   └── webhook-dispatcher.ts    # HMAC-signed webhook POST
├── infrastructure/
│   ├── circuit-breaker.ts       # Per-client circuit breaker
│   ├── retry-pipeline.ts        # Exponential backoff + jitter
│   ├── cache-hierarchy.ts       # L1/L2/L3 cache
│   ├── rate-limiter.ts          # Sliding window rate limiter
│   ├── telemetry.ts             # OpenTelemetry metrics + tracing
│   ├── lock-manager.ts          # Distributed lock via SQLite
│   ├── graceful-shutdown.ts     # SIGTERM/SIGINT handler
│   ├── error-classes.ts         # Typed SEOError hierarchy
│   └── credential-manager.ts    # AES-256-GCM encrypt/decrypt
├── plugins/
│   ├── plugin-sdk.ts            # SEOPlugin interface + PluginContext
│   ├── plugin-loader.ts         # Dynamic filesystem loader + hot-reload
│   └── __sandbox.ts             # Plugin sandbox (timeout + permissions)
├── services/
│   └── storage/
│       ├── migration-manager.ts  # Sequential SQL migration runner
│       └── security-store.ts     # Security events append-only
├── migrations/
│   ├── 001-initial.sql          # existing audit_log, seo_scores
│   ├── 002-events.sql           # events, snapshots tables
│   ├── 003-jobs.sql             # jobs table
│   ├── 004-cache.sql            # cache_entries table
│   ├── 005-credentials.sql      # encrypted credentials table
│   └── 006-security-events.sql  # security_events append-only
└── types/
    ├── events.ts                # SEOEvent types + payloads
    ├── plugins.ts               # Plugin manifest + capability types
    ├── queue.ts                 # Job, Queue, Worker types
    └── config.ts                # Config schema type
```

### Files to Modify

```
src/index.ts                     # Wire all new components + register tools
src/middleware/pipeline.ts       # Add logging, validation, cache middleware
src/services/storage/index.ts    # Add migration runner initialization
src/services/wordpress/site-pool.ts  # Use encrypted credential storage
src/plugins/management.ts        # Add config/webhook/schedule management tools
src/plugins/rollback.ts          # Use snapshot-based rollback
src/types/mcp.ts                 # Add new tool param/result types
src/types/seo.ts                 # Add score, report types
src/orchestrator.ts              # Update ToolPlugin interface
```

---

### Task 1: Type Foundation + Error Classes

**Files:**
- Create: `src/types/events.ts`
- Create: `src/types/plugins.ts`
- Create: `src/types/queue.ts`
- Create: `src/types/config.ts`
- Create: `src/infrastructure/error-classes.ts`

- [ ] **Step 1: Create `src/types/events.ts`**

```typescript
export type SEOEventType =
  | "site:added" | "site:removed" | "site:updated"
  | "analysis:start" | "analysis:complete" | "analysis:failed"
  | "apply:start" | "apply:complete" | "apply:failed" | "apply:rollback"
  | "error:threshold" | "circuit:open" | "circuit:close" | "circuit:half-open"
  | "cache:miss" | "cache:hit" | "cache:invalidated"
  | "sitemap:generated" | "sitemap:submitted"
  | "schedule:triggered" | "auto-fix:executed" | "auto-fix:skipped"
  | "queue:job-added" | "queue:job-started" | "queue:job-completed" | "queue:job-failed"
  | "plugin:loaded" | "plugin:unloaded" | "plugin:error"
  | "health:check" | "health:changed"
  | "auth:login-success" | "auth:login-failure"
  | "credential:stored" | "credential:rotated" | "credential:deleted"
  | "config:changed" | "config:security-change"
  | "webhook:created" | "webhook:deleted"
  | "validation:failed" | "input:rejected"
  | "batch:started" | "batch:completed"
  | "rate-limit:exceeded"
  | "security:event";

export interface SEOEvent {
  type: SEOEventType;
  payload: unknown;
  metadata: {
    correlationId: string;
    siteId?: string;
    timestamp: number;
  };
}

export type SEOEventHandler = (event: SEOEvent) => void | Promise<void>;

export interface EventSubscription {
  pattern: string;
  handler: SEOEventHandler;
  filter?: { siteId?: string };
}
```

- [ ] **Step 2: Create `src/types/plugins.ts`**

```typescript
import type { ConfigManager } from "../core/config-manager";
import type { EventBus } from "../core/event-bus";
import type { CacheHierarchy } from "../infrastructure/cache-hierarchy";

export type PluginPermission = "read" | "write" | "network";
export type PluginCapabilityAction = "analyze" | "apply";
export type PluginCapabilityResource = "meta" | "schema" | "content" | "images" | "technical";

export interface PluginCapability {
  action: PluginCapabilityAction;
  resource: PluginCapabilityResource;
  description: string;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  dependencies: string[];
  permissions: PluginPermission[];
  capabilities: PluginCapability[];
  hooks: string[];
  config: Record<string, unknown>;
}

export interface PluginContext {
  config: ConfigManager;
  storage: import("../services/storage").StorageEngine;
  eventBus: EventBus;
  logger: Console;
  makeRequest: <T>(fn: () => Promise<T>) => Promise<T>;
  cache: CacheHierarchy;
}

export type AnalyzeParams = {
  siteId: string;
  postId: number;
  [key: string]: unknown;
};

export type ApplyParams = {
  siteId: string;
  postId: number;
  [key: string]: unknown;
};

export interface AnalyzeResult {
  plugin: string;
  score: number;
  issues: Array<{ field: string; message: string; severity: "error" | "warning" | "info" }>;
  data: Record<string, unknown>;
}

export interface ApplyResult {
  plugin: string;
  success: boolean;
  changes: Array<{ field: string; oldValue?: string; newValue: string }>;
  error?: string;
}

export interface SEOPlugin {
  id: string;
  name: string;
  version: string;
  description: string;
  manifest: PluginManifest;
  init?(context: PluginContext): Promise<void>;
  destroy?(): Promise<void>;
  analyze(params: AnalyzeParams): Promise<AnalyzeResult>;
  apply?(params: ApplyParams): Promise<ApplyResult>;
  onActivate?(): Promise<void>;
  onDeactivate?(): Promise<void>;
  onConfigChange?(config: Record<string, unknown>): Promise<void>;
}
```

- [ ] **Step 3: Create `src/types/queue.ts`**

```typescript
export type JobType = "analyze" | "apply" | "rollback" | "sitemap" | "monitor" | "auto-fix" | "batch-analyze" | "batch-apply";
export type JobPriority = "high" | "medium" | "low";
export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface Job {
  id: string;
  type: JobType;
  siteId: string;
  payload: Record<string, unknown>;
  priority: JobPriority;
  status: JobStatus;
  retryCount: number;
  maxRetries: number;
  schedule?: string;
  correlationId: string;
  error?: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
}

export interface JobRow {
  id: string;
  type: JobType;
  site_id: string;
  payload: string;
  priority: string;
  status: string;
  retry_count: number;
  max_retries: number;
  schedule: string | null;
  correlation_id: string;
  error: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export type QueueLane = "high" | "medium" | "low";
export type WorkerCallback = (job: Job) => Promise<void>;
```

- [ ] **Step 4: Create `src/types/config.ts`**

```typescript
export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoff: "exponential" | "linear" | "fixed";
  jitter: boolean;
}

export interface CacheConfig {
  enabled: boolean;
  defaultTtlMs: number;
  maxEntries: number;
  l2Enabled: boolean;
  l2TtlMs: number;
}

export interface RateLimitConfig {
  enabled: boolean;
  requestsPerWindow: number;
  windowMs: number;
}

export interface CircuitBreakerConfig {
  enabled: boolean;
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenMaxRequests: number;
}

export interface QueueConfig {
  concurrency: { high: number; medium: number; low: number };
  pollIntervalMs: number;
}

export interface LoggingConfig {
  level: "debug" | "info" | "warn" | "error";
  format: "json" | "human";
  output: "stdout" | "file";
  filePath?: string;
}

export interface TelemetryConfig {
  enabled: boolean;
  otlpEndpoint?: string;
  serviceName: string;
}

export interface WebhookConfig {
  maxAttempts: number;
  timeoutMs: number;
}

export interface MonitorConfig {
  intervalMs: number;
  enabled: boolean;
}

export interface StorageConfig {
  sqlitePath: string;
  vacuumIntervalMs: number;
}

export interface AppConfig {
  retry: RetryConfig;
  cache: CacheConfig;
  rateLimit: RateLimitConfig;
  circuitBreaker: CircuitBreakerConfig;
  queue: QueueConfig;
  logging: LoggingConfig;
  telemetry: TelemetryConfig;
  webhook: WebhookConfig;
  monitor: MonitorConfig;
  storage: StorageConfig;
}

export interface SiteConfig {
  id: string;
  url: string;
  username: string;
  overrides?: Partial<AppConfig>;
}
```

- [ ] **Step 5: Create `src/infrastructure/error-classes.ts`**

```typescript
export class SEOError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public retryable: boolean = false,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "SEOError";
  }
}

export class NetworkError extends SEOError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "NETWORK_ERROR", 503, true, details);
    this.name = "NetworkError";
  }
}

export class RateLimitError extends SEOError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "RATE_LIMITED", 429, true, details);
    this.name = "RateLimitError";
  }
}

export class AuthError extends SEOError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "AUTH_FAILED", 401, false, details);
    this.name = "AuthError";
  }
}

export class NotFoundError extends SEOError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "NOT_FOUND", 404, false, details);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends SEOError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "VALIDATION_ERROR", 422, false, details);
    this.name = "ValidationError";
  }
}

export class TimeoutError extends SEOError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "TIMEOUT", 504, true, details);
    this.name = "TimeoutError";
  }
}

export class CircuitOpenError extends SEOError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "CIRCUIT_OPEN", 503, true, details);
    this.name = "CircuitOpenError";
  }
}

export class PluginError extends SEOError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "PLUGIN_ERROR", 500, false, details);
    this.name = "PluginError";
  }
}

export class ConfigError extends SEOError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "CONFIG_ERROR", 500, false, details);
    this.name = "ConfigError";
  }
}
```

- [ ] **Step 6: Run tests to verify clean imports**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 7: Commit**

```bash
git add src/types/ src/infrastructure/error-classes.ts
git commit -m "feat: add typed foundation - events, plugins, queue, config types + error classes"
```

---

### Task 2: Event Bus + Config Manager

**Files:**
- Create: `src/core/event-bus.ts`
- Create: `src/core/config-manager.ts`

- [ ] **Step 1: Write failing tests for event-bus**

Create test file to be created later. Write tests inline here.

```typescript
// tests/core/event-bus.test.ts
import { describe, it, expect, vi } from "vitest";
import { EventBus } from "../../src/core/event-bus";

describe("EventBus", () => {
  it("dispatches event to matching handler", () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on("analysis:complete", handler);
    bus.emit({ type: "analysis:complete", payload: { postId: 1 }, metadata: { correlationId: "1", timestamp: Date.now() } });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("does not dispatch to non-matching handler", () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on("analysis:complete", handler);
    bus.emit({ type: "apply:start", payload: {}, metadata: { correlationId: "1", timestamp: Date.now() } });
    expect(handler).not.toHaveBeenCalled();
  });

  it("supports wildcard pattern matching", () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on("analysis:*", handler);
    bus.emit({ type: "analysis:start", payload: {}, metadata: { correlationId: "1", timestamp: Date.now() } });
    bus.emit({ type: "analysis:complete", payload: {}, metadata: { correlationId: "2", timestamp: Date.now() } });
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("supports double-wildcard catch-all", () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on("**", handler);
    bus.emit({ type: "any:event", payload: {}, metadata: { correlationId: "1", timestamp: Date.now() } });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("filters by siteId when filter is set", () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on("analysis:complete", handler, { siteId: "site-a" });
    bus.emit({ type: "analysis:complete", payload: {}, metadata: { correlationId: "1", siteId: "site-b", timestamp: Date.now() } });
    expect(handler).not.toHaveBeenCalled();
    bus.emit({ type: "analysis:complete", payload: {}, metadata: { correlationId: "2", siteId: "site-a", timestamp: Date.now() } });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("supports off() to unsubscribe", () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on("test", handler);
    bus.off("test", handler);
    bus.emit({ type: "test", payload: {}, metadata: { correlationId: "1", timestamp: Date.now() } });
    expect(handler).not.toHaveBeenCalled();
  });

  it("handles async handlers without blocking emit", async () => {
    const bus = new EventBus();
    let resolved = false;
    bus.on("test", async () => { await Promise.resolve(); resolved = true; });
    bus.emit({ type: "test", payload: {}, metadata: { correlationId: "1", timestamp: Date.now() } });
    await Promise.resolve();
    expect(resolved).toBe(true);
  });
});
```

Run: `npx vitest run tests/core/event-bus.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 2: Write failing tests for config-manager**

```typescript
// tests/core/config-manager.test.ts
import { describe, it, expect } from "vitest";
import { ConfigManager } from "../../src/core/config-manager";

describe("ConfigManager", () => {
  it("uses defaults when no overrides", () => {
    const cm = new ConfigManager();
    expect(cm.get("retry.maxAttempts")).toBe(3);
    expect(cm.get("cache.enabled")).toBe(true);
  });

  it("overrides global with site config", () => {
    const cm = new ConfigManager();
    cm.setSiteConfig("site-a", { retry: { maxAttempts: 5 } });
    expect(cm.get("retry.maxAttempts")).toBe(3);  // global unchanged
    expect(cm.get("retry.maxAttempts", "site-a")).toBe(5);
  });

  it("overrides site config with per-request params", () => {
    const cm = new ConfigManager();
    cm.setSiteConfig("site-a", { retry: { maxAttempts: 5 } });
    expect(cm.get("retry.maxAttempts", "site-a", { retry: { maxAttempts: 10 } })).toBe(10);
  });

  it("returns merged config as object", () => {
    const cm = new ConfigManager();
    cm.setSiteConfig("site-a", { retry: { maxAttempts: 5 } });
    const merged = cm.getAll("site-a");
    expect(merged.retry.maxAttempts).toBe(5);
    expect(merged.retry.backoff).toBe("exponential");
  });

  it("validates config against JSON Schema", () => {
    const cm = new ConfigManager();
    expect(() => cm.setSiteConfig("site-a", { retry: { maxAttempts: -1 } })).toThrow();
  });
});
```

Run: `npx vitest run tests/core/config-manager.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Create `src/core/event-bus.ts`**

```typescript
import type { SEOEvent, SEOEventType, SEOEventHandler } from "../types/events";

interface Subscription {
  pattern: string;
  handler: SEOEventHandler;
  filter?: { siteId?: string };
}

function patternToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const regexStr = "^" + escaped.replace(/\*\*/g, ".*").replace(/\*/g, "[^:]*") + "$";
  return new RegExp(regexStr);
}

export class EventBus {
  private subscriptions: Subscription[] = [];

  on(pattern: string, handler: SEOEventHandler, filter?: { siteId?: string }): () => void {
    const sub: Subscription = { pattern, handler, filter };
    this.subscriptions.push(sub);
    return () => this.off(pattern, handler);
  }

  off(pattern: string, handler: SEOEventHandler): void {
    this.subscriptions = this.subscriptions.filter(
      (s) => !(s.pattern === pattern && s.handler === handler)
    );
  }

  emit(event: SEOEvent): void {
    for (const sub of this.subscriptions) {
      const regex = patternToRegex(sub.pattern);
      if (!regex.test(event.type)) continue;
      if (sub.filter?.siteId && sub.filter.siteId !== event.metadata.siteId) continue;
      try {
        const result = sub.handler(event);
        if (result instanceof Promise) {
          result.catch((err) => console.error("Event handler error:", err));
        }
      } catch (err) {
        console.error("Event handler error:", err);
      }
    }
  }

  clear(): void {
    this.subscriptions = [];
  }

  listenerCount(): number {
    return this.subscriptions.length;
  }
}
```

- [ ] **Step 4: Create `src/core/config-manager.ts`**

```typescript
import type { AppConfig, SiteConfig } from "../types/config";
import { ConfigError } from "../infrastructure/error-classes";

const DEFAULT_CONFIG: AppConfig = {
  retry: { maxAttempts: 3, initialDelayMs: 1000, maxDelayMs: 30000, backoff: "exponential", jitter: true },
  cache: { enabled: true, defaultTtlMs: 300000, maxEntries: 1000, l2Enabled: true, l2TtlMs: 3600000 },
  rateLimit: { enabled: true, requestsPerWindow: 60, windowMs: 60000 },
  circuitBreaker: { enabled: true, failureThreshold: 5, resetTimeoutMs: 30000, halfOpenMaxRequests: 3 },
  queue: { concurrency: { high: 5, medium: 3, low: 2 }, pollIntervalMs: 200 },
  logging: { level: "info", format: "human", output: "stdout" },
  telemetry: { enabled: false, serviceName: "wordpress-seo-mcp" },
  webhook: { maxAttempts: 5, timeoutMs: 10000 },
  monitor: { intervalMs: 3600000, enabled: false },
  storage: { sqlitePath: "./data/seo.db", vacuumIntervalMs: 86400000 },
};

export class ConfigManager {
  private globalConfig: AppConfig = { ...DEFAULT_CONFIG };
  private siteConfigs: Map<string, Partial<AppConfig>> = new Map();

  constructor(initialOverrides?: Partial<AppConfig>) {
    if (initialOverrides) {
      this.globalConfig = this.mergeDeep({ ...DEFAULT_CONFIG }, initialOverrides);
    }
  }

  get<T = unknown>(path: string, siteId?: string, requestOverrides?: Partial<AppConfig>): T {
    let config = { ...this.globalConfig };
    if (siteId && this.siteConfigs.has(siteId)) {
      config = this.mergeDeep(config, this.siteConfigs.get(siteId)!);
    }
    if (requestOverrides) {
      config = this.mergeDeep(config, requestOverrides);
    }
    const parts = path.split(".");
    let current: unknown = config;
    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== "object") {
        return undefined as T;
      }
      current = (current as Record<string, unknown>)[part];
    }
    return current as T;
  }

  getAll(siteId?: string): AppConfig {
    let config = { ...this.globalConfig };
    if (siteId && this.siteConfigs.has(siteId)) {
      config = this.mergeDeep(config, this.siteConfigs.get(siteId)!);
    }
    return config;
  }

  setSiteConfig(siteId: string, overrides: Partial<AppConfig>): void {
    this.validateConfig(overrides);
    this.siteConfigs.set(siteId, overrides);
  }

  removeSiteConfig(siteId: string): void {
    this.siteConfigs.delete(siteId);
  }

  private validateConfig(config: Partial<AppConfig>): void {
    if (config.retry?.maxAttempts !== undefined && config.retry.maxAttempts < 1) {
      throw new ConfigError("retry.maxAttempts must be >= 1");
    }
    if (config.retry?.maxAttempts !== undefined && config.retry.maxAttempts > 20) {
      throw new ConfigError("retry.maxAttempts must be <= 20");
    }
  }

  private mergeDeep<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
    const result = { ...target };
    for (const key of Object.keys(source)) {
      const k = key as keyof T;
      if (source[k] !== null && typeof source[k] === "object" && !Array.isArray(source[k])) {
        result[k] = this.mergeDeep(
          (result[k] as Record<string, unknown>) || {},
          source[k] as Record<string, unknown>
        ) as T[keyof T];
      } else if (source[k] !== undefined) {
        result[k] = source[k] as T[keyof T];
      }
    }
    return result;
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/core/event-bus.test.ts tests/core/config-manager.test.ts`
Expected: PASS (all tests)

- [ ] **Step 6: Commit**

```bash
git add src/core/event-bus.ts src/core/config-manager.ts tests/core/
git commit -m "feat: add event bus and config manager"
```

---

### Task 3: Error Retry Pipeline + Circuit Breaker + Rate Limiter

**Files:**
- Create: `src/infrastructure/retry-pipeline.ts`
- Create: `src/infrastructure/circuit-breaker.ts`
- Create: `src/infrastructure/rate-limiter.ts`

- [ ] **Step 1: Write failing tests for all three**

```typescript
// tests/infrastructure/retry-pipeline.test.ts
import { describe, it, expect, vi } from "vitest";
import { withRetry } from "../../src/infrastructure/retry-pipeline";
import { NetworkError, AuthError } from "../../src/infrastructure/error-classes";

describe("withRetry", () => {
  it("returns result on success", async () => {
    const result = await withRetry(() => Promise.resolve("ok"), { maxAttempts: 3 });
    expect(result).toBe("ok");
  });

  it("retries on retryable error and succeeds", async () => {
    let attempts = 0;
    const fn = vi.fn().mockImplementation(() => {
      attempts++;
      if (attempts < 3) return Promise.reject(new NetworkError("fail"));
      return Promise.resolve("ok");
    });
    const result = await withRetry(fn, { maxAttempts: 3, initialDelayMs: 10 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws on non-retryable error without retry", async () => {
    const fn = vi.fn().mockRejectedValue(new AuthError("bad auth"));
    await expect(withRetry(fn, { maxAttempts: 3 })).rejects.toThrow(AuthError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("throws after exhausting retries", async () => {
    const fn = vi.fn().mockRejectedValue(new NetworkError("always fail"));
    await expect(withRetry(fn, { maxAttempts: 3, initialDelayMs: 10 })).rejects.toThrow(NetworkError);
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
```

```typescript
// tests/infrastructure/circuit-breaker.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CircuitBreaker } from "../../src/infrastructure/circuit-breaker";

describe("CircuitBreaker", () => {
  let cb: CircuitBreaker;

  beforeEach(() => {
    cb = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 50000, halfOpenMaxRequests: 2 });
  });

  it("passes through successful calls", async () => {
    const result = await cb.call(() => Promise.resolve("ok"));
    expect(result).toBe("ok");
    expect(cb.state).toBe("closed");
  });

  it("opens after threshold failures", async () => {
    for (let i = 0; i < 3; i++) {
      await cb.call(() => Promise.reject(new Error("fail"))).catch(() => {});
    }
    expect(cb.state).toBe("open");
  });

  it("rejects immediately when open", async () => {
    cb["failures"] = 3; // force open
    cb["state"] = "open";
    await expect(cb.call(() => Promise.resolve("ok"))).rejects.toThrow("circuit breaker is open");
  });

  it("transitions to half-open after reset timeout", async () => {
    const shortCb = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 10, halfOpenMaxRequests: 2 });
    for (let i = 0; i < 2; i++) {
      await shortCb.call(() => Promise.reject(new Error("fail"))).catch(() => {});
    }
    expect(shortCb.state).toBe("open");
    await new Promise(r => setTimeout(r, 20));
    expect(shortCb.state).toBe("half-open");
  });

  it("closes after successful calls in half-open", async () => {
    const shortCb = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 10, halfOpenMaxRequests: 2 });
    for (let i = 0; i < 2; i++) {
      await shortCb.call(() => Promise.reject(new Error("fail"))).catch(() => {});
    }
    await new Promise(r => setTimeout(r, 20));
    await shortCb.call(() => Promise.resolve("ok"));
    await shortCb.call(() => Promise.resolve("ok"));
    expect(shortCb.state).toBe("closed");
  });
});
```

```typescript
// tests/infrastructure/rate-limiter.test.ts
import { describe, it, expect } from "vitest";
import { RateLimiter } from "../../src/infrastructure/rate-limiter";

describe("RateLimiter", () => {
  it("allows requests under limit", () => {
    const rl = new RateLimiter({ requestsPerWindow: 5, windowMs: 1000 });
    expect(rl.tryConsume("key")).toBe(true);
    expect(rl.tryConsume("key")).toBe(true);
  });

  it("blocks requests over limit", () => {
    const rl = new RateLimiter({ requestsPerWindow: 2, windowMs: 1000 });
    rl.tryConsume("key");
    rl.tryConsume("key");
    expect(rl.tryConsume("key")).toBe(false);
  });

  it("respects separate keys", () => {
    const rl = new RateLimiter({ requestsPerWindow: 2, windowMs: 1000 });
    rl.tryConsume("a");
    rl.tryConsume("a");
    expect(rl.tryConsume("b")).toBe(true);
  });

  it("resets after window expires", async () => {
    const rl = new RateLimiter({ requestsPerWindow: 1, windowMs: 50 });
    rl.tryConsume("key");
    expect(rl.tryConsume("key")).toBe(false);
    await new Promise(r => setTimeout(r, 60));
    expect(rl.tryConsume("key")).toBe(true);
  });

  it("returns remaining count and reset time", () => {
    const rl = new RateLimiter({ requestsPerWindow: 3, windowMs: 60000 });
    const result = rl.tryConsume("key");
    expect(result).toHaveProperty("remaining");
    expect(result).toHaveProperty("resetAt");
  });
});
```

- [ ] **Step 2: Create `src/infrastructure/retry-pipeline.ts`**

```typescript
import { SEOError } from "./error-classes";

interface RetryOptions {
  maxAttempts: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoff?: "exponential" | "linear" | "fixed";
  jitter?: boolean;
}

const RETRYABLE_CODES = new Set(["NETWORK_ERROR", "RATE_LIMITED", "TIMEOUT", "CIRCUIT_OPEN"]);

function isRetryable(error: Error): boolean {
  if (error instanceof SEOError) return error.retryable;
  const err = error as Error;
  const codes = ["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "ECONNABORTED"];
  if ((err as NodeJS.ErrnoException).code && codes.includes((err as NodeJS.ErrnoException).code!)) return true;
  return false;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const { maxAttempts, initialDelayMs = 200, maxDelayMs = 30000, backoff = "exponential", jitter = true } = options;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err as Error;
      if (!isRetryable(lastError)) throw lastError;
      if (attempt === maxAttempts) throw lastError;

      let waitMs: number;
      switch (backoff) {
        case "exponential":
          waitMs = initialDelayMs * Math.pow(2, attempt - 1);
          break;
        case "linear":
          waitMs = initialDelayMs * attempt;
          break;
        case "fixed":
          waitMs = initialDelayMs;
          break;
        default:
          waitMs = initialDelayMs * Math.pow(2, attempt - 1);
      }
      waitMs = Math.min(waitMs, maxDelayMs);
      if (jitter) {
        waitMs = waitMs * (0.5 + Math.random() * 0.5);
      }
      await delay(waitMs);
    }
  }
  throw lastError!;
}
```

- [ ] **Step 3: Create `src/infrastructure/circuit-breaker.ts`**

```typescript
import { EventBus } from "../core/event-bus";
import { CircuitOpenError } from "./error-classes";

interface CircuitBreakerOptions {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenMaxRequests: number;
}

type CircuitState = "closed" | "open" | "half-open";

export class CircuitBreaker {
  state: CircuitState = "closed";
  private failures = 0;
  private successes = 0;
  private lastFailureTime = 0;
  private halfOpenAttempts = 0;
  private eventBus?: EventBus;

  constructor(
    private options: CircuitBreakerOptions,
    private name: string = "default"
  ) {}

  setEventBus(bus: EventBus): void {
    this.eventBus = bus;
  }

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "open") {
      if (Date.now() - this.lastFailureTime >= this.options.resetTimeoutMs) {
        this.state = "half-open";
        this.halfOpenAttempts = 0;
        this.emitEvent("circuit:half-open");
      } else {
        throw new CircuitOpenError(`circuit breaker is open for ${this.name}`);
      }
    }

    if (this.state === "half-open" && this.halfOpenAttempts >= this.options.halfOpenMaxRequests) {
      throw new CircuitOpenError(`circuit breaker half-open limit for ${this.name}`);
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess(): void {
    if (this.state === "half-open") {
      this.halfOpenAttempts++;
      this.successes++;
      if (this.successes >= this.options.halfOpenMaxRequests) {
        this.state = "closed";
        this.failures = 0;
        this.successes = 0;
        this.emitEvent("circuit:close");
      }
    } else {
      this.failures = 0;
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    if (this.state === "half-open") {
      this.state = "open";
      this.emitEvent("circuit:open");
    } else if (this.failures >= this.options.failureThreshold) {
      this.state = "open";
      this.emitEvent("circuit:open");
    }
  }

  private emitEvent(type: "circuit:open" | "circuit:close" | "circuit:half-open"): void {
    if (this.eventBus) {
      this.eventBus.emit({
        type,
        payload: { name: this.name, state: this.state, failures: this.failures },
        metadata: { correlationId: "", timestamp: Date.now() },
      });
    }
  }
}
```

- [ ] **Step 4: Create `src/infrastructure/rate-limiter.ts`**

```typescript
interface RateLimitOptions {
  requestsPerWindow: number;
  windowMs: number;
}

interface ConsumeResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

interface WindowEntry {
  count: number;
  windowStart: number;
}

export class RateLimiter {
  private windows: Map<string, WindowEntry> = new Map();

  constructor(private options: RateLimitOptions) {}

  tryConsume(key: string): ConsumeResult {
    const now = Date.now();
    const entry = this.windows.get(key);

    if (!entry || now - entry.windowStart >= this.options.windowMs) {
      this.windows.set(key, { count: 1, windowStart: now });
      return { allowed: true, remaining: this.options.requestsPerWindow - 1, resetAt: now + this.options.windowMs };
    }

    if (entry.count >= this.options.requestsPerWindow) {
      return { allowed: false, remaining: 0, resetAt: entry.windowStart + this.options.windowMs };
    }

    entry.count++;
    return { allowed: true, remaining: this.options.requestsPerWindow - entry.count, resetAt: entry.windowStart + this.options.windowMs };
  }

  reset(key: string): void {
    this.windows.delete(key);
  }

  clearExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.windows) {
      if (now - entry.windowStart >= this.options.windowMs) {
        this.windows.delete(key);
      }
    }
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/infrastructure/`
Expected: PASS (all tests)

- [ ] **Step 6: Commit**

```bash
git add src/infrastructure/retry-pipeline.ts src/infrastructure/circuit-breaker.ts src/infrastructure/rate-limiter.ts tests/infrastructure/
git commit -m "feat: add retry pipeline, circuit breaker, and rate limiter"
```

---

### Task 4: Cache Hierarchy + Credential Manager + Lock Manager + Graceful Shutdown + Telemetry

**Files:**
- Create: `src/infrastructure/cache-hierarchy.ts`
- Create: `src/infrastructure/credential-manager.ts`
- Create: `src/infrastructure/lock-manager.ts`
- Create: `src/infrastructure/graceful-shutdown.ts`
- Create: `src/infrastructure/telemetry.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/infrastructure/cache-hierarchy.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { CacheHierarchy } from "../../src/infrastructure/cache-hierarchy";
import Database from "better-sqlite3";

describe("CacheHierarchy", () => {
  let cache: CacheHierarchy;
  beforeEach(() => {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE cache_entries (key TEXT PRIMARY KEY, value TEXT, ttl INTEGER, site_id TEXT, created_at TEXT)");
    cache = new CacheHierarchy(db, { defaultTtlMs: 1000, maxEntries: 100, l2Enabled: true });
  });

  it("stores and retrieves from L1", () => {
    cache.set("k", "v");
    expect(cache.get("k")).toBe("v");
  });

  it("returns null for missing key", () => {
    expect(cache.get("nonexistent")).toBeNull();
  });

  it("expires entries after TTL", async () => {
    cache.set("k", "v", 50);
    await new Promise(r => setTimeout(r, 60));
    expect(cache.get("k")).toBeNull();
  });

  it("invalidates by key", () => {
    cache.set("k", "v");
    cache.invalidate("k");
    expect(cache.get("k")).toBeNull();
  });

  it("invalidates by site prefix", () => {
    cache.set("site-a:posts", "data1");
    cache.set("site-b:posts", "data2");
    cache.invalidateBySite("site-a");
    expect(cache.get("site-a:posts")).toBeNull();
    expect(cache.get("site-b:posts")).toBe("data2");
  });

  it("evicts oldest when max entries exceeded", () => {
    for (let i = 0; i < 150; i++) cache.set(`k${i}`, `v${i}`);
    let foundOld = false;
    for (let i = 0; i < 50; i++) {
      if (cache.get(`k${i}`) !== null) foundOld = true;
    }
    // some oldest should be evicted
    expect(cache.size()).toBeLessThanOrEqual(100);
  });
});
```

```typescript
// tests/infrastructure/credential-manager.test.ts
import { describe, it, expect } from "vitest";
import { CredentialManager } from "../../src/infrastructure/credential-manager";
import Database from "better-sqlite3";

describe("CredentialManager", () => {
  it("encrypts and decrypts credentials", async () => {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE credentials (site_id TEXT PRIMARY KEY, username TEXT, app_password_ciphertext BLOB, encryption_key_id TEXT, nonce BLOB, created_at TEXT, last_used_at TEXT, expires_at TEXT)");
    const cm = new CredentialManager(db, "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef");
    await cm.store("site-a", "admin", "my-app-password");
    const retrieved = cm.retrieve("site-a");
    expect(retrieved).toEqual({ username: "admin", appPassword: "my-app-password" });
  });

  it("returns null for unknown site", () => {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE credentials (site_id TEXT PRIMARY KEY, username TEXT, app_password_ciphertext BLOB, encryption_key_id TEXT, nonce BLOB, created_at TEXT, last_used_at TEXT, expires_at TEXT)");
    const cm = new CredentialManager(db, "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef");
    expect(cm.retrieve("nonexistent")).toBeNull();
  });

  it("deletes credentials", async () => {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE credentials (site_id TEXT PRIMARY KEY, username TEXT, app_password_ciphertext BLOB, encryption_key_id TEXT, nonce BLOB, created_at TEXT, last_used_at TEXT, expires_at TEXT)");
    const cm = new CredentialManager(db, "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef");
    await cm.store("site-a", "admin", "pass");
    cm.delete("site-a");
    expect(cm.retrieve("site-a")).toBeNull();
  });
});
```

- [ ] **Step 2: Create `src/infrastructure/cache-hierarchy.ts`**

```typescript
import Database from "better-sqlite3";

interface CacheOptions {
  defaultTtlMs: number;
  maxEntries: number;
  l2Enabled: boolean;
  l2TtlMs?: number;
}

interface L1Entry {
  value: string;
  expiresAt: number;
}

export class CacheHierarchy {
  private l1: Map<string, L1Entry> = new Map();

  constructor(
    private db: Database,
    private options: CacheOptions
  ) {}

  get(key: string): string | null {
    const l1Val = this.l1.get(key);
    if (l1Val) {
      if (Date.now() < l1Val.expiresAt) return l1Val.value;
      this.l1.delete(key);
    }

    if (this.options.l2Enabled) {
      const row = this.db.prepare("SELECT value, ttl FROM cache_entries WHERE key = ?").get(key) as { value: string; ttl: number } | undefined;
      if (row) {
        if (Date.now() < row.ttl) {
          this.l1.set(key, { value: row.value, expiresAt: row.ttl });
          return row.value;
        }
        this.db.prepare("DELETE FROM cache_entries WHERE key = ?").run(key);
      }
    }

    return null;
  }

  set(key: string, value: string, ttlOverride?: number): void {
    const ttl = Date.now() + (ttlOverride ?? this.options.defaultTtlMs);
    this.l1.set(key, { value, expiresAt: ttl });

    if (this.l1.size > this.options.maxEntries) {
      const oldest = this.l1.keys().next().value!;
      this.l1.delete(oldest);
    }

    if (this.options.l2Enabled) {
      this.db.prepare(
        "INSERT OR REPLACE INTO cache_entries (key, value, ttl, created_at) VALUES (?, ?, ?, ?)"
      ).run(key, value, ttl, new Date().toISOString());
    }
  }

  invalidate(key: string): void {
    this.l1.delete(key);
    if (this.options.l2Enabled) {
      this.db.prepare("DELETE FROM cache_entries WHERE key = ?").run(key);
    }
  }

  invalidateBySite(siteId: string): void {
    const prefix = `${siteId}:`;
    for (const key of this.l1.keys()) {
      if (key.startsWith(prefix)) this.l1.delete(key);
    }
    if (this.options.l2Enabled) {
      this.db.prepare("DELETE FROM cache_entries WHERE key LIKE ?").run(`${prefix}%`);
    }
  }

  size(): number {
    return this.l1.size;
  }

  clear(): void {
    this.l1.clear();
    if (this.options.l2Enabled) {
      this.db.prepare("DELETE FROM cache_entries").run();
    }
  }
}
```

- [ ] **Step 3: Create `src/infrastructure/credential-manager.ts`**

```typescript
import crypto from "crypto";
import Database from "better-sqlite3";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export class CredentialManager {
  private masterKey: Buffer;

  constructor(
    private db: Database,
    masterKeyHex?: string
  ) {
    if (masterKeyHex) {
      this.masterKey = Buffer.from(masterKeyHex, "hex");
    } else {
      this.masterKey = crypto.randomBytes(KEY_LENGTH);
    }
  }

  private deriveKey(siteId: string): Buffer {
    const salt = Buffer.from(siteId, "utf-8").subarray(0, 16);
    return crypto.hkdfSync("sha256", this.masterKey, salt, Buffer.from("seo-mcp-creds", "utf-8"), KEY_LENGTH);
  }

  async store(siteId: string, username: string, appPassword: string): Promise<void> {
    const key = this.deriveKey(siteId);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const plaintext = Buffer.from(appPassword, "utf-8");
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();

    const ciphertext = Buffer.concat([encrypted, tag]);
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO credentials (site_id, username, app_password_ciphertext, encryption_key_id, nonce, created_at, last_used_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    stmt.run(siteId, username, ciphertext, "hkdf-sha256", iv, new Date().toISOString(), new Date().toISOString());
  }

  retrieve(siteId: string): { username: string; appPassword: string } | null {
    const row = this.db.prepare("SELECT username, app_password_ciphertext, nonce FROM credentials WHERE site_id = ?").get(siteId) as
      { username: string; app_password_ciphertext: Buffer; nonce: Buffer } | undefined;
    if (!row) return null;

    try {
      const key = this.deriveKey(siteId);
      const decipher = crypto.createDecipheriv(ALGORITHM, key, row.nonce);
      const tag = row.app_password_ciphertext.subarray(row.app_password_ciphertext.length - TAG_LENGTH);
      const encrypted = row.app_password_ciphertext.subarray(0, row.app_password_ciphertext.length - TAG_LENGTH);
      decipher.setAuthTag(tag);
      const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]);

      this.db.prepare("UPDATE credentials SET last_used_at = ? WHERE site_id = ?").run(new Date().toISOString(), siteId);

      return { username: row.username, appPassword: plaintext.toString("utf-8") };
    } catch {
      // if decryption fails, return null and log
      return null;
    }
  }

  delete(siteId: string): void {
    this.db.prepare("DELETE FROM credentials WHERE site_id = ?").run(siteId);
  }

  list(): string[] {
    return this.db.prepare("SELECT site_id FROM credentials").all().map((r: any) => r.site_id);
  }

  getMasterKeyHex(): string {
    return this.masterKey.toString("hex");
  }
}
```

- [ ] **Step 4: Create remaining infrastructure**

```typescript
// src/infrastructure/lock-manager.ts
import Database from "better-sqlite3";

export class LockManager {
  constructor(private db: Database) {
    db.exec("PRAGMA busy_timeout = 5000");
  }

  async acquire(name: string, timeoutMs = 10000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        this.db.exec(`CREATE TABLE IF NOT EXISTS locks (name TEXT PRIMARY KEY, acquired_at TEXT)`);
        const stmt = this.db.prepare("INSERT OR IGNORE INTO locks (name, acquired_at) VALUES (?, ?)");
        const result = stmt.run(name, new Date().toISOString());
        if (result.changes > 0) return true;
      } catch {
        // lock held, retry
      }
      await new Promise(r => setTimeout(r, 100));
    }
    return false;
  }

  release(name: string): void {
    this.db.prepare("DELETE FROM locks WHERE name = ?").run(name);
  }

  isHeld(name: string): boolean {
    const row = this.db.prepare("SELECT 1 FROM locks WHERE name = ?").get(name);
    return !!row;
  }
}
```

```typescript
// src/infrastructure/graceful-shutdown.ts
export class GracefulShutdown {
  private handlers: Array<() => Promise<void>> = [];
  private shuttingDown = false;

  constructor() {
    process.on("SIGTERM", () => this.shutdown());
    process.on("SIGINT", () => this.shutdown());
    process.on("SIGHUP", () => this.shutdown());
  }

  register(handler: () => Promise<void>): void {
    this.handlers.push(handler);
  }

  async shutdown(): Promise<void> {
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    console.log("Shutting down gracefully...");
    for (const handler of this.handlers) {
      try {
        await handler();
      } catch (err) {
        console.error("Shutdown handler error:", err);
      }
    }
    process.exit(0);
  }
}
```

```typescript
// src/infrastructure/telemetry.ts
export interface TelemetryMetric {
  name: string;
  value: number;
  type: "counter" | "gauge" | "histogram";
  labels?: Record<string, string>;
}

export interface TelemetrySpan {
  name: string;
  startTime: number;
  end(): void;
  setAttribute(key: string, value: string | number): void;
}

export class Telemetry {
  private metrics: TelemetryMetric[] = [];
  private enabled: boolean;

  constructor(enabled: boolean = false) {
    this.enabled = enabled;
  }

  counter(name: string, value: number = 1, labels?: Record<string, string>): void {
    if (!this.enabled) return;
    this.metrics.push({ name, value, type: "counter", labels });
  }

  gauge(name: string, value: number, labels?: Record<string, string>): void {
    if (!this.enabled) return;
    this.metrics.push({ name, value, type: "gauge", labels });
  }

  histogram(name: string, value: number, labels?: Record<string, string>): void {
    if (!this.enabled) return;
    this.metrics.push({ name, value, type: "histogram", labels });
  }

  startSpan(name: string): TelemetrySpan {
    const startTime = Date.now();
    const labels: Record<string, string | number> = {};
    return {
      name,
      startTime,
      setAttribute(key: string, value: string | number) { labels[key] = value; },
      end: () => {
        const duration = Date.now() - startTime;
        this.histogram(`${name}.duration`, duration, labels as Record<string, string>);
      },
    };
  }

  flush(): TelemetryMetric[] {
    const snapshot = [...this.metrics];
    this.metrics = [];
    return snapshot;
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/infrastructure/cache-hierarchy.test.ts tests/infrastructure/credential-manager.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/infrastructure/cache-hierarchy.ts src/infrastructure/credential-manager.ts src/infrastructure/lock-manager.ts src/infrastructure/graceful-shutdown.ts src/infrastructure/telemetry.ts tests/infrastructure/cache-hierarchy.test.ts tests/infrastructure/credential-manager.test.ts
git commit -m "feat: add cache hierarchy, credential manager, lock manager, graceful shutdown, telemetry"
```

---

### Task 5: State Machine + Priority Queue + Job Scheduler + Event Store

**Files:**
- Create: `src/core/state-machine.ts`
- Create: `src/core/priority-queue.ts`
- Create: `src/core/job-scheduler.ts`
- Create: `src/core/event-store.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/core/state-machine.test.ts
import { describe, it, expect } from "vitest";
import { StateMachine } from "../../src/core/state-machine";

describe("StateMachine", () => {
  it("initializes with idle state", () => {
    const sm = new StateMachine("post-1");
    expect(sm.currentState).toBe("idle");
  });

  it("transitions to valid state", () => {
    const sm = new StateMachine("post-1");
    sm.transition("queued");
    expect(sm.currentState).toBe("queued");
  });

  it("throws on invalid transition", () => {
    const sm = new StateMachine("post-1");
    expect(() => sm.transition("applied")).toThrow();
  });

  it("records history", () => {
    const sm = new StateMachine("post-1");
    sm.transition("queued");
    sm.transition("analyzing");
    expect(sm.history).toHaveLength(3); // idle + queued + analyzing
  });

  it("allows valid full workflow", () => {
    const sm = new StateMachine("post-1");
    sm.transition("queued");
    sm.transition("analyzing");
    sm.transition("analyzed");
    sm.transition("applying");
    sm.transition("applied");
    expect(sm.currentState).toBe("applied");
  });

  it("allows retry from failed", () => {
    const sm = new StateMachine("post-1");
    sm.transition("queued");
    sm.transition("analyzing");
    sm.transition("failed");
    sm.transition("queued");
    expect(sm.currentState).toBe("queued");
  });
});
```

```typescript
// tests/core/priority-queue.test.ts
import { describe, it, expect, vi } from "vitest";
import { PriorityQueue } from "../../src/core/priority-queue";
import Database from "better-sqlite3";

describe("PriorityQueue", () => {
  it("processes jobs in priority order", async () => {
    const db = new Database(":memory:");
    db.exec(`CREATE TABLE jobs (id TEXT PRIMARY KEY, type TEXT, site_id TEXT, payload TEXT, priority TEXT, status TEXT DEFAULT 'queued', retry_count INTEGER DEFAULT 0, max_retries INTEGER DEFAULT 3, correlation_id TEXT, error TEXT, created_at TEXT, started_at TEXT, completed_at TEXT)`);
    const pq = new PriorityQueue(db, { concurrency: { high: 10, medium: 10, low: 10 }, pollIntervalMs: 50 });
    const processed: string[] = [];
    pq.registerWorker((job) => { processed.push(job.id); return Promise.resolve(); });
    pq.enqueue({ id: "1", type: "analyze", siteId: "a", payload: {}, priority: "medium", status: "queued", retryCount: 0, maxRetries: 3, correlationId: "c1", createdAt: Date.now() });
    pq.enqueue({ id: "2", type: "analyze", siteId: "a", payload: {}, priority: "high", status: "queued", retryCount: 0, maxRetries: 3, correlationId: "c2", createdAt: Date.now() });
    pq.enqueue({ id: "3", type: "analyze", siteId: "a", payload: {}, priority: "low", status: "queued", retryCount: 0, maxRetries: 3, correlationId: "c3", createdAt: Date.now() });
    await new Promise(r => setTimeout(r, 300));
    expect(processed[0]).toBe("2"); // high first
    expect(processed[1]).toBe("1"); // medium second
    expect(processed[2]).toBe("3"); // low third
    pq.stop();
  });
});
```

- [ ] **Step 2: Create `src/core/state-machine.ts`**

```typescript
export type PostState = "idle" | "queued" | "analyzing" | "analyzed" | "applying" | "applied" | "failed" | "rollingback" | "rollback-complete";

const TRANSITIONS: Record<PostState, PostState[]> = {
  "idle": ["queued"],
  "queued": ["analyzing", "cancelled"],
  "analyzing": ["analyzed", "failed"],
  "analyzed": ["applying", "queued"],
  "applying": ["applied", "failed", "rollingback"],
  "applied": ["analyzing", "rollingback"],
  "failed": ["queued", "applying"],
  "rollingback": ["rollback-complete", "failed"],
  "rollback-complete": ["idle", "queued"],
};

interface TransitionRecord {
  from: PostState;
  to: PostState;
  timestamp: number;
}

export class StateMachine {
  private _currentState: PostState = "idle";
  private _history: TransitionRecord[] = [];
  private _postId: string;

  constructor(postId: string | number, initialState?: PostState) {
    this._postId = String(postId);
    if (initialState) this._currentState = initialState;
    this._history.push({ from: "idle", to: this._currentState, timestamp: Date.now() });
  }

  get currentState(): PostState { return this._currentState; }
  get history(): TransitionRecord[] { return [...this._history]; }
  get postId(): string { return this._postId; }

  transition(newState: PostState): void {
    const allowed = TRANSITIONS[this._currentState];
    if (!allowed || !allowed.includes(newState)) {
      throw new Error(`Invalid transition: ${this._currentState} → ${newState}`);
    }
    const oldState = this._currentState;
    this._currentState = newState;
    this._history.push({ from: oldState, to: newState, timestamp: Date.now() });
  }

  canTransitionTo(state: PostState): boolean {
    return (TRANSITIONS[this._currentState] ?? []).includes(state);
  }

  reset(): void {
    this._currentState = "idle";
    this._history = [{ from: "idle", to: "idle", timestamp: Date.now() }];
  }

  toJSON(): Record<string, unknown> {
    return { postId: this._postId, state: this._currentState, history: this._history };
  }
}
```

- [ ] **Step 3: Create `src/core/priority-queue.ts`**

```typescript
import Database from "better-sqlite3";
import type { Job, QueueLane } from "../types/queue";

const PRIORITY_ORDER: QueueLane[] = ["high", "medium", "low"];

interface QueueOptions {
  concurrency: { high: number; medium: number; low: number };
  pollIntervalMs: number;
}

export class PriorityQueue {
  private lanes: Map<QueueLane, Job[]> = new Map();
  private activeCount = 0;
  private worker: ((job: Job) => Promise<void>) | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private db: Database,
    private options: QueueOptions
  ) {
    for (const lane of PRIORITY_ORDER) this.lanes.set(lane, []);
  }

  registerWorker(worker: (job: Job) => Promise<void>): void {
    this.worker = worker;
  }

  enqueue(job: Job): void {
    const lane = this.lanes.get(job.priority as QueueLane) ?? this.lanes.get("medium")!;
    lane.push(job);
    this.persistJob(job);
    if (!this.running) this.start();
  }

  enqueueBatch(jobs: Job[]): void {
    const insert = this.db.prepare(
      "INSERT INTO jobs (id, type, site_id, payload, priority, status, max_retries, correlation_id, error, created_at) VALUES (?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?)"
    );
    const tx = this.db.transaction((batch: Job[]) => {
      for (const job of batch) {
        const lane = this.lanes.get(job.priority as QueueLane) ?? this.lanes.get("medium")!;
        lane.push(job);
        insert.run(job.id, job.type, job.siteId, JSON.stringify(job.payload), job.priority, job.maxRetries, job.correlationId, null, new Date(job.createdAt).toISOString());
      }
    });
    tx(jobs);
    if (!this.running) start();
  }

  start(): void {
    if (this.running || !this.worker) return;
    this.running = true;
    this.pollTimer = setInterval(() => this.processNext(), this.options.pollIntervalMs);
    this.processNext();
  }

  stop(): void {
    this.running = false;
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
  }

  private async processNext(): Promise<void> {
    if (!this.worker) return;

    for (const lane of PRIORITY_ORDER) {
      const queue = this.lanes.get(lane)!;
      const concurrency = this.options.concurrency[lane];
      while (queue.length > 0 && this.activeCount < concurrency) {
        const job = queue.shift()!;
        this.activeCount++;
        this.updateJobStatus(job.id, "running");
        this.worker(job)
          .then(() => {
            this.updateJobStatus(job.id, "completed");
            this.activeCount--;
          })
          .catch((err) => {
            job.retryCount++;
            if (job.retryCount >= job.maxRetries) {
              this.updateJobStatus(job.id, "failed", err.message);
            } else {
              queue.push(job);
              this.updateJobStatus(job.id, "queued");
            }
            this.activeCount--;
          });
      }
    }
  }

  private persistJob(job: Job): void {
    this.db.prepare(
      "INSERT INTO jobs (id, type, site_id, payload, priority, status, max_retries, correlation_id, error, created_at) VALUES (?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?)"
    ).run(job.id, job.type, job.siteId, JSON.stringify(job.payload), job.priority, job.maxRetries, job.correlationId, null, new Date(job.createdAt).toISOString());
  }

  private updateJobStatus(id: string, status: string, error?: string): void {
    if (status === "running") {
      this.db.prepare("UPDATE jobs SET status = ?, started_at = ? WHERE id = ?").run(status, new Date().toISOString(), id);
    } else if (status === "completed") {
      this.db.prepare("UPDATE jobs SET status = ?, completed_at = ? WHERE id = ?").run(status, new Date().toISOString(), id);
    } else if (status === "failed") {
      this.db.prepare("UPDATE jobs SET status = ?, error = ?, completed_at = ? WHERE id = ?").run(status, error, new Date().toISOString(), id);
    } else {
      this.db.prepare("UPDATE jobs SET status = ? WHERE id = ?").run(status, id);
    }
  }

  getQueueDepth(): Record<QueueLane, number> {
    return {
      high: this.lanes.get("high")!.length,
      medium: this.lanes.get("medium")!.length,
      low: this.lanes.get("low")!.length,
    };
  }
}
```

- [ ] **Step 4: Create `src/core/job-scheduler.ts`**

```typescript
import type { PriorityQueue } from "./priority-queue";
import type { Job, JobType, JobPriority } from "../types/queue";

interface ScheduledJob {
  id: string;
  schedule: string;      // cron expression: "*/5 * * * *"
  type: JobType;
  siteId: string;
  payload: Record<string, unknown>;
  priority: JobPriority;
  lastRun?: number;
  enabled: boolean;
}

function parseCron(expression: string): number {
  // Simple interval parser: "*/N * * * *" = every N minutes
  const match = expression.match(/^\*\/(\d+)\s+\*\s+\*\s+\*\s+\*$/);
  if (match) return parseInt(match[1]) * 60 * 1000;
  // "* * * * *" = every minute
  if (expression === "* * * * *") return 60 * 1000;
  return 60 * 60 * 1000; // default: every hour
}

export class JobScheduler {
  private scheduled: Map<string, ScheduledJob> = new Map();
  private timers: Map<string, ReturnType<typeof setInterval>> = new Map();

  constructor(private queue: PriorityQueue) {}

  add(job: ScheduledJob): void {
    this.scheduled.set(job.id, job);
    const interval = parseCron(job.schedule);
    this.scheduleJob(job, interval);
  }

  remove(id: string): void {
    this.scheduled.delete(id);
    const timer = this.timers.get(id);
    if (timer) { clearInterval(timer); this.timers.delete(id); }
  }

  private scheduleJob(job: ScheduledJob, intervalMs: number): void {
    const run = () => {
      const now = Date.now();
      if (job.lastRun && now - job.lastRun < intervalMs) return;
      job.lastRun = now;
      // Recalculate interval from last run to handle drift
    };
    this.timers.set(job.id, setInterval(() => {
      const j: Job = {
        id: `sched-${job.id}-${Date.now()}`,
        type: job.type,
        siteId: job.siteId,
        payload: job.payload,
        priority: job.priority,
        status: "queued",
        retryCount: 0,
        maxRetries: 3,
        correlationId: `sched-${job.id}`,
        createdAt: Date.now(),
      };
      this.queue.enqueue(j);
    }, intervalMs));
  }

  list(): ScheduledJob[] {
    return Array.from(this.scheduled.values());
  }

  stop(): void {
    for (const timer of this.timers.values()) clearInterval(timer);
    this.timers.clear();
  }
}
```

- [ ] **Step 5: Create `src/core/event-store.ts`**

```typescript
import Database from "better-sqlite3";
import type { SEOEvent } from "../types/events";

interface StoredEvent {
  id: string;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  version: number;
  data: string;
  metadata: string;
  created_at: string;
}

export class EventStore {
  constructor(private db: Database) {}

  append(aggregateType: string, aggregateId: string, event: SEOEvent): number {
    const version = this.nextVersion(aggregateType, aggregateId);
    this.db.prepare(
      `INSERT INTO events (id, aggregate_type, aggregate_id, event_type, version, data, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      event.metadata.correlationId,
      aggregateType,
      aggregateId,
      event.type,
      version,
      JSON.stringify(event.payload),
      JSON.stringify(event.metadata),
      new Date(event.metadata.timestamp).toISOString()
    );
    return version;
  }

  getEvents(aggregateType: string, aggregateId: string, sinceVersion?: number): StoredEvent[] {
    let query = "SELECT * FROM events WHERE aggregate_type = ? AND aggregate_id = ?";
    const params: unknown[] = [aggregateType, aggregateId];
    if (sinceVersion !== undefined) {
      query += " AND version > ?";
      params.push(sinceVersion);
    }
    query += " ORDER BY version ASC";
    return this.db.prepare(query).all(...params) as StoredEvent[];
  }

  getEventsByType(eventType: string, limit = 100): StoredEvent[] {
    return this.db.prepare(
      "SELECT * FROM events WHERE event_type = ? ORDER BY created_at DESC LIMIT ?"
    ).all(eventType, limit) as StoredEvent[];
  }

  private nextVersion(aggregateType: string, aggregateId: string): number {
    const row = this.db.prepare(
      "SELECT MAX(version) as maxVer FROM events WHERE aggregate_type = ? AND aggregate_id = ?"
    ).get(aggregateType, aggregateId) as { maxVer: number | null };
    return (row?.maxVer ?? 0) + 1;
  }

  getEventCount(): number {
    const row = this.db.prepare("SELECT COUNT(*) as count FROM events").get() as { count: number };
    return row.count;
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/core/state-machine.test.ts tests/core/priority-queue.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/core/state-machine.ts src/core/priority-queue.ts src/core/job-scheduler.ts src/core/event-store.ts tests/core/state-machine.test.ts tests/core/priority-queue.test.ts
git commit -m "feat: add state machine, priority queue, job scheduler, event store"
```

---

### Task 6: Scoring Engine + Snapshot Manager + Workflow Engine + Webhook Dispatcher

**Files:**
- Create: `src/core/scoring-engine.ts`
- Create: `src/core/snapshot-manager.ts`
- Create: `src/core/workflow-engine.ts`
- Create: `src/core/webhook-dispatcher.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/core/scoring-engine.test.ts
import { describe, it, expect } from "vitest";
import { ScoringEngine } from "../../src/core/scoring-engine";

describe("ScoringEngine", () => {
  it("returns perfect score with no issues", () => {
    const engine = new ScoringEngine();
    const result = engine.calculate([
      { plugin: "meta", score: 100, issues: [], data: {} },
      { plugin: "content", score: 100, issues: [], data: {} },
    ]);
    expect(result.overall).toBe(100);
  });

  it("returns 0 with all failing", () => {
    const engine = new ScoringEngine();
    const result = engine.calculate([
      { plugin: "meta", score: 0, issues: [{ field: "title", message: "missing", severity: "error" }], data: {} },
      { plugin: "content", score: 0, issues: [{ field: "headings", message: "missing", severity: "error" }], data: {} },
    ]);
    expect(result.overall).toBe(0);
  });

  it("returns weighted score", () => {
    const engine = new ScoringEngine();
    const result = engine.calculate([
      { plugin: "meta", score: 50, issues: [], data: {} },
      { plugin: "content", score: 100, issues: [], data: {} },
    ]);
    // meta weight 0.20, content weight 0.25 = (50*0.20 + 100*0.25) / (0.20+0.25) = 77.7
    expect(result.overall).toBe(78);
  });

  it("returns priority recommendations sorted by impact", () => {
    const engine = new ScoringEngine();
    const result = engine.calculate([
      {
        plugin: "meta", score: 0,
        issues: [{ field: "title", message: "missing title", severity: "error" }],
        data: { currentTitle: "" },
      },
    ]);
    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0].field).toBe("title");
    expect(result.recommendations[0].impact).toBe("high");
  });

  it("categorizes results", () => {
    const engine = new ScoringEngine();
    const result = engine.calculate([
      { plugin: "meta", score: 85, issues: [{ field: "desc", message: "short", severity: "warning" }], data: {} },
      { plugin: "content", score: 100, issues: [], data: {} },
    ]);
    expect(result.categories).toHaveProperty("meta");
    expect(result.categories).toHaveProperty("content");
  });
});
```

```typescript
// tests/core/snapshot-manager.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { SnapshotManager } from "../../src/core/snapshot-manager";
import Database from "better-sqlite3";

describe("SnapshotManager", () => {
  let db: Database;
  let sm: SnapshotManager;
  beforeEach(() => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE IF NOT EXISTS snapshots (aggregate_type TEXT, aggregate_id TEXT, version INTEGER, state TEXT, event_count INTEGER, created_at TEXT)");
    sm = new SnapshotManager(db);
  });

  it("stores and retrieves snapshots", () => {
    sm.save("post", "42", { title: "Test", meta: {} });
    const snapshot = sm.load("post", "42");
    expect(snapshot).not.toBeNull();
    expect(snapshot!.state).toHaveProperty("title", "Test");
  });

  it("returns null for nonexistent snapshot", () => {
    expect(sm.load("post", "999")).toBeNull();
  });

  it("keeps latest version on multiple saves", () => {
    sm.save("post", "42", { title: "v1" });
    sm.save("post", "42", { title: "v2" });
    const snapshot = sm.load("post", "42");
    expect(snapshot!.event_count).toBe(2);
  });

  it("prunes old snapshots over retention limit", () => {
    for (let i = 0; i < 60; i++) sm.save("post", "42", { title: `v${i}` });
    const all = db.prepare("SELECT COUNT(*) as c FROM snapshots WHERE aggregate_id = '42'").get() as { c: number };
    expect(all.c).toBeLessThanOrEqual(50);
  });
});
```

- [ ] **Step 2: Create `src/core/scoring-engine.ts`**

```typescript
import type { AnalyzeResult } from "../types/plugins";

interface CategoryScore {
  score: number;
  weight: number;
  issues: AnalyzeResult["issues"];
}

interface Recommendation {
  plugin: string;
  field: string;
  currentValue: string;
  suggestedValue: string;
  impact: "high" | "medium" | "low";
  effort: "easy" | "medium" | "hard";
  scoreGain: number;
}

interface ScoreResult {
  overall: number;
  categories: Record<string, CategoryScore>;
  recommendations: Recommendation[];
}

const DEFAULT_WEIGHTS: Record<string, number> = {
  meta: 0.20,
  content: 0.25,
  schema: 0.15,
  images: 0.10,
  technical: 0.15,
  performance: 0.15,
};

export class ScoringEngine {
  private weights: Record<string, number>;

  constructor(weights?: Record<string, number>) {
    this.weights = { ...DEFAULT_WEIGHTS, ...weights };
  }

  calculate(results: AnalyzeResult[]): ScoreResult {
    const categories: Record<string, CategoryScore> = {};
    const recommendations: Recommendation[] = [];

    for (const result of results) {
      categories[result.plugin] = {
        score: result.score,
        weight: this.weights[result.plugin] ?? 0.10,
        issues: result.issues,
      };

      for (const issue of result.issues) {
        const impact = issue.severity === "error" ? "high" : issue.severity === "warning" ? "medium" : "low";
        const scoreGain = impact === "high" ? 15 : impact === "medium" ? 8 : 3;
        recommendations.push({
          plugin: result.plugin,
          field: issue.field,
          currentValue: (result.data[issue.field] as string) ?? "",
          suggestedValue: "",
          impact,
          effort: "easy",
          scoreGain,
        });
      }
    }

    const sortedRecs = recommendations.sort((a, b) => b.scoreGain - a.scoreGain);

    let weightedSum = 0;
    let totalWeight = 0;
    for (const [, cat] of Object.entries(categories)) {
      weightedSum += cat.score * cat.weight;
      totalWeight += cat.weight;
    }
    const overall = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 100;

    return { overall, categories, recommendations: sortedRecs };
  }
}
```

- [ ] **Step 3: Create `src/core/snapshot-manager.ts`**

```typescript
import Database from "better-sqlite3";

interface SnapshotData {
  version: number;
  state: Record<string, unknown>;
  event_count: number;
  created_at: string;
}

const MAX_SNAPSHOTS_PER_AGGREGATE = 50;

export class SnapshotManager {
  constructor(private db: Database) {}

  save(aggregateType: string, aggregateId: string, state: Record<string, unknown>): SnapshotData {
    const latest = this.db.prepare(
      "SELECT MAX(version) as v FROM snapshots WHERE aggregate_type = ? AND aggregate_id = ?"
    ).get(aggregateType, aggregateId) as { v: number | null };
    const version = (latest?.v ?? 0) + 1;
    const eventCount = this.db.prepare(
      "SELECT COUNT(*) as c FROM events WHERE aggregate_type = ? AND aggregate_id = ?"
    ).get(aggregateType, aggregateId) as { c: number };

    this.db.prepare(
      "INSERT INTO snapshots (aggregate_type, aggregate_id, version, state, event_count, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(aggregateType, aggregateId, version, JSON.stringify(state), eventCount.c, new Date().toISOString());

    this.prune(aggregateType, aggregateId);
    return { version, state, event_count: eventCount.c, created_at: new Date().toISOString() };
  }

  load(aggregateType: string, aggregateId: string): SnapshotData | null {
    const row = this.db.prepare(
      "SELECT version, state, event_count, created_at FROM snapshots WHERE aggregate_type = ? AND aggregate_id = ? ORDER BY version DESC LIMIT 1"
    ).get(aggregateType, aggregateId) as { version: number; state: string; event_count: number; created_at: string } | undefined;
    if (!row) return null;
    return { version: row.version, state: JSON.parse(row.state), event_count: row.event_count, created_at: row.created_at };
  }

  listVersions(aggregateType: string, aggregateId: string): { version: number; created_at: string }[] {
    return this.db.prepare(
      "SELECT version, created_at FROM snapshots WHERE aggregate_type = ? AND aggregate_id = ? ORDER BY version DESC"
    ).all(aggregateType, aggregateId) as { version: number; created_at: string }[];
  }

  private prune(aggregateType: string, aggregateId: string): void {
    this.db.prepare(
      `DELETE FROM snapshots WHERE aggregate_type = ? AND aggregate_id = ? AND version NOT IN (
        SELECT version FROM snapshots WHERE aggregate_type = ? AND aggregate_id = ? ORDER BY version DESC LIMIT ?
      )`
    ).run(aggregateType, aggregateId, aggregateType, aggregateId, MAX_SNAPSHOTS_PER_AGGREGATE);
  }
}
```

- [ ] **Step 4: Create `src/core/workflow-engine.ts`**

```typescript
import type { SEOPlugin } from "../types/plugins";
import type { AnalyzeResult } from "../types/plugins";
import { EventBus } from "./event-bus";

export interface WorkflowStep {
  id: string;
  plugin: string;
  action: "analyze" | "apply";
  params?: Record<string, unknown>;
  dependsOn?: string[];
  condition?: {
    field: string;
    operator: "eq" | "neq" | "gt" | "exists";
    value: unknown;
  };
  onFailure: "abort" | "skip" | "continue";
}

export interface Workflow {
  id: string;
  name: string;
  steps: WorkflowStep[];
  timeout: number;
}

export class WorkflowEngine {
  constructor(
    private plugins: Map<string, SEOPlugin>,
    private eventBus: EventBus
  ) {}

  async execute(workflow: Workflow, context: Record<string, unknown>, correlationId: string): Promise<Record<string, unknown>> {
    const results: Record<string, unknown> = {};
    const stepResults: Record<string, unknown> = {};

    for (const step of workflow.steps) {
      if (step.dependsOn) {
        for (const dep of step.dependsOn) {
          if (!(dep in stepResults)) {
            if (step.onFailure === "abort") throw new Error(`Dependency ${dep} not completed for step ${step.id}`);
            if (step.onFailure === "skip") continue;
          }
        }
      }

      if (step.condition) {
        const fieldValue = this.resolvePath(context, step.condition.field);
        const met = this.evaluateCondition(fieldValue, step.condition);
        if (!met) {
          results[step.id] = { skipped: true, reason: `condition not met: ${step.condition.field}` };
          continue;
        }
      }

      const plugin = this.plugins.get(step.plugin);
      if (!plugin) {
        if (step.onFailure === "abort") throw new Error(`Plugin ${step.plugin} not found`);
        results[step.id] = { error: `Plugin ${step.plugin} not found` };
        continue;
      }

      try {
        let stepResult: unknown;
        if (step.action === "analyze") {
          stepResult = await plugin.analyze({ siteId: context["siteId"] as string, postId: context["postId"] as number, ...step.params });
        } else if (step.action === "apply" && plugin.apply) {
          stepResult = await plugin.apply({ siteId: context["siteId"] as string, postId: context["postId"] as number, ...step.params });
        }
        stepResults[step.id] = stepResult;
        results[step.id] = stepResult;
      } catch (err) {
        if (step.onFailure === "abort") throw err;
        results[step.id] = { error: (err as Error).message };
      }
    }

    return results;
  }

  private resolvePath(obj: Record<string, unknown>, path: string): unknown {
    return path.split(".").reduce((acc, part) => {
      if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[part];
      return undefined;
    }, obj as unknown);
  }

  private evaluateCondition(value: unknown, condition: WorkflowStep["condition"]!): boolean {
    switch (condition.operator) {
      case "eq": return value === condition.value;
      case "neq": return value !== condition.value;
      case "gt": return typeof value === "number" && typeof condition.value === "number" && value > condition.value;
      case "exists": return value !== null && value !== undefined;
      default: return true;
    }
  }
}
```

- [ ] **Step 5: Create `src/core/webhook-dispatcher.ts`**

```typescript
import crypto from "crypto";

interface WebhookRegistration {
  id: string;
  siteId: string;
  url: string;
  secret: string;
  events: string[];
}

export class WebhookDispatcher {
  private webhooks: Map<string, WebhookRegistration> = new Map();

  register(webhook: WebhookRegistration): void {
    this.webhooks.set(webhook.id, webhook);
  }

  unregister(id: string): void {
    this.webhooks.delete(id);
  }

  list(siteId?: string): WebhookRegistration[] {
    const all = Array.from(this.webhooks.values());
    return siteId ? all.filter(w => w.siteId === siteId) : all;
  }

  async dispatch(eventType: string, payload: unknown, siteId?: string): Promise<void> {
    const matching = Array.from(this.webhooks.values()).filter(w => {
      if (siteId && w.siteId !== siteId) return false;
      return w.events.some(e => e === eventType || e === "*" || e.endsWith("*") && eventType.startsWith(e.slice(0, -1)));
    });

    const body = JSON.stringify({
      specversion: "1.0",
      type: eventType,
      source: "wordpress-seo-mcp",
      id: crypto.randomUUID(),
      time: new Date().toISOString(),
      data: payload,
    });

    for (const webhook of matching) {
      this.sendWithRetry(webhook, body).catch(err => console.error(`Webhook ${webhook.id} failed:`, err.message));
    }
  }

  private async sendWithRetry(webhook: WebhookRegistration, body: string, attempt = 1): Promise<void> {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = crypto.createHmac("sha256", webhook.secret).update(`${timestamp}.${body}`).digest("hex");

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(webhook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/cloudevents+json",
          "X-SEO-Signature": signature,
          "X-SEO-Timestamp": timestamp,
          "X-SEO-Version": "2.0.0",
        },
        body,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch (err) {
      if (attempt < 5) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
        await new Promise(r => setTimeout(r, delay));
        return this.sendWithRetry(webhook, body, attempt + 1);
      }
      throw err;
    }
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/core/scoring-engine.test.ts tests/core/snapshot-manager.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/core/scoring-engine.ts src/core/snapshot-manager.ts src/core/workflow-engine.ts src/core/webhook-dispatcher.ts tests/core/scoring-engine.test.ts tests/core/snapshot-manager.test.ts
git commit -m "feat: add scoring engine, snapshot manager, workflow engine, webhook dispatcher"
```

---

### Task 7: Plugin SDK + Loader + Sandbox

**Files:**
- Create: `src/plugins/plugin-sdk.ts`
- Create: `src/plugins/plugin-loader.ts`
- Create: `src/plugins/__sandbox.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/plugins/plugin-loader.test.ts
import { describe, it, expect } from "vitest";
import { PluginLoader } from "../../src/plugins/plugin-loader";
import Database from "better-sqlite3";

describe("PluginLoader", () => {
  it("loads built-in plugins", async () => {
    const loader = new PluginLoader({ paths: [], autoDiscover: false });
    await loader.init();
    const plugins = loader.getPlugins();
    expect(plugins.size).toBeGreaterThan(0);
  });

  it("registers plugin capabilities", async () => {
    const loader = new PluginLoader({ paths: [], autoDiscover: false });
    await loader.init();
    const meta = loader.getPlugins().get("meta");
    expect(meta).toBeDefined();
    expect(meta!.manifest.capabilities.length).toBeGreaterThan(0);
  });

  it("resolves plugin dependencies", async () => {
    const loader = new PluginLoader({ paths: [], autoDiscover: false });
    await loader.init();
    const order = loader.getLoadOrder();
    expect(order).toBeInstanceOf(Array);
  });
});
```

```typescript
// tests/plugins/sandbox.test.ts
import { describe, it, expect } from "vitest";
import { runInSandbox } from "../../src/plugins/__sandbox";
import type { SEOPlugin } from "../../src/types/plugins";

describe("runInSandbox", () => {
  it("executes plugin function and returns result", async () => {
    const plugin = { id: "test", name: "Test", version: "1.0.0", description: "", manifest: { id: "test", name: "Test", version: "1.0.0", description: "", dependencies: [], permissions: ["read"], capabilities: [], hooks: [], config: {} } };
    const result = await runInSandbox(plugin as SEOPlugin, "analyze", () => Promise.resolve({ status: "ok" }), 5000);
    expect(result).toEqual({ status: "ok" });
  });

  it("throws on timeout", async () => {
    const plugin = { id: "test", name: "Test", version: "1.0.0", description: "", manifest: { id: "test", name: "Test", version: "1.0.0", description: "", dependencies: [], permissions: ["read"], capabilities: [], hooks: [], config: {} } };
    await expect(
      runInSandbox(plugin as SEOPlugin, "analyze", () => new Promise(r => setTimeout(r, 20000)), 50)
    ).rejects.toThrow("timed out");
  });
});
```

- [ ] **Step 2: Create `src/plugins/plugin-sdk.ts`**

```typescript
import type { SEOPlugin, PluginManifest, PluginContext } from "../types/plugins";
export type { SEOPlugin, PluginManifest, PluginContext };
```

- [ ] **Step 3: Create `src/plugins/__sandbox.ts`**

```typescript
import type { SEOPlugin } from "../types/plugins";
import { PluginError } from "../infrastructure/error-classes";

export async function runInSandbox<T>(
  plugin: SEOPlugin,
  action: string,
  fn: () => Promise<T>,
  timeout: number = 10000
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new PluginError(`Plugin ${plugin.id} timed out on ${action}`)), timeout);
  });
  try {
    const result = await Promise.race([fn(), timeoutPromise]);
    return result;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
```

- [ ] **Step 4: Create `src/plugins/plugin-loader.ts`**

```typescript
import type { SEOPlugin, PluginManifest } from "../types/plugins";
import type { PluginContext } from "../types/plugins";
import { PluginError } from "../infrastructure/error-classes";
import fs from "fs";
import path from "path";

interface PluginLoaderOptions {
  paths: string[];
  autoDiscover: boolean;
  hotReload?: boolean;
  watchIntervalMs?: number;
}

export class PluginLoader {
  private plugins: Map<string, SEOPlugin> = new Map();
  private loadOrder: string[] = [];
  private builtInPlugins: SEOPlugin[] = [];
  private options: PluginLoaderOptions;

  constructor(options: PluginLoaderOptions) {
    this.options = options;
  }

  registerBuiltIn(plugin: SEOPlugin): void {
    this.builtInPlugins.push(plugin);
  }

  async init(): Promise<void> {
    // Load built-in plugins first
    for (const plugin of this.builtInPlugins) {
      this.plugins.set(plugin.id, plugin);
      this.loadOrder.push(plugin.id);
    }

    // Load filesystem plugins if paths exist
    if (this.options.autoDiscover) {
      for (const dir of this.options.paths) {
        await this.loadFromDirectory(dir);
      }
    }

    // Validate dependencies
    this.validateDependencies();
  }

  private async loadFromDirectory(dir: string): Promise<void> {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const manifestPath = path.join(dir, entry.name, "plugin.json");
        if (fs.existsSync(manifestPath)) {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as PluginManifest;
          // Dynamic import the plugin module
          try {
            const mod = await import(path.join(dir, entry.name, "index.js"));
            if (mod.default && typeof mod.default.analyze === "function") {
              this.plugins.set(manifest.id, mod.default as SEOPlugin);
              this.loadOrder.push(manifest.id);
            }
          } catch (err) {
            console.error(`Failed to load plugin ${manifest.id}:`, (err as Error).message);
          }
        }
      }
    }
  }

  getPlugins(): Map<string, SEOPlugin> {
    return this.plugins;
  }

  getPlugin(id: string): SEOPlugin | undefined {
    return this.plugins.get(id);
  }

  getLoadOrder(): string[] {
    return [...this.loadOrder];
  }

  private validateDependencies(): void {
    for (const plugin of this.plugins.values()) {
      for (const dep of plugin.manifest.dependencies) {
        if (!this.plugins.has(dep)) {
          throw new PluginError(`Plugin ${plugin.id} depends on ${dep} which is not loaded`);
        }
        // Ensure dependency is before dependent in load order
        const depIdx = this.loadOrder.indexOf(dep);
        const pluginIdx = this.loadOrder.indexOf(plugin.id);
        if (depIdx > pluginIdx) {
          // Reorder: move dependency before plugin
          this.loadOrder.splice(depIdx, 1);
          this.loadOrder.splice(pluginIdx, 0, dep);
        }
      }
    }
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/plugins/plugin-loader.test.ts tests/plugins/sandbox.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/plugins/plugin-sdk.ts src/plugins/plugin-loader.ts src/plugins/__sandbox.ts tests/plugins/plugin-loader.test.ts tests/plugins/sandbox.test.ts
git commit -m "feat: add plugin SDK, dynamic loader, and sandbox"
```

---

### Task 8: Storage Layer — Migration Manager + Security Store

**Files:**
- Create: `src/services/storage/migration-manager.ts`
- Create: `src/services/storage/security-store.ts`
- Create: `src/migrations/001-initial.sql` through `006-security-events.sql`
- Modify: `src/services/storage/index.ts`

- [ ] **Step 1: Create migration SQL files**

**`src/migrations/001-initial.sql`** (existing schema):
```sql
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  post_id INTEGER,
  action TEXT NOT NULL,
  plugin TEXT,
  details TEXT,
  status TEXT DEFAULT 'success',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS seo_scores (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  post_id INTEGER NOT NULL,
  score INTEGER NOT NULL,
  breakdown TEXT,
  created_at TEXT NOT NULL
);
```

**`src/migrations/002-events.sql`**:
```sql
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  version INTEGER NOT NULL,
  data TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_aggregate ON events(aggregate_type, aggregate_id, version);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);

CREATE TABLE IF NOT EXISTS snapshots (
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  state TEXT NOT NULL,
  event_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  PRIMARY KEY (aggregate_type, aggregate_id, version)
);
```

**`src/migrations/003-jobs.sql`**:
```sql
CREATE TABLE IF NOT EXISTS jobs (
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
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status, priority, created_at);
```

**`src/migrations/004-cache.sql`**:
```sql
CREATE TABLE IF NOT EXISTS cache_entries (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  ttl INTEGER NOT NULL,
  site_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cache_ttl ON cache_entries(ttl);
CREATE INDEX IF NOT EXISTS idx_cache_site ON cache_entries(site_id);
```

**`src/migrations/005-credentials.sql`**:
```sql
CREATE TABLE IF NOT EXISTS credentials (
  site_id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  app_password_ciphertext BLOB NOT NULL,
  encryption_key_id TEXT NOT NULL,
  nonce BLOB NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  expires_at TEXT
);
CREATE TABLE IF NOT EXISTS locks (
  name TEXT PRIMARY KEY,
  acquired_at TEXT NOT NULL
);
```

**`src/migrations/006-security-events.sql`**:
```sql
CREATE TABLE IF NOT EXISTS security_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  site_id TEXT,
  correlation_id TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sec_events_type ON security_events(event_type);
CREATE INDEX IF NOT EXISTS idx_sec_events_created ON security_events(created_at);
```

- [ ] **Step 2: Write failing tests**

```typescript
// tests/services/migration-manager.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { MigrationManager } from "../../src/services/storage/migration-manager";
import Database from "better-sqlite3";
import path from "path";

describe("MigrationManager", () => {
  it("runs all migrations in order", () => {
    const db = new Database(":memory:");
    const mm = new MigrationManager(db, path.join(__dirname, "../../src/migrations"));
    mm.run();
    // Check tables exist
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
    const tableNames = tables.map(t => t.name);
    expect(tableNames).toContain("audit_log");
    expect(tableNames).toContain("events");
    expect(tableNames).toContain("jobs");
    expect(tableNames).toContain("cache_entries");
    expect(tableNames).toContain("credentials");
    expect(tableNames).toContain("security_events");
  });

  it("does not re-run completed migrations", () => {
    const db = new Database(":memory:");
    const mm = new MigrationManager(db, path.join(__dirname, "../../src/migrations"));
    mm.run();
    const initialCount = db.prepare("SELECT COUNT(*) as c FROM migration_version").get() as { c: number };
    mm.run();
    const afterCount = db.prepare("SELECT COUNT(*) as c FROM migration_version").get() as { c: number };
    expect(afterCount.c).toBe(initialCount.c);
  });
});
```

- [ ] **Step 3: Create `src/services/storage/migration-manager.ts`**

```typescript
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

export class MigrationManager {
  private db: Database;
  private migrationsDir: string;

  constructor(db: Database, migrationsDir: string) {
    this.db = db;
    this.migrationsDir = migrationsDir;
    this.db.exec(`CREATE TABLE IF NOT EXISTS migration_version (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )`);
  }

  run(): void {
    if (!fs.existsSync(this.migrationsDir)) return;

    const files = fs.readdirSync(this.migrationsDir)
      .filter(f => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const alreadyApplied = this.db.prepare("SELECT 1 FROM migration_version WHERE filename = ?").get(file);
      if (alreadyApplied) continue;

      const sql = fs.readFileSync(path.join(this.migrationsDir, file), "utf-8");
      const checksum = this.simpleHash(sql);

      this.db.exec(sql);
      this.db.prepare("INSERT INTO migration_version (filename, checksum, applied_at) VALUES (?, ?, ?)")
        .run(file, checksum, new Date().toISOString());

      console.log(`Migration applied: ${file}`);
    }
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return String(hash);
  }

  listApplied(): string[] {
    return this.db.prepare("SELECT filename FROM migration_version ORDER BY id").all().map((r: any) => r.filename);
  }
}
```

- [ ] **Step 4: Create `src/services/storage/security-store.ts`**

```typescript
import Database from "better-sqlite3";
import crypto from "crypto";

export class SecurityStore {
  constructor(private db: Database) {}

  log(eventType: string, siteId: string | undefined, correlationId: string, metadata?: Record<string, unknown>): void {
    this.db.prepare(
      "INSERT INTO security_events (id, event_type, site_id, correlation_id, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(
      crypto.randomUUID(),
      eventType,
      siteId ?? null,
      correlationId,
      metadata ? JSON.stringify(metadata) : null,
      new Date().toISOString()
    );
  }

  query(eventType?: string, limit = 100): Array<Record<string, unknown>> {
    if (eventType) {
      return this.db.prepare(
        "SELECT * FROM security_events WHERE event_type = ? ORDER BY created_at DESC LIMIT ?"
      ).all(eventType, limit) as Record<string, unknown>[];
    }
    return this.db.prepare(
      "SELECT * FROM security_events ORDER BY created_at DESC LIMIT ?"
    ).all(limit) as Record<string, unknown>[];
  }

  countByType(): Record<string, number> {
    const rows = this.db.prepare(
      "SELECT event_type, COUNT(*) as count FROM security_events GROUP BY event_type"
    ).all() as { event_type: string; count: number }[];
    const result: Record<string, number> = {};
    for (const row of rows) result[row.event_type] = row.count;
    return result;
  }
}
```

- [ ] **Step 5: Modify `src/services/storage/index.ts` to wire migration manager**

```typescript
import Database from "better-sqlite3";
import { MigrationManager } from "./migration-manager";
import { SecurityStore } from "./security-store";
import path from "path";

export class StorageEngine {
  db: Database;
  migrationManager: MigrationManager;
  securityStore: SecurityStore;

  constructor(sqlitePath: string) {
    this.db = new Database(sqlitePath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.migrationManager = new MigrationManager(this.db, path.join(__dirname, "../../migrations"));
    this.securityStore = new SecurityStore(this.db);

    // Run migrations on startup
    this.migrationManager.run();
  }

  close(): void {
    this.db.close();
  }

  vacuum(): void {
    this.db.exec("VACUUM");
  }
}
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run tests/services/migration-manager.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/services/storage/migration-manager.ts src/services/storage/security-store.ts src/services/storage/index.ts src/migrations/
git commit -m "feat: add migration manager, security store, and all SQL migrations"
```

---

### Task 9: Upgrade Site Pool + Management Plugin + Middleware

**Files:**
- Modify: `src/services/wordpress/site-pool.ts`
- Modify: `src/plugins/management.ts`
- Modify: `src/plugins/rollback.ts`
- Modify: `src/middleware/pipeline.ts`

- [ ] **Step 1: Upgrade site-pool.ts to use encrypted credentials**

```typescript
import { CredentialManager } from "../../infrastructure/credential-manager";
import type { AppConfig } from "../../types/config";

interface SiteEntry {
  id: string;
  url: string;
  config?: Partial<AppConfig>;
}

export class SitePool {
  private sites: Map<string, SiteEntry> = new Map();
  private credentialManager: CredentialManager;

  constructor(credentialManager: CredentialManager) {
    this.credentialManager = credentialManager;
  }

  add(id: string, url: string, username: string, appPassword: string, config?: Partial<AppConfig>): void {
    this.sites.set(id, { id, url, config });
    this.credentialManager.store(id, username, appPassword);
  }

  remove(id: string): void {
    this.sites.delete(id);
    this.credentialManager.delete(id);
  }

  get(id: string): SiteEntry | undefined {
    return this.sites.get(id);
  }

  getCredentials(id: string): { username: string; appPassword: string } | null {
    return this.credentialManager.retrieve(id);
  }

  list(): string[] {
    return Array.from(this.sites.keys());
  }

  getConfig(id: string): Partial<AppConfig> | undefined {
    return this.sites.get(id)?.config;
  }

  setConfig(id: string, config: Partial<AppConfig>): void {
    const site = this.sites.get(id);
    if (site) site.config = config;
  }
}
```

- [ ] **Step 2: Write tests and verify**

Run: `npx vitest run` — check existing tests still pass

- [ ] **Step 3: Upgrade middleware pipeline**

```typescript
// src/middleware/pipeline.ts
import type { EventBus } from "../core/event-bus";
import type { CacheHierarchy } from "../infrastructure/cache-hierarchy";
import type { RateLimiter } from "../infrastructure/rate-limiter";

export interface MiddlewareContext {
  toolName: string;
  params: Record<string, unknown>;
  siteId?: string;
  correlationId: string;
  eventBus?: EventBus;
  cache?: CacheHierarchy;
  rateLimiter?: RateLimiter;
}

export type MiddlewareFn = (ctx: MiddlewareContext, next: () => Promise<unknown>) => Promise<unknown>;

export class MiddlewarePipeline {
  private middlewares: MiddlewareFn[] = [];
  private eventBus?: EventBus;
  private cache?: CacheHierarchy;
  private rateLimiter?: RateLimiter;

  constructor() {}

  setEventBus(bus: EventBus): void { this.eventBus = bus; }
  setCache(cache: CacheHierarchy): void { this.cache = cache; }
  setRateLimiter(rl: RateLimiter): void { this.rateLimiter = rl; }

  use(mw: MiddlewareFn): void {
    this.middlewares.push(mw);
  }

  async execute(toolName: string, params: Record<string, unknown>, handler: (params: Record<string, unknown>) => Promise<unknown>): Promise<unknown> {
    const ctx: MiddlewareContext = {
      toolName,
      params,
      siteId: (params as any).site as string,
      correlationId: crypto.randomUUID(),
      eventBus: this.eventBus,
      cache: this.cache,
      rateLimiter: this.rateLimiter,
    };

    // Build middleware chain
    let index = -1;
    const dispatch = async (i: number): Promise<unknown> => {
      if (i <= index) throw new Error("next() called multiple times");
      index = i;
      if (i < this.middlewares.length) {
        return this.middlewares[i](ctx, () => dispatch(i + 1));
      }
      return handler(params);
    };

    return dispatch(0);
  }
}
```

- [ ] **Step 4: Upgrade rollback plugin**

```typescript
// src/plugins/rollback.ts — use SnapshotManager
import type { SEOPlugin, AnalyzeParams, ApplyParams, AnalyzeResult, ApplyResult } from "./plugin-sdk";
import { SnapshotManager } from "../core/snapshot-manager";
import { EventBus } from "../core/event-bus";

export function createRollbackPlugin(snapshotManager: SnapshotManager, eventBus: EventBus): SEOPlugin {
  return {
    id: "rollback",
    name: "Rollback Manager",
    version: "2.0.0",
    description: "Snapshot-based rollback and history",
    manifest: {
      id: "rollback", name: "Rollback Manager", version: "2.0.0", description: "",
      dependencies: [], permissions: ["write"], capabilities: [], hooks: [], config: {},
    },
    analyze: async (params: AnalyzeParams): Promise<AnalyzeResult> => {
      const snapshots = snapshotManager.listVersions("post", String(params.postId));
      return {
        plugin: "rollback", score: 100,
        issues: snapshots.length === 0 ? [{ field: "snapshots", message: "No snapshots available", severity: "info" }] : [],
        data: { snapshotCount: snapshots.length, snapshots },
      };
    },
    apply: async (params: ApplyParams): Promise<ApplyResult> => {
      // Restore from snapshot
      const snapshot = snapshotManager.load("post", String(params.postId));
      if (!snapshot) return { plugin: "rollback", success: false, changes: [], error: "No snapshot found" };
      eventBus.emit({
        type: "apply:rollback",
        payload: { postId: params.postId, version: snapshot.version },
        metadata: { correlationId: "", timestamp: Date.now() },
      });
      return { plugin: "rollback", success: true, changes: [{ field: "rollback", oldValue: "current", newValue: String(snapshot.version) }] };
    },
  };
}
```

- [ ] **Step 5: Run tests and commit**

Run: `npx vitest run`
Expected: All tests pass (update any broken tests)

```bash
git add src/services/wordpress/site-pool.ts src/middleware/pipeline.ts src/plugins/rollback.ts src/plugins/management.ts
git commit -m "feat: upgrade site pool with encryption, middleware pipeline, rollback with snapshots"
```

---

### Task 10: Wire Everything in index.ts + New Tools + Tests

**Files:**
- Modify: `src/index.ts`
- Modify: `src/types/mcp.ts`
- Modify: `src/types/seo.ts`

- [ ] **Step 1: Write `src/index.ts` — wire all components**

```typescript
import { Transport } from "./transport";
import { ToolRegistry } from "./orchestrator";
import { MiddlewarePipeline } from "./middleware/pipeline";
import { EventBus } from "./core/event-bus";
import { EventStore } from "./core/event-store";
import { ConfigManager } from "./core/config-manager";
import { ScoringEngine } from "./core/scoring-engine";
import { SnapshotManager } from "./core/snapshot-manager";
import { StateMachine } from "./core/state-machine";
import { WorkflowEngine } from "./core/workflow-engine";
import { WebhookDispatcher } from "./core/webhook-dispatcher";
import { PriorityQueue } from "./core/priority-queue";
import { JobScheduler } from "./core/job-scheduler";
import { CacheHierarchy } from "./infrastructure/cache-hierarchy";
import { CircuitBreaker } from "./infrastructure/circuit-breaker";
import { CredentialManager } from "./infrastructure/credential-manager";
import { RateLimiter } from "./infrastructure/rate-limiter";
import { Telemetry } from "./infrastructure/telemetry";
import { GracefulShutdown } from "./infrastructure/graceful-shutdown";
import { LockManager } from "./infrastructure/lock-manager";
import { SecurityStore } from "./services/storage/security-store";
import { StorageEngine } from "./services/storage/index";
import { SitePool } from "./services/wordpress/site-pool";
import { PluginLoader } from "./plugins/plugin-loader";
import { createRollbackPlugin } from "./plugins/rollback";
// ... import all existing plugins

import crypto from "crypto";
import path from "path";

async function main() {
  // Initialize storage
  const storage = new StorageEngine(process.env.SEO_SQLITE_PATH || "./data/seo.db");
  
  // Initialize core services
  const eventBus = new EventBus();
  const eventStore = new EventStore(storage.db);
  const configManager = new ConfigManager();
  const scoringEngine = new ScoringEngine();
  const snapshotManager = new SnapshotManager(storage.db);
  const telemetry = new Telemetry(process.env.SEO_TELEMETRY_ENABLED === "true");
  const cache = new CacheHierarchy(storage.db, {
    defaultTtlMs: configManager.get("cache.defaultTtlMs"),
    maxEntries: configManager.get("cache.maxEntries"),
    l2Enabled: configManager.get("cache.l2Enabled"),
  });
  const rateLimiter = new RateLimiter({
    requestsPerWindow: configManager.get("rateLimit.requestsPerWindow"),
    windowMs: configManager.get("rateLimit.windowMs"),
  });
  const lockManager = new LockManager(storage.db);
  
  // Initialize credential manager (with file-based key as fallback)
  const keyDir = path.dirname(process.env.SEO_SQLITE_PATH || "./data/seo.db");
  let masterKey = process.env.SEO_ENCRYPTION_KEY;
  if (!masterKey) {
    const keyPath = path.join(keyDir, "../secrets/master.key");
    try {
      masterKey = fs.readFileSync(keyPath, "utf-8").trim();
    } catch {
      // Will auto-generate
    }
  }
  const credentialManager = new CredentialManager(storage.db, masterKey);
  
  // Initialize site pool with encrypted credentials
  const sitePool = new SitePool(credentialManager);
  
  // Initialize queue + scheduler
  const queue = new PriorityQueue(storage.db, {
    concurrency: configManager.get("queue.concurrency"),
    pollIntervalMs: configManager.get("queue.pollIntervalMs"),
  });
  const scheduler = new JobScheduler(queue);
  
  // Initialize webhook dispatcher
  const webhookDispatcher = new WebhookDispatcher();
  
  // Initialize circuit breakers
  const wpApiBreaker = new CircuitBreaker({
    failureThreshold: configManager.get("circuitBreaker.failureThreshold"),
    resetTimeoutMs: configManager.get("circuitBreaker.resetTimeoutMs"),
    halfOpenMaxRequests: configManager.get("circuitBreaker.halfOpenMaxRequests"),
  }, "wp-api");
  
  const gscBreaker = new CircuitBreaker({
    failureThreshold: 5, resetTimeoutMs: 60000, halfOpenMaxRequests: 2,
  }, "gsc-api");
  
  wpApiBreaker.setEventBus(eventBus);
  gscBreaker.setEventBus(eventBus);
  
  // Initialize middleware
  const pipeline = new MiddlewarePipeline();
  pipeline.setEventBus(eventBus);
  pipeline.setCache(cache);
  pipeline.setRateLimiter(rateLimiter);
  
  // Load plugins
  const pluginLoader = new PluginLoader({ paths: ["./plugins"], autoDiscover: false });
  pluginLoader.registerBuiltIn(createRollbackPlugin(snapshotManager, eventBus));
  // ... register all existing plugins with context
  await pluginLoader.init();
  
  // Register tools
  const registry = new ToolRegistry();
  registry.registerTools(pluginLoader.getPlugins());
  
  // Register new infrastructure tools
  registry.register("seo-health", { params: { site: "string" }, handler: handleHealthCheck });
  registry.register("seo-score", { params: { site: "string", postId: "number" }, handler: handleScore });
  registry.register("batch-analyze", { params: { site: "string", postIds: "array" }, handler: handleBatchAnalyze });
  registry.register("batch-apply", { params: { site: "string", postIds: "array", fixes: "array" }, handler: handleBatchApply });
  registry.register("batch-status", { params: { jobId: "string" }, handler: handleBatchStatus });
  registry.register("cancel-job", { params: { jobId: "string" }, handler: handleCancelJob });
  registry.register("get-seo-report", { params: { site: "string", postId: "number" }, handler: handleReport });
  registry.register("list-workflows", { params: {}, handler: handleListWorkflows });
  registry.register("run-workflow", { params: {}, handler: handleRunWorkflow });
  registry.register("get-config", { params: { site: "string?" }, handler: handleGetConfig });
  registry.register("set-config", { params: { site: "string?", key: "string", value: "any" }, handler: handleSetConfig });
  registry.register("list-webhooks", { params: { site: "string?" }, handler: handleListWebhooks });
  registry.register("set-webhook", { params: { site: "string", url: "string", events: "array" }, handler: handleSetWebhook });
  registry.register("delete-webhook", { params: { id: "string" }, handler: handleDeleteWebhook });
  
  // Wire event bus to webhook dispatcher
  eventBus.on("**", (event) => {
    webhookDispatcher.dispatch(event.type, event.payload, event.metadata.siteId).catch(() => {});
    telemetry.counter("events.total", 1, { type: event.type });
  });
  
  // Graceful shutdown
  const shutdown = new GracefulShutdown();
  shutdown.register(async () => {
    queue.stop();
    scheduler.stop();
    storage.close();
    telemetry.flush();
  });
  
  // Start queue
  queue.start();
  
  // Start transport
  const transport = new Transport(registry);
  transport.start();
}

main().catch(console.error);
```

- [ ] **Step 2: Add new tool handlers in index.ts**

Implement minimal handlers for the 12 new tools. Each handler:
- Validates params
- Routes to relevant engine
- Returns result

- [ ] **Step 3: Write integration test**

```typescript
// tests/integration/full-system.test.ts
import { describe, it, expect } from "vitest";
// Test that all components wire together without error
```

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run`
Expected: All 70+ existing tests pass + new tests pass

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: Compiles successfully, outputs dist/index.js

- [ ] **Step 6: Commit**

```bash
git add src/index.ts src/types/mcp.ts src/types/seo.ts tests/integration/
git commit -m "feat: wire all components, add 12 new MCP tools, full system integration"
```

---

### Task 11: Final Verification

**Files:** All

- [ ] **Step 1: Type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Run all tests**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: Clean build

- [ ] **Step 4: Final commit**

```bash
git add .
git commit -m "chore: final verification - all types, tests, and build passing"
git push
```
