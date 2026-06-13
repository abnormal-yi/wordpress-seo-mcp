import Database from "better-sqlite3";

interface CredentialRow {
  site_id: string;
  encrypted_data: string;
  created_at: number;
  rotated_at: number | null;
}

export class SecurityStore {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  storeCredential(siteId: string, encryptedData: string): void {
    const existing = this.db.prepare("SELECT site_id FROM credentials WHERE site_id = ?").get(siteId);
    if (existing) {
      this.db.prepare("UPDATE credentials SET encrypted_data = ?, rotated_at = ? WHERE site_id = ?").run(
        encryptedData, Date.now(), siteId
      );
    } else {
      this.db.prepare("INSERT INTO credentials (site_id, encrypted_data, created_at) VALUES (?, ?, ?)").run(
        siteId, encryptedData, Date.now()
      );
    }
  }

  getCredential(siteId: string): CredentialRow | undefined {
    return this.db.prepare("SELECT * FROM credentials WHERE site_id = ?").get(siteId) as CredentialRow | undefined;
  }

  deleteCredential(siteId: string): boolean {
    const result = this.db.prepare("DELETE FROM credentials WHERE site_id = ?").run(siteId);
    return result.changes > 0;
  }

  listCredentials(): CredentialRow[] {
    return this.db.prepare("SELECT * FROM credentials ORDER BY created_at DESC").all() as CredentialRow[];
  }

  logAudit(action: string, siteId?: string, userId?: string, details?: string): void {
    this.db.prepare("INSERT INTO audit_log (action, site_id, user_id, details, created_at) VALUES (?, ?, ?, ?, ?)").run(
      action, siteId ?? null, userId ?? null, details ?? null, Date.now()
    );
  }

  getAuditLog(limit: number = 100, siteId?: string): Array<{
    id: number; action: string; siteId: string | null; userId: string | null; details: string | null; createdAt: number;
  }> {
    let query = "SELECT * FROM audit_log";
    const params: unknown[] = [];
    if (siteId) {
      query += " WHERE site_id = ?";
      params.push(siteId);
    }
    query += " ORDER BY created_at DESC LIMIT ?";
    params.push(limit);
    return this.db.prepare(query).all(...params) as Array<{
      id: number; action: string; siteId: string | null; userId: string | null; details: string | null; createdAt: number;
    }>;
  }
}
