import { describe, it, expect } from "vitest";
import { ScoringEngine } from "../../../src/infrastructure/scoring-engine";
import { SnapshotManager } from "../../../src/infrastructure/snapshot-manager";
import { EventBus } from "../../../src/core/event-bus";

describe("batch-analyze", () => {
  it("scoring engine aggregates correctly", () => {
    const engine = new ScoringEngine();
    const result = engine.score({ meta: { score: 1.0 }, content: { score: 0.5 } });
    expect(result.overall).toBeGreaterThan(0.7);
    expect(result.categories.meta).toBe(1.0);
  });

  it("snapshot manager stores results", () => {
    const sm = new SnapshotManager();
    const snap = sm.create("site-1", { score: 0.85 }, "test");
    expect(sm.get(snap.id)!.description).toBe("test");
  });

  it("event bus emits analysis events", () => {
    const bus = new EventBus();
    const events: string[] = [];
    bus.on("analysis:start", (e) => events.push(e.type));
    bus.on("analysis:complete", (e) => events.push(e.type));
    bus.emit("analysis:start", { postId: 1 });
    bus.emit("analysis:complete", { postId: 1, score: 0.8 });
    expect(events).toEqual(["analysis:start", "analysis:complete"]);
  });
});
