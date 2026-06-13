import { describe, it, expect } from "vitest";
import { StateMachine } from "../../src/infrastructure/state-machine";

describe("StateMachine", () => {
  it("starts in initial state", () => {
    const sm = new StateMachine("idle", []);
    expect(sm.getState()).toBe("idle");
  });

  it("allows valid transitions", async () => {
    const sm = new StateMachine("idle", [
      { from: "idle", to: "running" },
      { from: "running", to: "done" },
    ]);
    expect(await sm.transition("running")).toBe(true);
    expect(sm.getState()).toBe("running");
    expect(await sm.transition("done")).toBe(true);
    expect(sm.getState()).toBe("done");
  });

  it("rejects invalid transitions", async () => {
    const sm = new StateMachine("idle", [
      { from: "idle", to: "running" },
    ]);
    expect(await sm.transition("done")).toBe(false);
    expect(sm.getState()).toBe("idle");
  });

  it("checks guard conditions", async () => {
    let allowed = false;
    const sm = new StateMachine("idle", [
      { from: "idle", to: "running", guard: () => allowed },
    ]);
    expect(await sm.transition("running")).toBe(false);
    allowed = true;
    expect(await sm.transition("running")).toBe(true);
  });

  it("canTransition checks validity", () => {
    const sm = new StateMachine("idle", [
      { from: "idle", to: "running" },
    ]);
    expect(sm.canTransition("running")).toBe(true);
    expect(sm.canTransition("done")).toBe(false);
  });

  it("supports adding transitions dynamically", () => {
    const sm = new StateMachine("idle", []);
    sm.addTransition({ from: "idle", to: "running" });
    expect(sm.canTransition("running")).toBe(true);
  });
});
