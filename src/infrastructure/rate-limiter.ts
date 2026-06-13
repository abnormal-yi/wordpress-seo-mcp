export interface RateLimitConfig {
  enabled: boolean;
  requestsPerWindow: number;
  windowMs: number;
}

export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  enabled: true,
  requestsPerWindow: 60,
  windowMs: 60000,
};

interface WindowEntry {
  count: number;
  windowStart: number;
}

export class RateLimiter {
  private windows: Map<string, WindowEntry> = new Map();

  constructor(private config: RateLimitConfig = DEFAULT_RATE_LIMIT_CONFIG) {}

  isAllowed(key: string): boolean {
    if (!this.config.enabled) return true;
    const now = Date.now();
    const entry = this.getOrCreateEntry(key, now);
    return entry.count < this.config.requestsPerWindow;
  }

  consume(key: string): boolean {
    if (!this.config.enabled) return true;
    const now = Date.now();
    const entry = this.getOrCreateEntry(key, now);
    entry.count++;
    return entry.count <= this.config.requestsPerWindow;
  }

  getRemaining(key: string): number {
    if (!this.config.enabled) return Infinity;
    const now = Date.now();
    const entry = this.getOrCreateEntry(key, now);
    return Math.max(0, this.config.requestsPerWindow - entry.count);
  }

  getResetTime(key: string): number {
    const now = Date.now();
    const entry = this.getOrCreateEntry(key, now);
    return entry.windowStart + this.config.windowMs;
  }

  reset(key: string): void {
    this.windows.delete(key);
  }

  resetAll(): void {
    this.windows.clear();
  }

  private getOrCreateEntry(key: string, now: number): WindowEntry {
    const existing = this.windows.get(key);
    if (existing && now - existing.windowStart < this.config.windowMs) {
      return existing;
    }
    const entry: WindowEntry = { count: 0, windowStart: now };
    this.windows.set(key, entry);
    return entry;
  }
}
