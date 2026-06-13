import { describe, it, expect, vi } from "vitest";
import { WorkflowEngine } from "../../src/infrastructure/workflow-engine";

describe("WorkflowEngine", () => {
  it("creates and executes a workflow", async () => {
    const engine = new WorkflowEngine();
    const step1 = vi.fn().mockResolvedValue({ step1done: true });
    const step2 = vi.fn().mockResolvedValue({ step2done: true });
    const wf = engine.create("site-1", [
      { name: "step1", execute: step1 },
      { name: "step2", execute: step2 },
    ]);
    const result = await engine.execute(wf.id);
    expect(result.status).toBe("completed");
    expect(step1).toHaveBeenCalledTimes(1);
    expect(step2).toHaveBeenCalledTimes(1);
  });

  it("chains context between steps", async () => {
    const engine = new WorkflowEngine();
    const step1 = vi.fn().mockResolvedValue({ value: 1 });
    const step2 = vi.fn().mockImplementation(async (ctx) => ({ value: ctx.value + 1 }));
    const wf = engine.create("site-1", [
      { name: "add1", execute: step1 },
      { name: "add2", execute: step2 },
    ]);
    const result = await engine.execute(wf.id);
    expect(result.context.value).toBe(2);
  });

  it("fails on step error", async () => {
    const engine = new WorkflowEngine();
    const step1 = vi.fn().mockRejectedValue(new Error("oops"));
    const wf = engine.create("site-1", [{ name: "fail", execute: step1 }]);
    const result = await engine.execute(wf.id);
    expect(result.status).toBe("failed");
    expect(result.error).toContain("oops");
  });

  it("lists workflows with optional site filter", () => {
    const engine = new WorkflowEngine();
    engine.create("site-1", []);
    engine.create("site-2", []);
    engine.create("site-1", []);
    expect(engine.list("site-1")).toHaveLength(2);
    expect(engine.list()).toHaveLength(3);
  });

  it("throws for nonexistent workflow", async () => {
    const engine = new WorkflowEngine();
    await expect(engine.execute("nonexistent")).rejects.toThrow("nonexistent");
  });
});
