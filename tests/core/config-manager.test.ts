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
    expect(cm.get("retry.maxAttempts")).toBe(3);
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

  it("validates config against rules", () => {
    const cm = new ConfigManager();
    expect(() => cm.setSiteConfig("site-a", { retry: { maxAttempts: -1 } })).toThrow();
    expect(() => cm.setSiteConfig("site-a", { retry: { maxAttempts: 25 } })).toThrow();
  });

  it("removes site config", () => {
    const cm = new ConfigManager();
    cm.setSiteConfig("site-a", { retry: { maxAttempts: 5 } });
    cm.removeSiteConfig("site-a");
    expect(cm.get("retry.maxAttempts", "site-a")).toBe(3);
  });

  it("accepts initial overrides", () => {
    const cm = new ConfigManager({ logging: { level: "debug", format: "json", output: "stdout" } });
    expect(cm.get("logging.level")).toBe("debug");
  });
});
