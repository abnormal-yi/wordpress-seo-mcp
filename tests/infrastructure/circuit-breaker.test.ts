import { describe, it, expect } from "vitest";
import { CircuitBreaker, DEFAULT_CIRCUIT_BREAKER_CONFIG } from "../../src/infrastructure/circuit-breaker";

describe("CircuitBreaker", () => {
  it("starts closed and allows requests", () => {
    const cb = new CircuitBreaker();
    expect(cb.getState("test")).toBe("closed");
    expect(cb.isAllowed("test")).toBe(true);
  });

  it("opens after failure threshold", () => {
    const cb = new CircuitBreaker({ ...DEFAULT_CIRCUIT_BREAKER_CONFIG, failureThreshold: 3 });
    cb.onFailure("test");
    cb.onFailure("test");
    expect(cb.isAllowed("test")).toBe(true);
    cb.onFailure("test");
    expect(cb.getState("test")).toBe("open");
    expect(cb.isAllowed("test")).toBe(false);
  });

  it("transitions from open to half-open after reset timeout", () => {
    const cb = new CircuitBreaker({ ...DEFAULT_CIRCUIT_BREAKER_CONFIG, failureThreshold: 2, resetTimeoutMs: 100 });
    cb.onFailure("test");
    cb.onFailure("test");
    expect(cb.getState("test")).toBe("open");
    expect(cb.isAllowed("test")).toBe(false);
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(cb.isAllowed("test")).toBe(true);
        expect(cb.getState("test")).toBe("half-open");
        resolve();
      }, 150);
    });
  });

  it("transitions from half-open to closed on success", () => {
    const cb = new CircuitBreaker({ ...DEFAULT_CIRCUIT_BREAKER_CONFIG, failureThreshold: 1, halfOpenMaxRequests: 2, resetTimeoutMs: 50 });
    cb.onFailure("test");
    expect(cb.getState("test")).toBe("open");
    // Wait for half-open
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(cb.isAllowed("test")).toBe(true);
        cb.onSuccess("test");
        cb.onSuccess("test");
        expect(cb.getState("test")).toBe("closed");
        resolve();
      }, 100);
    });
  });

  it("goes back to open from half-open on failure", () => {
    const cb = new CircuitBreaker({ ...DEFAULT_CIRCUIT_BREAKER_CONFIG, failureThreshold: 2, resetTimeoutMs: 50 });
    cb.onFailure("test");
    cb.onFailure("test");
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        cb.isAllowed("test"); // transitions to half-open
        cb.onFailure("test");
        expect(cb.getState("test")).toBe("open");
        resolve();
      }, 100);
    });
  });

  it("resets a circuit", () => {
    const cb = new CircuitBreaker({ ...DEFAULT_CIRCUIT_BREAKER_CONFIG, failureThreshold: 1 });
    cb.onFailure("test");
    expect(cb.getState("test")).toBe("open");
    cb.reset("test");
    expect(cb.getState("test")).toBe("closed");
  });

  it("tracks separate keys independently", () => {
    const cb = new CircuitBreaker({ ...DEFAULT_CIRCUIT_BREAKER_CONFIG, failureThreshold: 2 });
    cb.onFailure("a");
    cb.onFailure("b");
    cb.onFailure("a");
    expect(cb.getState("a")).toBe("open");
    expect(cb.getState("b")).toBe("closed");
  });
});
