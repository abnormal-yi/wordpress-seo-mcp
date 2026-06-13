import { describe, it, expect } from "vitest";
import { EventStore } from "../../src/infrastructure/event-store";
import type { SEOEvent } from "../../src/types/events";

function makeEvent(type: string, siteId?: string): SEOEvent {
  return { type: type as any, payload: {}, metadata: { correlationId: "1", siteId, timestamp: Date.now() } };
}

describe("EventStore", () => {
  it("stores and returns events", () => {
    const store = new EventStore();
    store.append(makeEvent("analysis:complete"));
    expect(store.count()).toBe(1);
    expect(store.query()[0].type).toBe("analysis:complete");
  });

  it("filters by type", () => {
    const store = new EventStore();
    store.append(makeEvent("analysis:complete"));
    store.append(makeEvent("apply:start"));
    const results = store.query({ type: "analysis:complete" });
    expect(results).toHaveLength(1);
  });

  it("filters by siteId", () => {
    const store = new EventStore();
    store.append(makeEvent("analysis:complete", "site-a"));
    store.append(makeEvent("analysis:complete", "site-b"));
    expect(store.query({ siteId: "site-a" })).toHaveLength(1);
    expect(store.query({ siteId: "site-c" })).toHaveLength(0);
  });

  it("limits results", () => {
    const store = new EventStore(100);
    for (let i = 0; i < 10; i++) store.append(makeEvent("analysis:complete"));
    expect(store.query({ limit: 3 })).toHaveLength(3);
  });

  it("enforces max entries", () => {
    const store = new EventStore(3);
    for (let i = 0; i < 10; i++) store.append(makeEvent("analysis:complete"));
    expect(store.count()).toBe(3);
  });

  it("clears all events", () => {
    const store = new EventStore();
    store.append(makeEvent("analysis:complete"));
    store.clear();
    expect(store.count()).toBe(0);
  });
});
