import { describe, it, expect } from "vitest";
import { PluginLoader } from "../../src/plugin-sdk/loader";
import type { SEOPlugin } from "../../src/types/plugins";

function makePlugin(name: string): SEOPlugin {
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
      hooks: [],
      config: {},
    },
    analyze: async () => ({ plugin: name, score: 0.8, issues: [], data: {} }),
  };
}

describe("PluginLoader", () => {
  it("registers a plugin in memory", () => {
    const loader = new PluginLoader();
    const plugin = makePlugin("test");
    loader.register(plugin);
    expect(loader.get("test")).toBeDefined();
  });

  it("prevents duplicate registration", () => {
    const loader = new PluginLoader();
    const plugin = makePlugin("dup");
    loader.register(plugin);
    expect(() => loader.register(plugin)).toThrow();
  });

  it("unregisters a plugin", () => {
    const loader = new PluginLoader();
    const plugin = makePlugin("test");
    loader.register(plugin);
    expect(loader.unregister("test")).toBe(true);
    expect(loader.get("test")).toBeUndefined();
  });

  it("lists all registered plugins", () => {
    const loader = new PluginLoader();
    const plugin = makePlugin("test");
    loader.register(plugin);
    expect(loader.list()).toHaveLength(1);
  });

  it("clears all plugins", () => {
    const loader = new PluginLoader();
    const plugin = makePlugin("test");
    loader.register(plugin);
    loader.clear();
    expect(loader.list()).toHaveLength(0);
  });

  it("handles missing directory gracefully", () => {
    const loader = new PluginLoader();
    const loaded = loader.loadFromDirectory("/nonexistent/path");
    expect(loaded).toEqual([]);
  });
});
