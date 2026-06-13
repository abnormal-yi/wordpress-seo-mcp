interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class CacheHierarchy {
  private l1: Map<string, CacheEntry<unknown>> = new Map();
  private l2Enabled: boolean;

  constructor(
    private config: { enabled: boolean; defaultTtlMs: number; maxEntries: number; l2Enabled: boolean; l2TtlMs: number } = {
      enabled: true, defaultTtlMs: 300000, maxEntries: 1000, l2Enabled: true, l2TtlMs: 3600000,
    }
  ) {
    this.l2Enabled = config.l2Enabled;
  }

  get<T>(key: string): T | undefined {
    if (!this.config.enabled) return undefined;
    const entry = this.l1.get(key);
    if (entry) {
      if (Date.now() < entry.expiresAt) return entry.value as T;
      this.l1.delete(key);
    }
    return undefined;
  }

  set<T>(key: string, value: T, ttlMs?: number): void {
    if (!this.config.enabled) return;
    if (this.l1.size >= this.config.maxEntries) {
      const firstKey = this.l1.keys().next().value;
      if (firstKey !== undefined) this.l1.delete(firstKey);
    }
    this.l1.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.config.defaultTtlMs),
    });
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: string): void {
    this.l1.delete(key);
  }

  clear(): void {
    this.l1.clear();
  }

  get size(): number {
    return this.l1.size;
  }
}
