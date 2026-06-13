interface LockEntry {
  acquiredAt: number;
  ttlMs: number;
}

export class LockManager {
  private locks: Map<string, LockEntry> = new Map();

  acquire(key: string, ttlMs: number = 30000): boolean {
    this.evictExpired();
    if (this.locks.has(key)) return false;
    this.locks.set(key, { acquiredAt: Date.now(), ttlMs });
    return true;
  }

  release(key: string): boolean {
    return this.locks.delete(key);
  }

  isLocked(key: string): boolean {
    this.evictExpired();
    return this.locks.has(key);
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.locks) {
      if (now - entry.acquiredAt >= entry.ttlMs) {
        this.locks.delete(key);
      }
    }
  }
}
