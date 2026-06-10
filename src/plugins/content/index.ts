import { z } from 'zod';
import { ToolPlugin } from '../../orchestrator.js';
import { SitePool } from '../../services/wordpress/site-pool.js';
import { analyzeContent } from './analyzer.js';

export function createContentPlugin(pool: SitePool): ToolPlugin {
  return {
    id: 'content',
    tools: [
      {
        name: 'analyze-content',
        description: 'Analyze content SEO quality of a WordPress page/post',
        inputSchema: z.object({
          site: z.string(),
          postId: z.number(),
          keyword: z.string().optional(),
        }),
        handler: async (args) => {
          const client = pool.getClient(args.site);
          const post = await client.getPost(args.postId);
          const result = analyzeContent(post.content.rendered, args.keyword);
          return { success: true, data: result };
        },
      },
    ],
  };
}
