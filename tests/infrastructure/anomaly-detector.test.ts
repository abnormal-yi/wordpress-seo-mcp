import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Database from "better-sqlite3";
import * as fs from "fs";
import { AnomalyDetector } from "../../src/infrastructure/anomaly-detector";

describe("AnomalyDetector", () => {
  const dbPath = "/tmp/test-anomaly-detector.db";
  let db: Database.Database;

  beforeAll(() => {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    db = new Database(dbPath);
    db.exec(`
      CREATE TABLE score_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        site_id TEXT NOT NULL,
        post_id TEXT,
        score REAL NOT NULL,
        component_scores TEXT,
        analyzed_at INTEGER NOT NULL
      );
      CREATE INDEX idx_score_history_site ON score_history(site_id, analyzed_at);
    `);
  });

  afterAll(() => {
    db.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  it("returns no alerts when insufficient history", () => {
    const detector = new AnomalyDetector();
    db.exec("DELETE FROM score_history");
    db.prepare("INSERT INTO score_history (site_id, score, analyzed_at) VALUES (?, ?, ?)").run("site-1", 0.8, 100);
    const result = detector.check("site-1", 0.7, db, { windowSize: 5, minScore: 0.5, maxDropPercent: 20 });
    expect(result).toEqual([]);
  });

  it("returns absolute threshold alert when score below minScore", () => {
    const detector = new AnomalyDetector();
    db.exec("DELETE FROM score_history");
    for (let i = 0; i < 6; i++) {
      db.prepare("INSERT INTO score_history (site_id, score, analyzed_at) VALUES (?, ?, ?)").run("site-1", 0.8, 1000 + i);
    }
    const result = detector.check("site-1", 0.3, db, { windowSize: 5, minScore: 0.5, maxDropPercent: 20 });
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].alertType).toBe("below_min_score");
  });

  it("returns relative drop alert when score drops significantly", () => {
    const detector = new AnomalyDetector();
    db.exec("DELETE FROM score_history");
    for (let i = 0; i < 6; i++) {
      db.prepare("INSERT INTO score_history (site_id, score, analyzed_at) VALUES (?, ?, ?)").run("site-1", 0.9, 1000 + i);
    }
    const result = detector.check("site-1", 0.5, db, { windowSize: 5, maxDropPercent: 20 });
    const drops = result.filter(r => r.alertType === "relative_drop");
    expect(drops.length).toBeGreaterThanOrEqual(1);
    expect(drops[0].dropPercent).toBeGreaterThan(20);
  });

  it("deduplicates alerts for unchanged score", () => {
    const detector = new AnomalyDetector();
    db.exec("DELETE FROM score_history");
    for (let i = 0; i < 6; i++) {
      db.prepare("INSERT INTO score_history (site_id, score, analyzed_at) VALUES (?, ?, ?)").run("site-1", 0.9, 1000 + i);
    }
    const first = detector.check("site-1", 0.3, db, { windowSize: 5, minScore: 0.5, maxDropPercent: 20 });
    expect(first.filter(a => a.alertType === "below_min_score").length).toBe(1);
    const second = detector.check("site-1", 0.3, db, { windowSize: 5, minScore: 0.5, maxDropPercent: 20 });
    const secondAlerts = second.filter(a => a.alertType === "below_min_score");
    expect(secondAlerts.length).toBe(0);
  });

  it("returns no alerts when score is healthy", () => {
    const detector = new AnomalyDetector();
    db.exec("DELETE FROM score_history");
    for (let i = 0; i < 6; i++) {
      db.prepare("INSERT INTO score_history (site_id, score, analyzed_at) VALUES (?, ?, ?)").run("site-1", 0.85, 1000 + i);
    }
    const result = detector.check("site-1", 0.82, db, { windowSize: 5, minScore: 0.5, maxDropPercent: 20 });
    expect(result).toEqual([]);
  });

  it("re-alerts when score changes after dedup", () => {
    const detector = new AnomalyDetector();
    db.exec("DELETE FROM score_history");
    for (let i = 0; i < 6; i++) {
      db.prepare("INSERT INTO score_history (site_id, score, analyzed_at) VALUES (?, ?, ?)").run("site-1", 0.9, 1000 + i);
    }
    detector.check("site-1", 0.3, db, { windowSize: 5, minScore: 0.5, maxDropPercent: 20 });
    const second = detector.check("site-1", 0.25, db, { windowSize: 5, minScore: 0.5, maxDropPercent: 20 });
    const alerts = second.filter(a => a.alertType === "below_min_score");
    expect(alerts.length).toBe(1);
  });
});
