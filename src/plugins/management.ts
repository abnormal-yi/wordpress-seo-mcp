import { z } from 'zod';
import { SitePool } from '../services/wordpress/site-pool.js';
import { SiteConfigSchema } from '../types/wordpress.js';
import { ToolPlugin } from '../orchestrator.js';

export function createManagementPlugin(pool: SitePool): ToolPlugin {
  return {
    id: 'management',
    tools: [
      {
        name: 'manage-sites',
        description: 'Add, list, or remove WordPress sites from the pool',
        inputSchema: z.object({
          action: z.enum(['add', 'list', 'remove']),
          name: z.string().optional(),
          config: SiteConfigSchema.optional(),
        }),
        handler: async (args) => {
          switch (args.action) {
            case 'add': {
              if (!args.name || !args.config) {
                return { success: false, error: 'name and config required for add action' };
              }
              pool.addSite(args.name, args.config);
              return { success: true, data: { message: `Site '${args.name}' added` } };
            }
            case 'remove': {
              if (!args.name) return { success: false, error: 'name required for remove action' };
              pool.removeSite(args.name);
              return { success: true, data: { message: `Site '${args.name}' removed` } };
            }
            case 'list': {
              return { success: true, data: { sites: pool.listSites() } };
            }
            default:
              return { success: false, error: `Unknown action: ${args.action}` };
          }
        },
      },
    ],
  };
}
