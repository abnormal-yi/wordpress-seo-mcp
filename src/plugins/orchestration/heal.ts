import { z } from "zod";
import type { ToolPlugin } from "../../orchestrator.js";
import type { ActionDispatcher } from "../../infrastructure/action-dispatcher.js";

export function createHealPlugin(dispatcher: ActionDispatcher): ToolPlugin {
  return {
    id: "heal",
    tools: [
      {
        name: "heal-post",
        description: "Apply automated healing rounds to a single post (meta → content → technical)",
        inputSchema: z.object({
          siteId: z.string().describe("WordPress site name"),
          postId: z.union([z.string(), z.number()]).describe("Post ID to heal"),
          dryRun: z.boolean().default(false).describe("Simulate healing without applying changes"),
        }),
        handler: async (args) => {
          const result = await dispatcher.healPost(args.siteId, args.postId, args.dryRun);
          return { success: result.success, data: result };
        },
      },
      {
        name: "heal-site",
        description: "Heal all posts on a site — sync (inline) or async (enqueues batch job)",
        inputSchema: z.object({
          siteId: z.string().describe("WordPress site name"),
          sync: z.boolean().default(false).describe("If true, heal inline; if false, enqueue as background job"),
        }),
        handler: async (args) => {
          const result = await dispatcher.healSite(args.siteId, args.sync);
          return { success: true, data: result };
        },
      },
    ],
  };
}
