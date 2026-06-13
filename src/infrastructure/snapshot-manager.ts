export interface Snapshot {
  id: string;
  siteId: string;
  timestamp: number;
  data: Record<string, unknown>;
  description?: string;
}

export class SnapshotManager {
  private snapshots: Map<string, Snapshot> = new Map();
  private siteSnapshots: Map<string, string[]> = new Map();

  create(siteId: string, data: Record<string, unknown>, description?: string): Snapshot {
    const id = `snap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const snapshot: Snapshot = { id, siteId, timestamp: Date.now(), data, description };
    this.snapshots.set(id, snapshot);
    const existing = this.siteSnapshots.get(siteId) || [];
    existing.push(id);
    this.siteSnapshots.set(siteId, existing);
    return snapshot;
  }

  get(id: string): Snapshot | undefined {
    return this.snapshots.get(id);
  }

  list(siteId: string): Snapshot[] {
    const ids = this.siteSnapshots.get(siteId) || [];
    return ids.map((id) => this.snapshots.get(id)!);
  }

  getLatest(siteId: string): Snapshot | undefined {
    const ids = this.siteSnapshots.get(siteId) || [];
    if (ids.length === 0) return undefined;
    return this.snapshots.get(ids[ids.length - 1]);
  }

  delete(id: string): boolean {
    const snapshot = this.snapshots.get(id);
    if (!snapshot) return false;
    this.snapshots.delete(id);
    const siteList = this.siteSnapshots.get(snapshot.siteId);
    if (siteList) {
      const idx = siteList.indexOf(id);
      if (idx >= 0) siteList.splice(idx, 1);
    }
    return true;
  }

  count(): number {
    return this.snapshots.size;
  }

  clear(siteId?: string): void {
    if (siteId) {
      const ids = this.siteSnapshots.get(siteId) || [];
      ids.forEach((id) => this.snapshots.delete(id));
      this.siteSnapshots.delete(siteId);
    } else {
      this.snapshots.clear();
      this.siteSnapshots.clear();
    }
  }
}
