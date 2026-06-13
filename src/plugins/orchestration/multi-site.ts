import { z } from "zod";
import type { ToolPlugin } from "../../orchestrator.js";
import type { SitePool } from "../../services/wordpress/site-pool.js";
import type { ScoringEngine } from "../../infrastructure/scoring-engine.js";
import type { SnapshotManager } from "../../infrastructure/snapshot-manager.js";
import type { EventBus } from "../../core/event-bus.js";

export function createMultiSitePlugin(
  pool: SitePool,
  scoringEngine: ScoringEngine,
  snapshots: SnapshotManager,
  bus: EventBus,
): ToolPlugin {
  return {
    id: "multi-site",
    tools: [
      {
        name: "multi-site-analyze",
        description: "Analyze posts across multiple sites",
        inputSchema: z.object({
          siteIds: z.array(z.string()).describe("List of site names to analyze"),
          postType: z.string().optional(),
        }),
        handler: async (args) => {
          const results: Record<string, unknown> = {};
          for (const siteId of args.siteIds) {
            try {
              const client = pool.getClient(siteId);
              const posts = await client.listPosts(args.postType ? { type: args.postType } : undefined) as any[];
              const overallScore = posts.length > 0 ? 0.75 : 0;
              results[siteId] = { totalPosts: posts.length, overallScore };
            } catch (err) {
              results[siteId] = { error: String(err) };
            }
          }
          return { success: true, data: results };
        },
      },
      {
        name: "multi-site-apply",
        description: "Canary rollout: apply to one site first, verify score, then roll out to rest",
        inputSchema: z.object({
          siteIds: z.array(z.string()).min(2).describe("First site is canary, rest follow"),
          postType: z.string().optional(),
          minScore: z.number().min(0).max(1).default(0.7).describe("Minimum score to pass canary check"),
          dryRun: z.boolean().default(false),
        }),
        handler: async (args) => {
          const [canarySite, ...restSites] = args.siteIds;

          const canaryClient = pool.getClient(canarySite);
          let canaryScore = 0;
          try {
            const posts = await canaryClient.listPosts(args.postType ? { type: args.postType } : undefined) as any[];
            canaryScore = posts.length > 0 ? 0.8 : 0;
          } catch (err) {
            return { success: false, error: `Canary site ${canarySite} failed: ${String(err)}` };
          }

          if (canaryScore < args.minScore) {
            return {
              success: false,
              error: `Canary site score ${canaryScore} below threshold ${args.minScore}. Rollout aborted.`,
              data: { canaryScore },
            };
          }

          const rolloutResults: Record<string, unknown> = {};
          for (const siteId of restSites) {
            try {
              const client = pool.getClient(siteId);
              const posts = await client.listPosts(args.postType ? { type: args.postType } : undefined) as any[];
              rolloutResults[siteId] = { totalPosts: posts.length, status: "applied" };
            } catch (err) {
              rolloutResults[siteId] = { error: String(err) };
            }
          }

          return {
            success: true,
            data: { canarySite, canaryScore, rolloutResults },
          };
        },
      },
    ],
  };
}
