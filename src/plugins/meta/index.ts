import { z } from 'zod';
import { ToolPlugin } from '../../orchestrator.js';
import { SitePool } from '../../services/wordpress/site-pool.js';
import { analyzeMeta } from './analyzer.js';
import { applyMetaFix } from './applier.js';

export function createMetaPlugin(pool: SitePool): ToolPlugin {
  return {
    id: 'meta',
    tools: [
      {
        name: 'analyze-seo',
        description: 'Analyze SEO meta tags of a WordPress page/post',
        inputSchema: z.object({
          site: z.string(),
          postId: z.number(),
        }),
        handler: async (args) => {
          const client = pool.getClient(args.site);
          const post = await client.getPost(args.postId);
          const metaResult = analyzeMeta(post);
          return { success: true, data: metaResult };
        },
      },
      {
        name: 'apply-seo',
        description: 'Apply SEO fixes to a WordPress page/post',
        inputSchema: z.object({
          site: z.string(),
          postId: z.number(),
          fixes: z.array(z.string()),
        }),
        handler: async (args) => {
          const client = pool.getClient(args.site);
          const post = await client.getPost(args.postId);
          const config = pool.getConfig(args.site);
          const siteName = new URL(config.url).hostname;

          const results = [];
          const allUpdates: Record<string, string> = {};

          for (const fixId of args.fixes) {
            const result = applyMetaFix(post, fixId, siteName);
            results.push({ pluginId: 'meta', success: true, changes: result.changes, fixId });
            Object.assign(allUpdates, result.updates);
          }

          // Build yoast-compatible meta updates
          const yoastMeta: Record<string, string> = {};
          if (allUpdates.title) yoastMeta['_yoast_wpseo_title'] = allUpdates.title;
          if (allUpdates.description) yoastMeta['_yoast_wpseo_metadesc'] = allUpdates.description;

          if (Object.keys(yoastMeta).length > 0) {
            await client.updatePost(args.postId, { meta: yoastMeta });
          }

          return { success: true, data: { fixes: results } };
        },
      },
    ],
  };
}
