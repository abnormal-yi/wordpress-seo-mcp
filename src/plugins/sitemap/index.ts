import { z } from 'zod';
import { ToolPlugin } from '../../orchestrator.js';
import { SitePool } from '../../services/wordpress/site-pool.js';
import { GscClient } from '../../services/external/gsc.js';
import { generateSitemapXml, buildSitemapFromPosts } from './generator.js';

export function createSitemapPlugin(pool: SitePool, gscClient?: GscClient): ToolPlugin {
  return {
    id: 'sitemap',
    tools: [
      {
        name: 'generate-sitemap',
        description: 'Generate XML sitemap for a WordPress site',
        inputSchema: z.object({
          site: z.string(),
          submitToGsc: z.boolean().default(false),
        }),
        handler: async (args) => {
          const client = pool.getClient(args.site);
          const siteUrl = await client.getSiteUrl();
          const posts = await client.getPosts({ per_page: 100, status: 'publish' });
          const urls = buildSitemapFromPosts(
            posts.map(p => ({ slug: p.slug, status: p.status })),
            siteUrl
          );
          const xml = generateSitemapXml(urls);
          const result: any = { urlCount: urls.length, sitemap: xml };

          if (args.submitToGsc && gscClient) {
            const sitemapUrl = `${siteUrl.replace(/\/+$/, '')}/sitemap.xml`;
            await gscClient.submitSitemap(sitemapUrl);
            result.gscSubmitted = sitemapUrl;
          }

          return { success: true, data: result };
        },
      },
    ],
  };
}
