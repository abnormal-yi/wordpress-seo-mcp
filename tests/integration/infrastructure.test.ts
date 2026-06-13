import { describe, it, expect } from "vitest";
import { EventBus } from "../../src/core/event-bus";
import { CacheHierarchy } from "../../src/infrastructure/cache-hierarchy";
import { LockManager } from "../../src/infrastructure/lock-manager";
import { Telemetry } from "../../src/infrastructure/telemetry";
import { PriorityQueue } from "../../src/infrastructure/priority-queue";
import { EventStore } from "../../src/infrastructure/event-store";
import { SnapshotManager } from "../../src/infrastructure/snapshot-manager";
import { CircuitBreaker } from "../../src/infrastructure/circuit-breaker";
import { RateLimiter } from "../../src/infrastructure/rate-limiter";
import { ScoringEngine } from "../../src/infrastructure/scoring-engine";
import { JobScheduler } from "../../src/infrastructure/job-scheduler";
import { ShutdownHandler } from "../../src/infrastructure/shutdown-handler";

describe("Full Infrastructure Integration", () => {
  it("all core components initialize without error", () => {
    const bus = new EventBus();
    const cache = new CacheHierarchy();
    const locks = new LockManager();
    const telemetry = new Telemetry();
    const queue = new PriorityQueue();
    const store = new EventStore();
    const snapshots = new SnapshotManager();
    const cb = new CircuitBreaker();
    const rl = new RateLimiter();
    const scoring = new ScoringEngine();
    const shutdown = new ShutdownHandler();

    expect(bus.listenerCount()).toBe(0);
    expect(cache.size).toBe(0);
    expect(queue.size()).toBe(0);
    expect(store.count()).toBe(0);
    expect(snapshots.count()).toBe(0);
    expect(shutdown.isShuttingDown()).toBe(false);
    expect(Object.keys(telemetry.snapshot().counters)).toHaveLength(0);
  });

  it("event bus, queue, and store work together", async () => {
    const bus = new EventBus();
    const store = new EventStore();
    const queue = new PriorityQueue({ high: 5, medium: 3, low: 2 }, undefined, bus);

    bus.on("queue:job-added", (event) => store.append(event));
    queue.enqueue({ id: "test-1", type: "meta", data: {}, priority: "high", createdAt: Date.now() } as any);

    expect(store.count()).toBe(1);
    expect(store.query()[0].type).toBe("queue:job-added");
  });

  it("circuit breaker integrates with event bus", () => {
    const bus = new EventBus();
    const store = new EventStore();
    bus.on("circuit:open", (event) => store.append(event));
    const cb = new CircuitBreaker({ enabled: true, failureThreshold: 2, resetTimeoutMs: 50000, halfOpenMaxRequests: 3 }, bus);
    cb.onFailure("test");
    cb.onFailure("test");
    expect(store.count()).toBe(1);
    expect(store.query()[0].type).toBe("circuit:open");
  });

  it("scoring engine works with telemetry", () => {
    const telemetry = new Telemetry();
    const scoring = new ScoringEngine();

    const result = scoring.score({ meta: { score: 0.9 } });
    telemetry.incrementCounter("analysis.completed");
    expect(result.overall).toBe(0.9);
    expect(telemetry.snapshot().counters["analysis.completed"]).toBe(1);
  });

  it("lock manager prevents concurrent access", () => {
    const locks = new LockManager();
    expect(locks.acquire("resource")).toBe(true);
    expect(locks.acquire("resource")).toBe(false);
    locks.release("resource");
    expect(locks.acquire("resource")).toBe(true);
  });

  it("shutdown handler executes all callbacks", async () => {
    const shutdown = new ShutdownHandler();
    let called = false;
    shutdown.onShutdown(async () => { called = true; });
    await shutdown.shutdown(100);
    expect(called).toBe(true);
    expect(shutdown.isShuttingDown()).toBe(true);
  });

  it("job scheduler integrates with priority queue", async () => {
    const results: string[] = [];
    const worker = async (job: any) => { results.push(job.id); };
    const queue = new PriorityQueue({ high: 5, medium: 3, low: 2 }, worker);
    const scheduler = new JobScheduler(queue);

    scheduler.schedule("test", "meta", 50, { siteId: "1" });
    await new Promise(r => setTimeout(r, 120));
    scheduler.stopAll();
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  it("cache, rate limiter, and circuit breaker all compose", () => {
    const cache = new CacheHierarchy();
    const rl = new RateLimiter({ enabled: true, requestsPerWindow: 5, windowMs: 10000 });
    const cb = new CircuitBreaker({ enabled: true, failureThreshold: 3, resetTimeoutMs: 30000, halfOpenMaxRequests: 3 });

    cache.set("key", "value");
    expect(cache.get("key")).toBe("value");
    expect(rl.consume("api")).toBe(true);
    expect(cb.isAllowed("service")).toBe(true);
  });
});
