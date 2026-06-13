import type Database from "better-sqlite3";

export interface AlertResult {
  siteId: string;
  alertType: "below_min_score" | "relative_drop";
  currentScore: number;
  previousAvg: number;
  threshold: number;
  dropPercent?: number;
  timestamp: number;
}

export interface AnomalyConfig {
  minScore: number;
  maxDropPercent: number;
  windowSize: number;
}

export class AnomalyDetector {
  private lastAlerts = new Map<string, { score: number; type: string }>();

  check(siteId: string, currentScore: number, db: Database.Database, config: AnomalyConfig): AlertResult[] {
    const windowSize = Math.max(2, config.windowSize);
    const minScore = Math.max(0, Math.min(1, config.minScore));
    const maxDrop = Math.max(0, config.maxDropPercent);

    const rows = db.prepare(
      "SELECT score FROM score_history WHERE site_id = ? ORDER BY analyzed_at DESC LIMIT ?"
    ).all(siteId, windowSize) as { score: number }[];

    if (rows.length < windowSize) return [];

    const previousAvg = rows.reduce((sum, r) => sum + r.score, 0) / rows.length;
    const dropPercent = previousAvg > 0 ? ((previousAvg - currentScore) / previousAvg) * 100 : 0;
    const results: AlertResult[] = [];

    if (currentScore < minScore) {
      const key = `${siteId}:below_min_score`;
      const last = this.lastAlerts.get(key);
      if (!last || last.score !== currentScore) {
        this.lastAlerts.set(key, { score: currentScore, type: "below_min_score" });
        results.push({
          siteId, alertType: "below_min_score", currentScore, previousAvg,
          threshold: minScore, timestamp: Date.now(),
        });
      }
    }

    if (dropPercent > maxDrop) {
      const key = `${siteId}:relative_drop`;
      const last = this.lastAlerts.get(key);
      if (!last || last.score !== currentScore) {
        this.lastAlerts.set(key, { score: currentScore, type: "relative_drop" });
        results.push({
          siteId, alertType: "relative_drop", currentScore, previousAvg,
          threshold: maxDrop, dropPercent, timestamp: Date.now(),
        });
      }
    }

    return results;
  }
}
