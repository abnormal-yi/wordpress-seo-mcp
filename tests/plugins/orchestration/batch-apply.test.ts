import { describe, it, expect } from "vitest";
import { SnapshotManager } from "../../../src/infrastructure/snapshot-manager";
import { EventBus } from "../../../src/core/event-bus";
import { retry, DEFAULT_RETRY_CONFIG } from "../../../src/infrastructure/retry-pipeline";

describe("batch-apply", () => {
  it("snapshot creates before-apply state", () => {
    const sm = new SnapshotManager();
    const snap = sm.create("site-1", { posts: [1, 2, 3] }, "pre-apply");
    expect(snap.description).toContain("pre-apply");
  });

  it("retry pipeline handles transient failures", async () => {
    let attempts = 0;
    const result = await retry(async () => {
      attempts++;
      if (attempts < 3) throw new Error("transient");
      return "ok";
    }, { ...DEFAULT_RETRY_CONFIG, maxAttempts: 3, initialDelayMs: 10 });
    expect(result).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("event bus emits apply lifecycle events", () => {
    const bus = new EventBus();
    const events: string[] = [];
    bus.on("apply:*", (e) => events.push(e.type));
    bus.emit("apply:start", {});
    bus.emit("apply:complete", {});
    bus.emit("apply:failed", {});
    expect(events).toEqual(["apply:start", "apply:complete", "apply:failed"]);
  });
});
