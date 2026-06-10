import { z } from 'zod';
import { ToolPlugin } from '../../orchestrator.js';
import { SitePool } from '../../services/wordpress/site-pool.js';
import { analyzeImages } from './analyzer.js';

export function createImagePlugin(pool: SitePool): ToolPlugin {
  return {
    id: 'images',
    tools: [
      {
        name: 'analyze-images',
        description: 'Analyze image SEO (alt text, lazy loading) on a WordPress page',
        inputSchema: z.object({
          site: z.string(),
          postId: z.number(),
        }),
        handler: async (args) => {
          const client = pool.getClient(args.site);
          const post = await client.getPost(args.postId);
          const result = analyzeImages(post.content.rendered);
          return { success: true, data: result };
        },
      },
    ],
  };
}
