import type { SEOPlugin, PluginManifest, PluginContext, AnalyzeParams, ApplyParams, AnalyzeResult, ApplyResult } from "../types/plugins";

export type { SEOPlugin, PluginManifest, PluginContext, AnalyzeParams, ApplyParams, AnalyzeResult, ApplyResult };

export function definePlugin(
  manifest: PluginManifest,
  hooks: Pick<SEOPlugin, "analyze"> & Partial<Pick<SEOPlugin, "apply" | "init" | "destroy" | "onActivate" | "onDeactivate" | "onConfigChange">>
): SEOPlugin {
  if (!manifest.name) throw new Error("Plugin name is required");
  if (!manifest.version) throw new Error("Plugin version is required");
  return {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    manifest,
    ...hooks,
  };
}
