import { describe, it, expect } from "vitest";
import { RateLimiter, DEFAULT_RATE_LIMIT_CONFIG } from "../../src/infrastructure/rate-limiter";

describe("RateLimiter", () => {
  it("allows requests within limit", () => {
    const rl = new RateLimiter({ ...DEFAULT_RATE_LIMIT_CONFIG, requestsPerWindow: 3, windowMs: 1000 });
    expect(rl.consume("test")).toBe(true);
    expect(rl.consume("test")).toBe(true);
    expect(rl.consume("test")).toBe(true);
    expect(rl.consume("test")).toBe(false);
  });

  it("returns remaining count", () => {
    const rl = new RateLimiter({ ...DEFAULT_RATE_LIMIT_CONFIG, requestsPerWindow: 5, windowMs: 1000 });
    expect(rl.getRemaining("test")).toBe(5);
    rl.consume("test");
    rl.consume("test");
    expect(rl.getRemaining("test")).toBe(3);
  });

  it("resets after window expires", async () => {
    const rl = new RateLimiter({ ...DEFAULT_RATE_LIMIT_CONFIG, requestsPerWindow: 1, windowMs: 50 });
    expect(rl.consume("test")).toBe(true);
    expect(rl.consume("test")).toBe(false);
    await new Promise(r => setTimeout(r, 60));
    expect(rl.consume("test")).toBe(true);
  });

  it("resets specific key", () => {
    const rl = new RateLimiter({ ...DEFAULT_RATE_LIMIT_CONFIG, requestsPerWindow: 1, windowMs: 1000 });
    rl.consume("test");
    expect(rl.consume("test")).toBe(false);
    rl.reset("test");
    expect(rl.consume("test")).toBe(true);
  });

  it("allows all requests when disabled", () => {
    const rl = new RateLimiter({ ...DEFAULT_RATE_LIMIT_CONFIG, enabled: false, requestsPerWindow: 1, windowMs: 1000 });
    expect(rl.consume("test")).toBe(true);
    expect(rl.consume("test")).toBe(true);
    expect(rl.consume("test")).toBe(true);
  });

  it("tracks separate keys independently", () => {
    const rl = new RateLimiter({ ...DEFAULT_RATE_LIMIT_CONFIG, requestsPerWindow: 2, windowMs: 1000 });
    expect(rl.consume("a")).toBe(true);
    expect(rl.consume("a")).toBe(true);
    expect(rl.consume("a")).toBe(false);
    expect(rl.consume("b")).toBe(true);
  });
});
