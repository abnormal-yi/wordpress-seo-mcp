import { describe, it, expect } from "vitest";
import { CacheHierarchy } from "../../src/infrastructure/cache-hierarchy";

describe("CacheHierarchy", () => {
  it("stores and retrieves values", () => {
    const cache = new CacheHierarchy();
    cache.set("key1", "value1");
    expect(cache.get("key1")).toBe("value1");
  });

  it("returns undefined for missing keys", () => {
    const cache = new CacheHierarchy();
    expect(cache.get("nonexistent")).toBeUndefined();
  });

  it("respects TTL", async () => {
    const cache = new CacheHierarchy({ enabled: true, defaultTtlMs: 50, maxEntries: 1000, l2Enabled: false, l2TtlMs: 0 });
    cache.set("key", "value");
    expect(cache.get("key")).toBe("value");
    await new Promise(r => setTimeout(r, 60));
    expect(cache.get("key")).toBeUndefined();
  });

  it("evicts oldest entry when at max capacity", () => {
    const cache = new CacheHierarchy({ enabled: true, defaultTtlMs: 60000, maxEntries: 2, l2Enabled: false, l2TtlMs: 0 });
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe(2);
    expect(cache.get("c")).toBe(3);
  });

  it("returns correct size", () => {
    const cache = new CacheHierarchy();
    expect(cache.size).toBe(0);
    cache.set("a", 1);
    expect(cache.size).toBe(1);
  });

  it("clears all entries", () => {
    const cache = new CacheHierarchy();
    cache.set("a", 1);
    cache.set("b", 2);
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it("supports custom TTL per entry", async () => {
    const cache = new CacheHierarchy({ enabled: true, defaultTtlMs: 1000, maxEntries: 100, l2Enabled: false, l2TtlMs: 0 });
    cache.set("short", "x", 50);
    cache.set("long", "y", 500);
    await new Promise(r => setTimeout(r, 100));
    expect(cache.get("short")).toBeUndefined();
    expect(cache.get("long")).toBe("y");
  });
});
