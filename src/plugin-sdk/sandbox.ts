import type { AnalyzeParams, AnalyzeResult, ApplyParams, ApplyResult, SEOPlugin } from "../types/plugins";
import { TimeoutError } from "../infrastructure/error-classes";

export interface SandboxConfig {
  timeoutMs: number;
}

export const DEFAULT_SANDBOX_CONFIG: SandboxConfig = {
  timeoutMs: 30000,
};

export class PluginSandbox {
  constructor(private config: SandboxConfig = DEFAULT_SANDBOX_CONFIG) {}

  async analyze(plugin: SEOPlugin, params: AnalyzeParams): Promise<AnalyzeResult> {
    if (!plugin.analyze) throw new Error(`Plugin "${plugin.manifest.name}" does not support analyze`);
    return this.executeWithTimeout(plugin.manifest.name, "analyze", () => plugin.analyze!(params));
  }

  async apply(plugin: SEOPlugin, params: ApplyParams): Promise<ApplyResult> {
    if (!plugin.apply) throw new Error(`Plugin "${plugin.manifest.name}" does not support apply`);
    return this.executeWithTimeout(plugin.manifest.name, "apply", () => plugin.apply!(params));
  }

  private async executeWithTimeout<T>(pluginName: string, hook: string, fn: () => Promise<T>): Promise<T> {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new TimeoutError(`Plugin "${pluginName}" ${hook} timed out after ${this.config.timeoutMs}ms`)), this.config.timeoutMs)
    );
    try {
      return await Promise.race([fn(), timeout]);
    } catch (err) {
      if (err instanceof TimeoutError) throw err;
      throw new Error(`Plugin "${pluginName}" ${hook} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
