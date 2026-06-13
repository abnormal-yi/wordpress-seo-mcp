import type { AppConfig } from "../types/config";
import { ConfigError } from "../infrastructure/error-classes";

const DEFAULT_CONFIG: AppConfig = {
  retry: { maxAttempts: 3, initialDelayMs: 1000, maxDelayMs: 30000, backoff: "exponential", jitter: true },
  cache: { enabled: true, defaultTtlMs: 300000, maxEntries: 1000, l2Enabled: true, l2TtlMs: 3600000 },
  rateLimit: { enabled: true, requestsPerWindow: 60, windowMs: 60000 },
  circuitBreaker: { enabled: true, failureThreshold: 5, resetTimeoutMs: 30000, halfOpenMaxRequests: 3 },
  queue: { concurrency: { high: 5, medium: 3, low: 2 }, pollIntervalMs: 200 },
  logging: { level: "info", format: "human", output: "stdout" },
  telemetry: { enabled: false, serviceName: "wordpress-seo-mcp" },
  webhook: { maxAttempts: 5, timeoutMs: 10000 },
  monitor: { intervalMs: 3600000, enabled: false },
  storage: { sqlitePath: "./data/seo.db", vacuumIntervalMs: 86400000 },
};

export class ConfigManager {
  private globalConfig: AppConfig = { ...DEFAULT_CONFIG };
  private siteConfigs: Map<string, Partial<AppConfig>> = new Map();

  constructor(initialOverrides?: Partial<AppConfig>) {
    if (initialOverrides) {
      this.globalConfig = this.mergeDeep({ ...DEFAULT_CONFIG }, initialOverrides);
    }
  }

  get<T = unknown>(path: string, siteId?: string, requestOverrides?: Partial<AppConfig>): T {
    let config: AppConfig = { ...this.globalConfig };
    if (siteId && this.siteConfigs.has(siteId)) {
      config = this.mergeDeep(config, this.siteConfigs.get(siteId)!);
    }
    if (requestOverrides) {
      config = this.mergeDeep(config, requestOverrides);
    }
    const parts = path.split(".");
    let current: unknown = config;
    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== "object") {
        return undefined as T;
      }
      current = (current as Record<string, unknown>)[part];
    }
    return current as T;
  }

  getAll(siteId?: string): AppConfig {
    let config: AppConfig = { ...this.globalConfig };
    if (siteId && this.siteConfigs.has(siteId)) {
      config = this.mergeDeep(config, this.siteConfigs.get(siteId)!);
    }
    return config;
  }

  setSiteConfig(siteId: string, overrides: Partial<AppConfig>): void {
    this.validateConfig(overrides);
    this.siteConfigs.set(siteId, overrides);
  }

  removeSiteConfig(siteId: string): void {
    this.siteConfigs.delete(siteId);
  }

  private validateConfig(config: Partial<AppConfig>): void {
    if (config.retry?.maxAttempts !== undefined && config.retry.maxAttempts < 1) {
      throw new ConfigError("retry.maxAttempts must be >= 1");
    }
    if (config.retry?.maxAttempts !== undefined && config.retry.maxAttempts > 20) {
      throw new ConfigError("retry.maxAttempts must be <= 20");
    }
  }

  private mergeDeep<T>(target: T, source: Partial<T>): T {
    const result = { ...target };
    for (const key of Object.keys(source)) {
      const k = key as keyof T;
      if (source[k] !== null && typeof source[k] === "object" && !Array.isArray(source[k])) {
        result[k] = this.mergeDeep(
          (result[k] as object) || {},
          source[k] as object
        ) as T[keyof T];
      } else if (source[k] !== undefined) {
        result[k] = source[k] as T[keyof T];
      }
    }
    return result;
  }
}
