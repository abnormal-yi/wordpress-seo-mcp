import { describe, it, expect } from "vitest";
import { definePlugin } from "../../src/plugin-sdk/index";

describe("definePlugin", () => {
  const baseManifest = {
    id: "test-plugin",
    name: "test-plugin",
    version: "1.0.0",
    description: "Test",
    dependencies: [] as string[],
    permissions: [] as string[],
    capabilities: [] as string[],
    hooks: ["analyze"] as string[],
    config: {} as Record<string, unknown>,
  };

  it("creates a valid plugin", () => {
    const plugin = definePlugin(
      { ...baseManifest, capabilities: [] },
      { analyze: async () => ({ plugin: "test-plugin", score: 0.8, issues: [], data: {} }) }
    );
    expect(plugin.manifest.name).toBe("test-plugin");
    expect(plugin.analyze).toBeDefined();
    expect(plugin.apply).toBeUndefined();
  });

  it("throws on missing name", () => {
    expect(() => definePlugin(
      { ...baseManifest, name: "" },
      { analyze: async () => ({ plugin: "test", score: 0, issues: [], data: {} }) }
    )).toThrow("name");
  });

  it("throws on missing version", () => {
    expect(() => definePlugin(
      { ...baseManifest, name: "test", version: "" },
      { analyze: async () => ({ plugin: "test", score: 0, issues: [], data: {} }) }
    )).toThrow("version");
  });
});
