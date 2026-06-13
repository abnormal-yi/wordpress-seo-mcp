import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Database from "better-sqlite3";
import * as fs from "fs";
import { MigrationRunner } from "../../src/infrastructure/migration-runner";
import { RulesEngine } from "../../src/infrastructure/rules-engine";
import { EventBus } from "../../src/core/event-bus";

describe("RulesEngine", () => {
  const dbPath = "/tmp/test-rules-engine.db";
  let db: Database.Database;
  let bus: EventBus;

  beforeAll(() => {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    db = new Database(dbPath);
    new MigrationRunner(db).run();
    bus = new EventBus();
  });

  afterAll(() => {
    db.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  it("adds and lists rules", () => {
    const engine = new RulesEngine(db, bus);
    engine.addRule("test-rule", { type: "event", pattern: "analysis:complete" }, { type: "log", params: {} });
    const rules = engine.listRules();
    expect(rules.length).toBeGreaterThanOrEqual(1);
    expect(rules[0].name).toBe("test-rule");
  });

  it("removes a rule", () => {
    const engine = new RulesEngine(db, bus);
    const rule = engine.addRule("remove-me", { type: "event", pattern: "test:*" }, { type: "log", params: {} });
    expect(engine.removeRule(rule.id)).toBe(true);
    expect(engine.listRules().find(r => r.id === rule.id)).toBeUndefined();
  });

  it("triggers on matching event", () => {
    const engine = new RulesEngine(db, bus);
    engine.addRule("catch-all", { type: "event", pattern: "**" }, { type: "log", params: {} });
    // Should not throw
    bus.emit("test:event", { some: "data" });
  });

  it("evaluates conditions", () => {
    const engine = new RulesEngine(db, bus);
    engine.addRule("score-check", { type: "event", pattern: "analysis:complete" }, { type: "log", params: {} }, { field: "score", operator: "lt", value: 0.5 });
    // Should not throw
    bus.emit("analysis:complete", { score: 0.3 });
    bus.emit("analysis:complete", { score: 0.8 });
  });

  it("persists rules across engine restarts", () => {
    const bus2 = new EventBus();
    const engine1 = new RulesEngine(db, bus2);
    engine1.addRule("persist-test", { type: "event", pattern: "test:*" }, { type: "log", params: {} });
    const engine2 = new RulesEngine(db, new EventBus());
    const rules = engine2.listRules();
    expect(rules.some(r => r.name === "persist-test")).toBe(true);
  });
});
