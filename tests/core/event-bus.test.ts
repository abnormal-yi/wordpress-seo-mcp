import { describe, it, expect, vi } from "vitest";
import { EventBus } from "../../src/core/event-bus";

describe("EventBus", () => {
  it("dispatches event to matching handler", () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on("analysis:complete", handler);
    bus.emit("analysis:complete", { postId: 1 }, { siteId: "test" });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("does not dispatch to non-matching handler", () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on("analysis:complete", handler);
    bus.emit("apply:start", {});
    expect(handler).not.toHaveBeenCalled();
  });

  it("supports wildcard pattern matching", () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on("analysis:*", handler);
    bus.emit("analysis:start", {});
    bus.emit("analysis:complete", {});
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("supports dot-notation in wildcards", () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on("error.*", handler);
    bus.emit("error.threshold", {});
    bus.emit("error.timeout", {});
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("supports double-wildcard catch-all", () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on("**", handler);
    bus.emit("any:event", {});
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("filters by siteId when filter is set", () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on("analysis:complete", handler, { siteId: "site-a" });
    bus.emit("analysis:complete", {}, { siteId: "site-b" });
    expect(handler).not.toHaveBeenCalled();
    bus.emit("analysis:complete", {}, { siteId: "site-a" });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("supports off() to unsubscribe", () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on("test", handler);
    bus.off("test", handler);
    bus.emit("test", {});
    expect(handler).not.toHaveBeenCalled();
  });

  it("supports returned unsubscribe function", () => {
    const bus = new EventBus();
    const handler = vi.fn();
    const unsub = bus.on("test", handler);
    unsub();
    bus.emit("test", {});
    expect(handler).not.toHaveBeenCalled();
  });

  it("handles async handlers without blocking emit", async () => {
    const bus = new EventBus();
    let resolved = false;
    bus.on("test", async () => { await Promise.resolve(); resolved = true; });
    bus.emit("test", {});
    await new Promise(r => setTimeout(r, 10));
    expect(resolved).toBe(true);
  });

  it("clear() removes all subscriptions", () => {
    const bus = new EventBus();
    bus.on("test", () => {});
    bus.on("other", () => {});
    expect(bus.listenerCount()).toBe(2);
    bus.clear();
    expect(bus.listenerCount()).toBe(0);
  });

  it("listenerCount() returns subscription count", () => {
    const bus = new EventBus();
    expect(bus.listenerCount()).toBe(0);
    bus.on("a", () => {});
    expect(bus.listenerCount()).toBe(1);
  });

  it("generates correlationId and timestamp when not provided", () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on("test", handler);
    bus.emit("test", {});
    const event = handler.mock.calls[0][0];
    expect(event.metadata.correlationId).toBeDefined();
    expect(event.metadata.timestamp).toBeGreaterThan(0);
  });
});
