import { SiteConfig, SiteConfigSchema } from '../../types/wordpress.js';
import { WpClient } from './client.js';
import { EventBus } from '../../core/event-bus.js';
import { LockManager } from '../../infrastructure/lock-manager.js';
import { Telemetry } from '../../infrastructure/telemetry.js';

export class SitePool {
  private sites: Map<string, { config: SiteConfig; client: WpClient }> = new Map();
  private bus?: EventBus;
  private locks: LockManager;
  private telemetry?: Telemetry;

  constructor(bus?: EventBus, locks?: LockManager, telemetry?: Telemetry) {
    this.bus = bus;
    this.locks = locks ?? new LockManager();
    this.telemetry = telemetry;
  }

  addSite(name: string, config: SiteConfig): void {
    if (!this.locks.acquire(`site:${name}`, 5000)) {
      throw new Error(`Site '${name}' is being modified concurrently`);
    }
    try {
      const parsed = SiteConfigSchema.parse(config);
      this.sites.set(name, { config: parsed, client: new WpClient(parsed) });
      this.bus?.emit("site:added", { name, url: config.url }, { siteId: name });
      this.telemetry?.incrementCounter("sites.added");
    } finally {
      this.locks.release(`site:${name}`);
    }
  }

  removeSite(name: string): void {
    if (!this.locks.acquire(`site:${name}`, 5000)) {
      throw new Error(`Site '${name}' is being modified concurrently`);
    }
    try {
      this.sites.delete(name);
      this.bus?.emit("site:removed", { name }, { siteId: name });
      this.telemetry?.incrementCounter("sites.removed");
    } finally {
      this.locks.release(`site:${name}`);
    }
  }

  getClient(name: string): WpClient {
    const entry = this.sites.get(name);
    if (!entry) throw new Error(`Unknown site: ${name}. Use manage-sites to add it first.`);
    return entry.client;
  }

  listSites(): string[] {
    return Array.from(this.sites.keys());
  }

  getConfig(name: string): SiteConfig {
    const entry = this.sites.get(name);
    if (!entry) throw new Error(`Unknown site: ${name}`);
    return entry.config;
  }
}
