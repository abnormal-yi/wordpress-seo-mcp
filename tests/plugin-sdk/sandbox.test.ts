import { describe, it, expect } from "vitest";
import { PluginSandbox } from "../../src/plugin-sdk/sandbox";
import type { SEOPlugin } from "../../src/types/plugins";

function makePlugin(name: string, overrides?: Partial<SEOPlugin>): SEOPlugin {
  return {
    id: name,
    name,
    version: "1.0.0",
    description: "",
    manifest: {
      id: name,
      name,
      version: "1.0.0",
      description: "",
      dependencies: [],
      permissions: [],
      capabilities: [],
      hooks: ["analyze", "apply"],
      config: {},
    },
    analyze: async () => ({ plugin: name, score: 0.8, issues: [], data: {} }),
    apply: async () => ({ plugin: name, success: true, changes: [] }),
    ...overrides,
  };
}

describe("PluginSandbox", () => {
  it("executes analyze hook", async () => {
    const sandbox = new PluginSandbox();
    const plugin = makePlugin("test");
    const result = await sandbox.analyze(plugin, { siteId: "1", postId: 1 });
    expect(result.score).toBe(0.8);
  });

  it("executes apply hook", async () => {
    const sandbox = new PluginSandbox();
    const plugin = makePlugin("test");
    const result = await sandbox.apply(plugin, { siteId: "1", postId: 1 });
    expect(result.success).toBe(true);
  });

  it("throws on timeout", async () => {
    const slowPlugin = makePlugin("slow", {
      analyze: async () => { await new Promise(r => setTimeout(r, 10000)); return { plugin: "slow", score: 0, issues: [], data: {} }; },
    });
    const sandbox = new PluginSandbox({ timeoutMs: 50 });
    await expect(sandbox.analyze(slowPlugin, { siteId: "1", postId: 1 })).rejects.toThrow("timed out");
  });

  it("wraps non-timeout errors", async () => {
    const brokenPlugin = makePlugin("broken", {
      analyze: async () => { throw new Error("internal error"); },
    });
    const sandbox = new PluginSandbox();
    await expect(sandbox.analyze(brokenPlugin, { siteId: "1", postId: 1 })).rejects.toThrow("failed");
  });

  it("throws if plugin doesn't support analyze", async () => {
    const noAnalyze = makePlugin("no-analyze", { analyze: undefined as any });
    const sandbox = new PluginSandbox();
    await expect(sandbox.analyze(noAnalyze, { siteId: "1", postId: 1 })).rejects.toThrow("does not support analyze");
  });
});
