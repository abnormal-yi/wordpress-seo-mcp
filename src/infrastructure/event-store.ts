import type { SEOEvent } from "../types/events";

export interface EventStoreEntry {
  event: SEOEvent;
  storedAt: number;
}

export class EventStore {
  private events: EventStoreEntry[] = [];
  private maxEntries: number;

  constructor(maxEntries: number = 10000) {
    this.maxEntries = maxEntries;
  }

  append(event: SEOEvent): void {
    this.events.push({ event, storedAt: Date.now() });
    if (this.events.length > this.maxEntries) {
      this.events = this.events.slice(-this.maxEntries);
    }
  }

  query(options?: { type?: string; siteId?: string; limit?: number; since?: number }): SEOEvent[] {
    let filtered = this.events;
    if (options?.type) filtered = filtered.filter((e) => e.event.type === options.type);
    if (options?.siteId) filtered = filtered.filter((e) => e.event.metadata.siteId === options.siteId);
    if (options?.since) filtered = filtered.filter((e) => e.storedAt >= options.since!);
    if (options?.limit) filtered = filtered.slice(-options.limit);
    return filtered.map((e) => e.event);
  }

  count(): number {
    return this.events.length;
  }

  clear(): void {
    this.events = [];
  }
}
