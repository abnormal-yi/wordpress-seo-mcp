export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoff: "exponential" | "linear" | "fixed";
  jitter: boolean;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoff: "exponential",
  jitter: true,
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function calculateDelay(attempt: number, config: RetryConfig): number {
  const baseDelay = config.initialDelayMs;
  let d: number;
  switch (config.backoff) {
    case "exponential":
      d = Math.min(baseDelay * Math.pow(2, attempt), config.maxDelayMs);
      break;
    case "linear":
      d = Math.min(baseDelay * (attempt + 1), config.maxDelayMs);
      break;
    case "fixed":
      d = Math.min(baseDelay, config.maxDelayMs);
      break;
  }
  if (config.jitter) {
    d = d * (0.5 + Math.random() * 0.5);
  }
  return Math.floor(d);
}

export type RetryableOperation<T> = () => Promise<T>;

export async function retry<T>(
  operation: RetryableOperation<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  onRetry?: (error: Error, attempt: number) => void
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < config.maxAttempts - 1) {
        const retryDelay = calculateDelay(attempt, config);
        onRetry?.(lastError, attempt + 1);
        await delay(retryDelay);
      }
    }
  }
  throw lastError ?? new Error("Retry failed after all attempts");
}
