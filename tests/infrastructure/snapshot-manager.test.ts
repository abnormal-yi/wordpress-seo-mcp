import { describe, it, expect } from "vitest";
import { SnapshotManager } from "../../src/infrastructure/snapshot-manager";

describe("SnapshotManager", () => {
  it("creates and retrieves snapshots", () => {
    const sm = new SnapshotManager();
    const snap = sm.create("site-1", { title: "Test" }, "Initial snapshot");
    expect(sm.get(snap.id)).toBeDefined();
    expect(sm.get(snap.id)!.data.title).toBe("Test");
  });

  it("lists snapshots per site", () => {
    const sm = new SnapshotManager();
    sm.create("site-1", {});
    sm.create("site-1", {});
    sm.create("site-2", {});
    expect(sm.list("site-1")).toHaveLength(2);
    expect(sm.list("site-2")).toHaveLength(1);
  });

  it("gets latest snapshot", () => {
    const sm = new SnapshotManager();
    const snap1 = sm.create("site-1", { v: 1 });
    const snap2 = sm.create("site-1", { v: 2 });
    expect(sm.getLatest("site-1")!.data.v).toBe(2);
  });

  it("deletes a snapshot", () => {
    const sm = new SnapshotManager();
    const snap = sm.create("site-1", {});
    expect(sm.delete(snap.id)).toBe(true);
    expect(sm.get(snap.id)).toBeUndefined();
  });

  it("returns false when deleting nonexistent snapshot", () => {
    const sm = new SnapshotManager();
    expect(sm.delete("nonexistent")).toBe(false);
  });

  it("clears snapshots per site", () => {
    const sm = new SnapshotManager();
    sm.create("site-1", { a: 1 });
    sm.create("site-1", { b: 2 });
    sm.create("site-2", { c: 3 });
    sm.clear("site-1");
    expect(sm.list("site-1")).toHaveLength(0);
    expect(sm.list("site-2")).toHaveLength(1);
  });

  it("clears all snapshots", () => {
    const sm = new SnapshotManager();
    sm.create("site-1", {});
    sm.create("site-2", {});
    sm.clear();
    expect(sm.count()).toBe(0);
  });
});
