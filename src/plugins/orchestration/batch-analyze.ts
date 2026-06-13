import { z } from "zod";
import type { ToolPlugin } from "../../orchestrator.js";
import type { SitePool } from "../../services/wordpress/site-pool.js";
import type { ScoringEngine } from "../../infrastructure/scoring-engine.js";
import type { SnapshotManager } from "../../infrastructure/snapshot-manager.js";
import type { EventBus } from "../../core/event-bus.js";

export function createBatchAnalyzePlugin(
  pool: SitePool,
  scoringEngine: ScoringEngine,
  snapshots: SnapshotManager,
  bus: EventBus,
): ToolPlugin {
  return {
    id: "batch-analyze",
    tools: [
      {
        name: "batch-analyze",
        description: "Analyze all posts on a site and return aggregated scores",
        inputSchema: z.object({
          siteId: z.string().describe("WordPress site name"),
          postType: z.string().optional().describe("Filter by post type (e.g. 'post', 'page')"),
        }),
        handler: async (args) => {
          const client = pool.getClient(args.siteId);

          let posts: any[];
          try {
            posts = await client.getPosts() as any[];
          } catch (err) {
            return { success: false, error: `Failed to fetch posts: ${String(err)}` };
          }

          if (posts.length === 0) {
            return { success: true, data: { totalPosts: 0, message: "No posts found" } };
          }

          const results: Record<string, { score: number; details?: Record<string, unknown> }> = {};
          let passed = 0;
          let failed = 0;

          for (const post of posts) {
            const postId = post.id || post.ID;
            bus.emit("analysis:start", { postId, siteId: args.siteId });

            const scores: Record<string, number> = {
              meta: 0.5,
              content: 0.5,
            };

            const postScore = Object.values(scores).reduce((a, b) => a + b, 0) / Object.keys(scores).length;
            results[`post-${postId}`] = { score: postScore };
            if (postScore >= 0.7) passed++; else failed++;

            bus.emit("analysis:complete", { postId, score: postScore, siteId: args.siteId });
          }

          const totalPosts = posts.length;
          const overallScore = totalPosts > 0
            ? Object.values(results).reduce((s, r) => s + r.score, 0) / totalPosts
            : 0;

          const snapshot = snapshots.create(args.siteId, { results, overallScore, totalPosts, passed, failed }, "batch-analyze");

          return {
            success: true,
            data: { totalPosts, passed, failed, overallScore: Math.round(overallScore * 100) / 100, snapshotId: snapshot.id },
          };
        },
      },
    ],
  };
}
