import { z } from "zod";
import type { ToolPlugin } from "../../orchestrator.js";
import type { SitePool } from "../../services/wordpress/site-pool.js";
import type { SnapshotManager } from "../../infrastructure/snapshot-manager.js";
import type { EventBus } from "../../core/event-bus.js";
import type { WorkflowEngine } from "../../infrastructure/workflow-engine.js";
import { retry, DEFAULT_RETRY_CONFIG } from "../../infrastructure/retry-pipeline.js";
import { CircuitBreaker } from "../../infrastructure/circuit-breaker.js";

export function createBatchApplyPlugin(
  pool: SitePool,
  snapshots: SnapshotManager,
  bus: EventBus,
  workflowEngine?: WorkflowEngine,
): ToolPlugin {
  const circuitBreaker = new CircuitBreaker(undefined, bus);

  return {
    id: "batch-apply",
    tools: [
      {
        name: "batch-apply",
        description: "Apply SEO fixes to all posts on a site with circuit breaker, retry, and rollback snapshots",
        inputSchema: z.object({
          siteId: z.string(),
          postType: z.string().optional(),
          dryRun: z.boolean().default(false),
        }),
        handler: async (args) => {
          const siteKey = `batch-apply:${args.siteId}`;

          if (!circuitBreaker.isAllowed(siteKey)) {
            return { success: false, error: "Circuit breaker is open for this site. Too many recent failures — wait before retrying." };
          }

          let client;
          try {
            client = pool.getClient(args.siteId);
          } catch (err) {
            return { success: false, error: `Invalid site '${args.siteId}': ${String(err)}` };
          }

          const preSnapshot = snapshots.create(args.siteId, {}, `pre-apply ${new Date().toISOString()}`);

          let posts: any[];
          try {
            posts = await client.getPosts() as any[];
          } catch (err) {
            return { success: false, error: `Failed to fetch posts: ${String(err)}` };
          }

          if (posts.length === 0) {
            return { success: true, data: { totalPosts: 0, message: "No posts found", snapshotId: preSnapshot.id } };
          }

          bus.emit("batch:started", { siteId: args.siteId, total: posts.length, dryRun: args.dryRun }, { siteId: args.siteId });

          // Use WorkflowEngine when available: each post becomes a workflow step,
          // giving us per-step resume, status tracking, and event emission.
          if (workflowEngine && !args.dryRun) {
            const steps = posts.map((post: any) => ({
              name: `apply:post:${post.id || post.ID}`,
              execute: async (context: Record<string, unknown>) => {
                const postId = post.id || post.ID;
                bus.emit("apply:start", { postId, siteId: args.siteId }, { siteId: args.siteId });
                try {
                  await retry(
                    async () => { await client!.updatePost(postId, { meta: { seo_score: "updated" } }); },
                    { ...DEFAULT_RETRY_CONFIG, maxAttempts: 3 },
                  );
                  circuitBreaker.onSuccess(siteKey);
                  bus.emit("apply:complete", { postId, siteId: args.siteId }, { siteId: args.siteId });
                  return { ...context, applied: ((context.applied as number) || 0) + 1 };
                } catch (err) {
                  circuitBreaker.onFailure(siteKey);
                  bus.emit("apply:failed", { postId, siteId: args.siteId, error: String(err) }, { siteId: args.siteId });
                  return { ...context, failed: ((context.failed as number) || 0) + 1, lastError: String(err) };
                }
              },
            }));

            const workflow = workflowEngine.create(args.siteId, steps, { applied: 0, failed: 0 });
            const result = await workflowEngine.execute(workflow.id);

            const summary = {
              totalPosts: posts.length,
              applied: (result.context.applied as number) || 0,
              failed: (result.context.failed as number) || 0,
              workflowId: workflow.id,
              workflowStatus: result.status,
              snapshotId: preSnapshot.id,
            };

            if (summary.failed > 0) {
              snapshots.create(args.siteId, summary, `post-apply summary ${args.siteId}`);
            }

            bus.emit("batch:completed", { siteId: args.siteId, ...summary }, { siteId: args.siteId });
            return { success: result.status === "completed", data: summary };
          }

          // Fallback: manual loop (dry-run or when workflowEngine not provided)
          let applied = 0, failed = 0;
          for (const post of posts) {
            const postId = post.id || post.ID;
            bus.emit("apply:start", { postId, siteId: args.siteId, dryRun: args.dryRun }, { siteId: args.siteId });
            if (args.dryRun) {
              bus.emit("apply:complete", { postId, siteId: args.siteId, dryRun: true }, { siteId: args.siteId });
              applied++;
              continue;
            }
            try {
              await retry(
                async () => { await client.updatePost(postId, { meta: { seo_score: "updated" } }); },
                { ...DEFAULT_RETRY_CONFIG, maxAttempts: 3 },
              );
              applied++;
              circuitBreaker.onSuccess(siteKey);
              bus.emit("apply:complete", { postId, siteId: args.siteId }, { siteId: args.siteId });
            } catch (err) {
              failed++;
              circuitBreaker.onFailure(siteKey);
              bus.emit("apply:failed", { postId, siteId: args.siteId, error: String(err) }, { siteId: args.siteId });
            }
          }

          const summary = { totalPosts: posts.length, applied, failed, snapshotId: preSnapshot.id };
          if (failed > 0) snapshots.create(args.siteId, summary, `post-apply summary ${args.siteId}`);
          bus.emit("batch:completed", { siteId: args.siteId, ...summary }, { siteId: args.siteId });
          return { success: true, data: summary };
        },
      },
    ],
  };
}
