import { SiteConfig, SiteConfigSchema } from '../../types/wordpress.js';
import { WpClient } from './client.js';
import { EventBus } from '../../core/event-bus.js';
import { LockManager } from '../../infrastructure/lock-manager.js';
import { Telemetry } from '../../infrastructure/telemetry.js';
import { CredentialManager } from '../../infrastructure/credential-manager.js';
import { SecurityStore } from '../../infrastructure/security-store.js';

/** Public-safe view of a site config — never contains the raw appPassword. */
export interface PublicSiteConfig {
  name: string;
  url: string;
  username: string;
  appPassword: '***';
}

export class SitePool {
  private sites: Map<string, { config: Omit<SiteConfig, 'appPassword'>; client: WpClient }> = new Map();
  private bus?: EventBus;
  private locks: LockManager;
  private telemetry?: Telemetry;
  private credentials: CredentialManager;
  private securityStore?: SecurityStore;

  constructor(
    bus?: EventBus,
    locks?: LockManager,
    telemetry?: Telemetry,
    credentials?: CredentialManager,
    securityStore?: SecurityStore
  ) {
    this.bus = bus;
    this.locks = locks ?? new LockManager();
    this.telemetry = telemetry;
    this.credentials = credentials ?? new CredentialManager();
    this.securityStore = securityStore;
  }

  addSite(name: string, config: SiteConfig): void {
    if (!this.locks.acquire(`site:${name}`, 5000)) {
      throw new Error(`Site '${name}' is being modified concurrently`);
    }
    try {
      const parsed = SiteConfigSchema.parse(config);
      const { appPassword, ...rest } = parsed;

      // Encrypt and persist the credential; the raw value is only used in-memory
      // to construct the WpClient below and is never stored or returned as-is.
      this.credentials.store(name, appPassword);
      if (this.securityStore) {
        this.securityStore.storeCredential(name, this.credentials.export(name)!);
        this.securityStore.logAudit('site:added', name, undefined, `url=${rest.url}`);
      }

      this.sites.set(name, { config: rest, client: new WpClient(parsed) });
      this.bus?.emit("site:added", { name, url: rest.url }, { siteId: name });
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
      this.credentials.delete(name);
      if (this.securityStore) {
        this.securityStore.deleteCredential(name);
        this.securityStore.logAudit('site:removed', name);
      }
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

  /** Returns a redacted config — appPassword is never exposed via this method. */
  getConfig(name: string): PublicSiteConfig {
    const entry = this.sites.get(name);
    if (!entry) throw new Error(`Unknown site: ${name}`);
    return { ...entry.config, name, appPassword: '***' };
  }

  /**
   * Restore a site from previously persisted encrypted credentials at startup.
   * `meta` (url, username) should come from wherever non-secret site metadata is
   * persisted; this re-decrypts the appPassword and re-registers the site.
   */
  restoreSite(name: string, meta: { url: string; username: string }): void {
    if (!this.securityStore) return;
    const row = this.securityStore.getCredential(name);
    if (!row) return;
    this.credentials.import(name, row.encrypted_data);
    const appPassword = this.credentials.retrieve(name);
    if (!appPassword) return;
    this.addSite(name, { name, url: meta.url, username: meta.username, appPassword });
  }
}
