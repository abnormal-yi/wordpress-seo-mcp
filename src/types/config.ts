export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoff: "exponential" | "linear" | "fixed";
  jitter: boolean;
}

export interface CacheConfig {
  enabled: boolean;
  defaultTtlMs: number;
  maxEntries: number;
  l2Enabled: boolean;
  l2TtlMs: number;
}

export interface RateLimitConfig {
  enabled: boolean;
  requestsPerWindow: number;
  windowMs: number;
}

export interface CircuitBreakerConfig {
  enabled: boolean;
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenMaxRequests: number;
}

export interface QueueConfig {
  concurrency: { high: number; medium: number; low: number };
  pollIntervalMs: number;
}

export interface LoggingConfig {
  level: "debug" | "info" | "warn" | "error";
  format: "json" | "human";
  output: "stdout" | "file";
  filePath?: string;
}

export interface TelemetryConfig {
  enabled: boolean;
  otlpEndpoint?: string;
  serviceName: string;
}

export interface WebhookConfig {
  maxAttempts: number;
  timeoutMs: number;
}

export interface MonitorConfig {
  intervalMs: number;
  enabled: boolean;
}

export interface StorageConfig {
  sqlitePath: string;
  vacuumIntervalMs: number;
}

export interface AppConfig {
  retry: RetryConfig;
  cache: CacheConfig;
  rateLimit: RateLimitConfig;
  circuitBreaker: CircuitBreakerConfig;
  queue: QueueConfig;
  logging: LoggingConfig;
  telemetry: TelemetryConfig;
  webhook: WebhookConfig;
  monitor: MonitorConfig;
  storage: StorageConfig;
}

export interface SiteConfig {
  id: string;
  url: string;
  username: string;
  overrides?: Partial<AppConfig>;
}
