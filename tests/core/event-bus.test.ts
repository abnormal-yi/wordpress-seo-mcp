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
    await new Promise(r => setTimeout(r, 10));
    expect(resolved).toBe(true);
  });
});
