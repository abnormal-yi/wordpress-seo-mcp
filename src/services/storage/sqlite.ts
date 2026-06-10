import Database from 'better-sqlite3';
import path from 'path';

export interface AuditEntry {
  site: string;
  postId: number;
  plugin: string;
  action: string;
  beforeState: Record<string, any>;
  afterState: Record<string, any>;
}

export interface AuditRecord extends AuditEntry {
  id: number;
  created_at: string;
}

export class SqliteStorage {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const resolvedPath = dbPath ?? path.join(process.cwd(), 'seo-mcp.db');
    this.db = new Database(resolvedPath);
    this.db.pragma('journal_mode = WAL');
    this.runMigrations();
  }

  runMigrations() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        site TEXT NOT NULL,
        post_id INTEGER NOT NULL,
        plugin TEXT NOT NULL,
        action TEXT NOT NULL,
        before_state TEXT,
        after_state TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_audit_site_post ON audit_log(site, post_id);
      CREATE TABLE IF NOT EXISTS seo_scores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        site TEXT NOT NULL,
        post_id INTEGER NOT NULL,
        score INTEGER NOT NULL,
        breakdown TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(site, post_id)
      );
    `);
  }

  logAudit(entry: AuditEntry): void {
    this.db.prepare(`
      INSERT INTO audit_log (site, post_id, plugin, action, before_state, after_state)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(entry.site, entry.postId, entry.plugin, entry.action,
      JSON.stringify(entry.beforeState), JSON.stringify(entry.afterState));
  }

  getAuditLog(site: string, postId: number, limit = 10): AuditRecord[] {
    const rows = this.db.prepare(`
      SELECT * FROM audit_log WHERE site = ? AND post_id = ? ORDER BY id DESC LIMIT ?
    `).all(site, postId, limit) as any[];
    return rows.map(r => ({
      ...r,
      beforeState: JSON.parse(r.before_state ?? '{}'),
      afterState: JSON.parse(r.after_state ?? '{}'),
    }));
  }

  saveScore(site: string, postId: number, score: number, breakdown: Record<string, any>): void {
    this.db.prepare(`
      INSERT INTO seo_scores (site, post_id, score, breakdown)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(site, post_id) DO UPDATE SET score = excluded.score, breakdown = excluded.breakdown
    `).run(site, postId, score, JSON.stringify(breakdown));
  }

  close(): void {
    this.db.close();
  }
}
