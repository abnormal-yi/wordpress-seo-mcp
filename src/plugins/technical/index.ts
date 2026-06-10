import { z } from 'zod';
import { ToolPlugin } from '../../orchestrator.js';
import { SitePool } from '../../services/wordpress/site-pool.js';
import { analyzeTechnical } from './analyzer.js';

export function createTechnicalPlugin(pool: SitePool): ToolPlugin {
  return {
    id: 'technical',
    tools: [
      {
        name: 'analyze-technical',
        description: 'Analyze technical SEO (canonical, robots, hreflang) on a WordPress page',
        inputSchema: z.object({
          site: z.string(),
          postId: z.number(),
        }),
        handler: async (args) => {
          const client = pool.getClient(args.site);
          const post = await client.getPost(args.postId);
          const result = analyzeTechnical(post.content.rendered, 200);
          return { success: true, data: result };
        },
      },
    ],
  };
}
