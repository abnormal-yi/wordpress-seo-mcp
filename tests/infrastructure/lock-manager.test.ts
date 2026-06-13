import { describe, it, expect } from "vitest";
import { LockManager } from "../../src/infrastructure/lock-manager";

describe("LockManager", () => {
  it("acquires a lock", () => {
    const lm = new LockManager();
    expect(lm.acquire("resource-1")).toBe(true);
    expect(lm.isLocked("resource-1")).toBe(true);
  });

  it("rejects duplicate acquisition", () => {
    const lm = new LockManager();
    expect(lm.acquire("resource-1")).toBe(true);
    expect(lm.acquire("resource-1")).toBe(false);
  });

  it("releases a lock", () => {
    const lm = new LockManager();
    lm.acquire("resource-1");
    expect(lm.release("resource-1")).toBe(true);
    expect(lm.isLocked("resource-1")).toBe(false);
  });

  it("auto-expires locks after TTL", async () => {
    const lm = new LockManager();
    lm.acquire("resource-1", 50);
    await new Promise(r => setTimeout(r, 60));
    expect(lm.isLocked("resource-1")).toBe(false);
  });

  it("handles multiple independent locks", () => {
    const lm = new LockManager();
    lm.acquire("a");
    lm.acquire("b");
    expect(lm.isLocked("a")).toBe(true);
    expect(lm.isLocked("b")).toBe(true);
    lm.release("a");
    expect(lm.isLocked("a")).toBe(false);
    expect(lm.isLocked("b")).toBe(true);
  });
});
