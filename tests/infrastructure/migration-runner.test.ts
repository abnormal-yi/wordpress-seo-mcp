import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Database from "better-sqlite3";
import { MigrationRunner } from "../../src/infrastructure/migration-runner";
import * as fs from "fs";

describe("MigrationRunner", () => {
  const dbPath = "/tmp/test-migrations.db";
  let db: Database.Database;

  beforeAll(() => {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    db = new Database(dbPath);
  });

  afterAll(() => {
    db.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  it("creates migration tables", () => {
    const runner = new MigrationRunner(db);
    runner.run();
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[];
    expect(tables.some((t) => t.name === "events")).toBe(true);
    expect(tables.some((t) => t.name === "credentials")).toBe(true);
    expect(tables.some((t) => t.name === "snapshots")).toBe(true);
    expect(tables.some((t) => t.name === "job_queue")).toBe(true);
    expect(tables.some((t) => t.name === "cache")).toBe(true);
    expect(tables.some((t) => t.name === "audit_log")).toBe(true);
    expect(tables.some((t) => t.name === "automation_rules")).toBe(true);
    expect(tables.some((t) => t.name === "score_history")).toBe(true);
    expect(tables.some((t) => t.name === "monitor_config")).toBe(true);
    expect(tables.some((t) => t.name === "monitor_alerts")).toBe(true);
  });

  it("tracks applied migrations", () => {
    const runner = new MigrationRunner(db);
    runner.run();
    const applied = db.prepare("SELECT version, name FROM _migrations ORDER BY version").all() as { version: number; name: string }[];
    expect(applied).toHaveLength(8);
    expect(applied[0].name).toBe("create_events_table");
  });

  it("is idempotent", () => {
    const runner = new MigrationRunner(db);
    runner.run();
    runner.run(); // second run should not error
    const applied = db.prepare("SELECT COUNT(*) as count FROM _migrations").get() as { count: number };
    expect(applied.count).toBe(8);
  });
});
