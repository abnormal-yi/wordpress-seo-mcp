import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Database from "better-sqlite3";
import { MigrationRunner } from "../../src/infrastructure/migration-runner";
import { SecurityStore } from "../../src/infrastructure/security-store";
import * as fs from "fs";

describe("SecurityStore", () => {
  const dbPath = "/tmp/test-security-store.db";
  let db: Database.Database;

  beforeAll(() => {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    db = new Database(dbPath);
    new MigrationRunner(db).run();
  });

  afterAll(() => {
    db.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  it("stores and retrieves credentials", () => {
    const store = new SecurityStore(db);
    store.storeCredential("site-1", "encrypted:abc123");
    const cred = store.getCredential("site-1");
    expect(cred).toBeDefined();
    expect(cred!.encrypted_data).toBe("encrypted:abc123");
  });

  it("updates existing credentials", () => {
    const store = new SecurityStore(db);
    store.storeCredential("site-update", "old-data");
    store.storeCredential("site-update", "new-data");
    const cred = store.getCredential("site-update");
    expect(cred!.encrypted_data).toBe("new-data");
    expect(cred!.rotated_at).toBeGreaterThan(0);
  });

  it("deletes credentials", () => {
    const store = new SecurityStore(db);
    store.storeCredential("site-delete", "data");
    expect(store.deleteCredential("site-delete")).toBe(true);
    expect(store.getCredential("site-delete")).toBeUndefined();
  });

  it("list all credentials", () => {
    const store = new SecurityStore(db);
    store.storeCredential("list-a", "a");
    store.storeCredential("list-b", "b");
    const list = store.listCredentials();
    expect(list.length).toBeGreaterThanOrEqual(2);
  });

  it("logs and retrieves audit entries", () => {
    const store = new SecurityStore(db);
    store.logAudit("test:action", "site-1", "user-1", "test details");
    const log = store.getAuditLog(10, "site-1");
    expect(log.length).toBeGreaterThanOrEqual(1);
    expect(log[0].action).toBe("test:action");
  });

  it("returns all audit entries when no site filter", () => {
    const store = new SecurityStore(db);
    store.logAudit("global:action");
    const log = store.getAuditLog(10);
    expect(log.length).toBeGreaterThan(0);
  });
});
