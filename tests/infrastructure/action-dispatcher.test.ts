import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventBus } from "../../src/core/event-bus";
import { ScoringEngine } from "../../src/infrastructure/scoring-engine";
import { CircuitBreaker } from "../../src/infrastructure/circuit-breaker";
import { LockManager } from "../../src/infrastructure/lock-manager";
import { PriorityQueue } from "../../src/infrastructure/priority-queue";

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
    pq.enqueue({ id: "heal-1", type: "batch-apply", siteId: "site-1", payload: {}, priority: "medium", status: "queued", retryCount: 0, maxRetries: 1, correlationId: "test", createdAt: Date.now() });
  });
});
