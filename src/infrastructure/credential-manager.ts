import * as crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const KEY_ITERATIONS = 600000;
const KEY_LENGTH = 32;
const SALT_LENGTH = 32;

export interface StoredCredential {
  encrypted: string;
  createdAt: number;
  rotatedAt?: number;
}

export class CredentialManager {
  private masterKey: Buffer;
  private storage: Map<string, StoredCredential> = new Map();

  constructor(masterKeyHex?: string) {
    const hex = masterKeyHex || process.env.SEO_ENCRYPTION_KEY;
    if (!hex) {
      throw new Error(
        "SEO_ENCRYPTION_KEY is not set. Generate one with `openssl rand -hex 32` " +
        "and set it as an environment variable. A randomly generated key is no " +
        "longer used as a fallback because it cannot survive process restarts, " +
        "which would make previously stored site credentials unrecoverable."
      );
    }
    this.masterKey = Buffer.from(hex, "hex");
    if (this.masterKey.length !== 32) {
      throw new Error("SEO_ENCRYPTION_KEY must be 32 bytes (64 hex chars)");
    }
  }

  /** Returns the encrypted blob for a stored credential, for persistence in SecurityStore. */
  export(siteId: string): string | undefined {
    return this.storage.get(siteId)?.encrypted;
  }

  /** Loads a previously persisted encrypted blob (e.g. from SecurityStore) into memory. */
  import(siteId: string, encrypted: string): void {
    this.storage.set(siteId, { encrypted, createdAt: Date.now() });
  }

  store(siteId: string, credential: string): void {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.masterKey, iv);
    const encrypted = Buffer.concat([cipher.update(credential, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    const stored: StoredCredential = {
      encrypted: iv.toString("hex") + tag.toString("hex") + encrypted.toString("hex"),
      createdAt: Date.now(),
    };
    this.storage.set(siteId, stored);
  }

  retrieve(siteId: string): string | undefined {
    const stored = this.storage.get(siteId);
    if (!stored) return undefined;
    const raw = Buffer.from(stored.encrypted, "hex");
    const iv = raw.subarray(0, IV_LENGTH);
    const tag = raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const encrypted = raw.subarray(IV_LENGTH + TAG_LENGTH);
    const decipher = crypto.createDecipheriv(ALGORITHM, this.masterKey, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString("utf8");
  }

  rotate(siteId: string, newCredential: string): void {
    const existing = this.storage.get(siteId);
    this.store(siteId, newCredential);
    if (existing) {
      this.storage.get(siteId)!.rotatedAt = Date.now();
    }
  }

  delete(siteId: string): void {
    this.storage.delete(siteId);
  }

  has(siteId: string): boolean {
    return this.storage.has(siteId);
  }
}
