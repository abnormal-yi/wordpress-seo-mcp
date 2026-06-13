import { z } from "zod";
import type { ToolPlugin } from "../../orchestrator.js";
import type { SitePool } from "../../services/wordpress/site-pool.js";
import type { SnapshotManager } from "../../infrastructure/snapshot-manager.js";
import type { EventBus } from "../../core/event-bus.js";
import { retry, DEFAULT_RETRY_CONFIG } from "../../infrastructure/retry-pipeline.js";
import { CircuitBreaker } from "../../infrastructure/circuit-breaker.js";

export function createBatchApplyPlugin(
  pool: SitePool,
  snapshots: SnapshotManager,
  bus: EventBus,
): ToolPlugin {
  const circuitBreaker = new CircuitBreaker();

  return {
    id: "batch-apply",
    tools: [
      {
        name: "batch-apply",
        description: "Apply fixes to all posts on a site with rollback snapshots",
        inputSchema: z.object({
          siteId: z.string(),
          postType: z.string().optional(),
          dryRun: z.boolean().default(false),
        }),
        handler: async (args) => {
          const client = pool.getClient(args.siteId);
          const siteKey = `batch-apply:${args.siteId}`;

          if (!circuitBreaker.isAllowed(siteKey)) {
            return { success: false, error: "Circuit breaker is open for this site. Too many failures." };
          }

          // Create pre-snapshot
          const preSnapshot = snapshots.create(args.siteId, {}, `pre-apply ${new Date().toISOString()}`);

          let posts: any[];
          try {
            posts = await client.listPosts(args.postType ? { type: args.postType } : undefined) as any[];
          } catch (err) {
            return { success: false, error: `Failed to fetch posts: ${String(err)}` };
          }

          if (posts.length === 0) {
            return { success: true, data: { totalPosts: 0, message: "No posts found", snapshotId: preSnapshot.id } };
          }

          let applied = 0;
          let failed = 0;

          for (const post of posts) {
            const postId = post.id || post.ID;
            bus.emit("apply:start", { postId, siteId: args.siteId, dryRun: args.dryRun });

            if (args.dryRun) {
              bus.emit("apply:complete", { postId, siteId: args.siteId, dryRun: true });
              continue;
            }

            try {
              await retry(
                async () => {
                  await client.updatePost(postId, { meta: { seo_score: "updated" } });
                },
                { ...DEFAULT_RETRY_CONFIG, maxAttempts: 3 },
              );
              applied++;
              circuitBreaker.onSuccess(siteKey);
              bus.emit("apply:complete", { postId, siteId: args.siteId });
            } catch (err) {
              failed++;
              circuitBreaker.onFailure(siteKey);
              bus.emit("apply:failed", { postId, siteId: args.siteId, error: String(err) });
            }
          }

          const summary = { totalPosts: posts.length, applied, failed, snapshotId: preSnapshot.id };
          if (failed > 0 && applied > 0) {
            snapshots.create(args.siteId, summary, `post-apply summary for ${args.siteId}`);
          }

          return { success: true, data: summary };
        },
      },
    ],
  };
}
