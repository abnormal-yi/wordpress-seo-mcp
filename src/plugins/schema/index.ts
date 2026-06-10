import { z } from 'zod';
import { ToolPlugin } from '../../orchestrator.js';
import { SitePool } from '../../services/wordpress/site-pool.js';
import { analyzeSchema } from './analyzer.js';
import { applySchemaFix, injectSchemaIntoContent } from './applier.js';

export function createSchemaPlugin(pool: SitePool): ToolPlugin {
  return {
    id: 'schema',
    tools: [
      {
        name: 'analyze-schema',
        description: 'Analyze JSON-LD schema markup on a WordPress page',
        inputSchema: z.object({
          site: z.string(),
          postId: z.number(),
        }),
        handler: async (args) => {
          const client = pool.getClient(args.site);
          const post = await client.getPost(args.postId);
          const result = analyzeSchema(post.content.rendered);
          return { success: true, data: result };
        },
      },
      {
        name: 'apply-schema',
        description: 'Add JSON-LD schema markup to a WordPress page',
        inputSchema: z.object({
          site: z.string(),
          postId: z.number(),
          schemas: z.array(z.enum(['Article', 'Organization', 'BreadcrumbList'])),
        }),
        handler: async (args) => {
          const client = pool.getClient(args.site);
          const post = await client.getPost(args.postId);
          const config = pool.getConfig(args.site);
          const siteName = new URL(config.url).hostname;

          const schemas: object[] = [];
          const changes: string[] = [];
          for (const schemaType of args.schemas) {
            const result = applySchemaFix(post, `missing-${schemaType.toLowerCase().replace('list', '-list')}-schema`, { name: siteName, url: config.url });
            schemas.push(result.schema);
            changes.push(...result.changes);
          }

          const updatedContent = injectSchemaIntoContent(post.content.rendered, schemas);
          await client.updatePost(args.postId, { content: updatedContent });

          return { success: true, data: { fix: changes } };
        },
      },
    ],
  };
}
