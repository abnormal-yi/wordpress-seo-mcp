import { z } from 'zod';
import { ToolPlugin } from '../orchestrator.js';
import { SitePool } from '../services/wordpress/site-pool.js';
import { SqliteStorage } from '../services/storage/sqlite.js';

export function createRollbackPlugin(pool: SitePool, storage: SqliteStorage): ToolPlugin {
  return {
    id: 'rollback',
    tools: [
      {
        name: 'rollback-seo',
        description: 'Undo the last SEO changes for a post',
        inputSchema: z.object({
          site: z.string(),
          postId: z.number(),
          plugin: z.string().optional(),
        }),
        handler: async (args) => {
          const logs = storage.getAuditLog(args.site, args.postId, args.plugin ? 1 : 5);
          if (logs.length === 0) {
            return { success: false, error: 'No changes to roll back' };
          }

          const client = pool.getClient(args.site);
          const results = [];
          for (const log of logs) {
            if (args.plugin && log.plugin !== args.plugin) continue;
            const before = log.beforeState as Record<string, any>;
            if (before.meta) {
              await client.updatePost(args.postId, { meta: before.meta });
            }
            if (before.content) {
              await client.updatePost(args.postId, { content: before.content });
            }
            results.push({ plugin: log.plugin, rolledBack: true });
          }

          return { success: true, data: { rolledBack: results } };
        },
      },
      {
        name: 'get-seo-history',
        description: 'View recent SEO change history for a post',
        inputSchema: z.object({
          site: z.string(),
          postId: z.number(),
          limit: z.number().default(10),
        }),
        handler: async (args) => {
          const logs = storage.getAuditLog(args.site, args.postId, args.limit);
          return { success: true, data: { history: logs } };
        },
      },
    ],
  };
}
