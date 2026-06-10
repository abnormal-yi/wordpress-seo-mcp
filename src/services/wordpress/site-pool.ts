import { SiteConfig, SiteConfigSchema } from '../../types/wordpress.js';
import { WpClient } from './client.js';

export class SitePool {
  private sites: Map<string, { config: SiteConfig; client: WpClient }> = new Map();

  addSite(name: string, config: SiteConfig): void {
    const parsed = SiteConfigSchema.parse(config);
    this.sites.set(name, { config: parsed, client: new WpClient(parsed) });
  }

  removeSite(name: string): void {
    this.sites.delete(name);
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
