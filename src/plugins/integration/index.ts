import { z } from 'zod';
import { ToolPlugin } from '../../orchestrator.js';
import { GscClient } from '../../services/external/gsc.js';
import { PageSpeedClient } from '../../services/external/psi.js';

export function createIntegrationPlugin(gscClient?: GscClient, psiClient?: PageSpeedClient): ToolPlugin {
  return {
    id: 'integration',
    tools: [
      ...(gscClient ? [{
        name: 'search-analytics',
        description: 'Get Google Search Console analytics data',
        inputSchema: z.object({
          startDate: z.string(),
          endDate: z.string(),
          rowLimit: z.number().default(10),
        }),
        handler: async (args: { startDate: string; endDate: string; rowLimit: number }) => {
          if (!gscClient) throw new Error('GSC client not configured');
          const data = await gscClient.getSearchAnalytics(args.startDate, args.endDate, args.rowLimit);
          return { success: true, data };
        },
      }] : []),
      ...(psiClient ? [{
        name: 'analyze-speed',
        description: 'Analyze page speed via Google PageSpeed Insights',
        inputSchema: z.object({
          url: z.string().url(),
        }),
        handler: async (args: { url: string }) => {
          const config = { apiKey: process.env['GOOGLE_API_KEY'] ?? '' };
          const client = new PageSpeedClient();
          const data = await client.analyze(args.url, config.apiKey);
          return { success: true, data };
        },
      }] : []),
    ],
  };
}
