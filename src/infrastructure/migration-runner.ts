import Database from "better-sqlite3";

interface Migration {
  version: number;
  name: string;
  sql: string;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "create_events_table",
    sql: `CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      correlation_id TEXT NOT NULL,
      site_id TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
    CREATE INDEX IF NOT EXISTS idx_events_site_id ON events(site_id);
    CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);`,
  },
  {
    version: 2,
    name: "create_credentials_table",
    sql: `CREATE TABLE IF NOT EXISTS credentials (
      site_id TEXT PRIMARY KEY,
      encrypted_data TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      rotated_at INTEGER
    );`,
  },
  {
    version: 3,
    name: "create_snapshots_table",
    sql: `CREATE TABLE IF NOT EXISTS snapshots (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      data TEXT NOT NULL,
      description TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_snapshots_site_id ON snapshots(site_id);`,
  },
  {
    version: 4,
    name: "create_queue_table",
    sql: `CREATE TABLE IF NOT EXISTS job_queue (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      site_id TEXT,
      payload TEXT,
      priority TEXT NOT NULL DEFAULT 'medium',
      status TEXT NOT NULL DEFAULT 'pending',
      retry_count INTEGER NOT NULL DEFAULT 0,
      max_retries INTEGER NOT NULL DEFAULT 3,
      created_at INTEGER NOT NULL,
      started_at INTEGER,
      completed_at INTEGER,
      error TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_queue_status ON job_queue(status);
    CREATE INDEX IF NOT EXISTS idx_queue_priority ON job_queue(priority);`,
  },
  {
    version: 5,
    name: "create_cache_table",
    sql: `CREATE TABLE IF NOT EXISTS cache (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_cache_expires ON cache(expires_at);`,
  },
  {
    version: 6,
    name: "create_audit_log_table",
    sql: `CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      site_id TEXT,
      user_id TEXT,
      details TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
    CREATE INDEX IF NOT EXISTS idx_audit_site_id ON audit_log(site_id);`,
  },
  {
    version: 7,
    name: "create_automation_rules_table",
    sql: `CREATE TABLE IF NOT EXISTS automation_rules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      trigger_json TEXT NOT NULL,
      condition_json TEXT,
      action_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );`,
  },
];

export class MigrationRunner {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  run(): void {
    this.ensureMetaTable();
    const applied = this.getAppliedVersions();
    for (const migration of MIGRATIONS) {
      if (applied.has(migration.version)) continue;
      this.db.exec(migration.sql);
      this.recordMigration(migration);
      console.log(`Applied migration v${migration.version}: ${migration.name}`);
    }
  }

  private ensureMetaTable(): void {
    this.db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    )`);
  }

  private getAppliedVersions(): Set<number> {
    const rows = this.db.prepare("SELECT version FROM _migrations").all() as { version: number }[];
    return new Set(rows.map((r) => r.version));
  }

  private recordMigration(migration: Migration): void {
    const checksum = this.simpleChecksum(migration.sql);
    this.db.prepare("INSERT INTO _migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)").run(
      migration.version, migration.name, checksum, Date.now()
    );
  }

  private simpleChecksum(sql: string): string {
    let hash = 0;
    for (let i = 0; i < sql.length; i++) {
      const char = sql.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return hash.toString(16);
  }
}
