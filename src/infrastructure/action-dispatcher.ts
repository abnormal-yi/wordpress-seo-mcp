import { EventBus } from "../core/event-bus";
import { SitePool } from "../services/wordpress/site-pool";
import { ScoringEngine } from "./scoring-engine";
import { CircuitBreaker } from "./circuit-breaker";
import { LockManager } from "./lock-manager";
import { PriorityQueue } from "./priority-queue";
import type { Job } from "../types/queue";

export interface HealResult {
  postId: string | number;
  siteId: string;
  rounds: number;
  finalScore: number;
  success: boolean;
  error?: string;
}

export interface HealSummary {
  siteId: string;
  postsHealed: number;
  postsFailed: number;
  totalRounds: number;
}

type FixType = "meta" | "content" | "technical";

export class ActionDispatcher {
  private roundCounts: Map<string, number> = new Map();
  private bus: EventBus;
  private pool: SitePool;
  private scoringEngine: ScoringEngine;
  private circuitBreaker: CircuitBreaker;
  private lockManager: LockManager;
  private queue: PriorityQueue;

  constructor(
    pool: SitePool,
    scoringEngine: ScoringEngine,
    circuitBreaker: CircuitBreaker,
    lockManager: LockManager,
    queue: PriorityQueue,
    bus: EventBus,
  ) {
    this.pool = pool;
    this.scoringEngine = scoringEngine;
    this.circuitBreaker = circuitBreaker;
    this.lockManager = lockManager;
    this.queue = queue;
    this.bus = bus;
  }

  private roundKey(siteId: string, postId: string | number): string {
    return `${siteId}:${postId}`;
  }

  private getFixType(round: number): FixType {
    return round === 0 ? "meta" : round === 1 ? "content" : "technical";
  }

  private scorePost(post: Record<string, unknown>): number {
    const hasYoast = !!(post.yoast_head_json);
    const content = post.content as string | undefined;
    const hasContent = !!content && content.length > 100;
    const hasTitle = !!(post.title as string | undefined);
    const score = this.scoringEngine.score({
      meta: { score: hasYoast ? 0.8 : 0.3 },
      content: { score: hasContent ? 0.8 : 0.3 },
      technical: { score: hasTitle ? 0.7 : 0.4 },
    });
    return score.overall;
  }

  async healPost(siteId: string, postId: string | number, dryRun = false): Promise<HealResult> {
    const key = this.roundKey(siteId, postId);

    if (!this.circuitBreaker.isAllowed(`heal:${siteId}`)) {
      return { postId, siteId, rounds: 0, finalScore: 0, success: false, error: "Circuit breaker open" };
    }

    if (!this.lockManager.acquire(key, 60000)) {
      return { postId, siteId, rounds: 0, finalScore: 0, success: false, error: "Post is being healed by another process" };
    }

    try {
      let rounds = 0;
      const maxRounds = 3;
      let previousScore = -1;
      let currentScore = 0;
      const client = this.pool.getClient(siteId);

      while (rounds < maxRounds) {
        const post = await client.getPost(postId as number);
        currentScore = this.scorePost(post as unknown as Record<string, unknown>);

        if (currentScore >= 0.7) {
          this.roundCounts.delete(key);
          this.circuitBreaker.onSuccess(`heal:${siteId}`);
          return { postId, siteId, rounds, finalScore: currentScore, success: true };
        }

        if (previousScore >= 0 && currentScore < previousScore) {
          this.roundCounts.delete(key);
          this.circuitBreaker.onFailure(`heal:${siteId}`);
          return { postId, siteId, rounds, finalScore: currentScore, success: false, error: "Score regression — aborting" };
        }

        previousScore = currentScore;

        if (dryRun) {
          rounds++;
          this.roundCounts.set(key, rounds);
          continue;
        }

        const fixType = this.getFixType(rounds);
        this.bus.emit("heal:round-start", { postId, siteId, round: rounds + 1, fixType });

        try {
          await client.updatePost(postId as number, { meta: { seo_score: "healed", heal_round: rounds + 1 } });
          this.circuitBreaker.onSuccess(`heal:${siteId}`);
          this.bus.emit("heal:round-complete", { postId, siteId, round: rounds + 1, fixType });
        } catch (err) {
          this.circuitBreaker.onFailure(`heal:${siteId}`);
          this.roundCounts.delete(key);
          return { postId, siteId, rounds: rounds + 1, finalScore: currentScore, success: false, error: String(err) };
        }

        rounds++;
        this.roundCounts.set(key, rounds);
      }

      this.roundCounts.delete(key);
      this.bus.emit("heal:complete", { postId, siteId, rounds, finalScore: currentScore, success: currentScore >= 0.7 });
      return { postId, siteId, rounds, finalScore: currentScore, success: currentScore >= 0.7 };
    } finally {
      this.lockManager.release(key);
    }
  }

  async healSite(siteId: string, sync = false): Promise<{ jobsEnqueued: number } | HealSummary> {
    if (sync) {
      try {
        const client = this.pool.getClient(siteId);
        const posts = await client.getPosts() as any[];
        let healed = 0;
        let failed = 0;
        let totalRounds = 0;
        for (const post of posts) {
          const postId = post.id ?? post.ID;
          const result = await this.healPost(siteId, postId);
          if (result.success) healed++;
          else failed++;
          totalRounds += result.rounds;
        }
        this.bus.emit("site:heal-complete", { siteId, postsHealed: healed, postsFailed: failed });
        return { siteId, postsHealed: healed, postsFailed: failed, totalRounds };
      } catch (err) {
        console.error(`[ActionDispatcher] healSite sync failed for ${siteId}:`, err);
        return { siteId, postsHealed: 0, postsFailed: 0, totalRounds: 0 };
      }
    }

    const job: Job = {
      id: `heal-site-${siteId}-${Date.now()}`,
      type: "batch-apply",
      siteId,
      payload: { siteId },
      priority: "medium",
      status: "queued",
      retryCount: 0,
      maxRetries: 1,
      correlationId: `heal-${siteId}`,
      createdAt: Date.now(),
    };
    this.queue.enqueue(job);
    this.bus.emit("site:heal-queued", { siteId, jobId: job.id });
    return { jobsEnqueued: 1 };
  }

  resetRoundCount(siteId: string, postId: string | number): void {
    this.roundCounts.delete(this.roundKey(siteId, postId));
  }
}
