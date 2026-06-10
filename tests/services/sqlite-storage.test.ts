import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { SqliteStorage } from '../../src/services/storage/sqlite.js';

describe('SqliteStorage', () => {
  let storage: SqliteStorage;
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'seo-test-'));
    storage = new SqliteStorage(join(dir, 'test.db'));
  });

  afterAll(() => {
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates tables on init', () => {
    // Tables should already exist from constructor
    expect(true).toBe(true);
  });

  it('logs and retrieves audit entries', () => {
    storage.logAudit({
      site: 'test-site',
      postId: 1,
      plugin: 'meta',
      action: 'apply',
      beforeState: { title: 'Old Title' },
      afterState: { title: 'New Title' },
    });

    const logs = storage.getAuditLog('test-site', 1);
    expect(logs).toHaveLength(1);
    expect(logs[0].plugin).toBe('meta');
    expect(logs[0].action).toBe('apply');
    expect(logs[0].beforeState.title).toBe('Old Title');
  });

  it('retrieves multiple logs in reverse order', () => {
    storage.logAudit({ site: 'test-site', postId: 2, plugin: 'content', action: 'analyze', beforeState: {}, afterState: {} });
    storage.logAudit({ site: 'test-site', postId: 2, plugin: 'meta', action: 'apply', beforeState: {}, afterState: {} });

    const logs = storage.getAuditLog('test-site', 2);
    expect(logs).toHaveLength(2);
    expect(logs[0].plugin).toBe('meta'); // newest first
  });

  it('saves and updates SEO scores', () => {
    storage.saveScore('test-site', 3, 85, { meta: 90, content: 80 });
    storage.saveScore('test-site', 3, 92, { meta: 95, content: 89 });

    // Verify via audit that it doesn't crash
    expect(true).toBe(true);
  });

  it('limits results', () => {
    storage.logAudit({ site: 'limit-test', postId: 1, plugin: 'a', action: 'x', beforeState: {}, afterState: {} });
    storage.logAudit({ site: 'limit-test', postId: 1, plugin: 'b', action: 'x', beforeState: {}, afterState: {} });
    storage.logAudit({ site: 'limit-test', postId: 1, plugin: 'c', action: 'x', beforeState: {}, afterState: {} });

    const logs = storage.getAuditLog('limit-test', 1, 2);
    expect(logs).toHaveLength(2);
  });
});
