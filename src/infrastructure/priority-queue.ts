import { EventBus } from "../core/event-bus";
import type { Job, QueueLane } from "../types/queue";

interface QueueEntry {
  job: Job;
  addedAt: number;
}

export class PriorityQueue {
  private queues: Record<QueueLane, QueueEntry[]> = { high: [], medium: [], low: [] };
  private activeCounts: Record<QueueLane, number> = { high: 0, medium: 0, low: 0 };
  private bus?: EventBus;
  private pollTimer?: ReturnType<typeof setInterval>;

  constructor(
    private concurrency: { high: number; medium: number; low: number } = { high: 5, medium: 3, low: 2 },
    private worker?: (job: Job) => Promise<void>,
    bus?: EventBus,
    private pollIntervalMs: number = 200
  ) {
    this.bus = bus;
  }

  setWorker(worker: (job: Job) => Promise<void>): void {
    this.worker = worker;
  }

  enqueue(job: Job): void {
    const lane = job.priority === "high" ? "high" : job.priority === "medium" ? "medium" : "low";
    this.queues[lane].push({ job, addedAt: Date.now() });
    this.bus?.emit("queue:job-added", { jobId: job.id, lane, type: job.type });
    this.processNext();
  }

  private dequeue(): { job: Job; lane: QueueLane } | undefined {
    for (const lane of ["high", "medium", "low"] as QueueLane[]) {
      if (this.activeCounts[lane] < this.concurrency[lane] && this.queues[lane].length > 0) {
        return { job: this.queues[lane].shift()!.job, lane };
      }
    }
    return undefined;
  }

  private async processNext(): Promise<void> {
    if (!this.worker) return;
    const entry = this.dequeue();
    if (!entry) return;

    const { job, lane } = entry;
    this.activeCounts[lane]++;
    this.bus?.emit("queue:job-started", { jobId: job.id, lane, type: job.type });

    try {
      await this.worker(job);
      this.bus?.emit("queue:job-completed", { jobId: job.id, lane, type: job.type });
    } catch (err) {
      this.bus?.emit("queue:job-failed", { jobId: job.id, lane, type: job.type, error: String(err) });
    } finally {
      this.activeCounts[lane]--;
      this.processNext();
    }
  }

  size(lane?: QueueLane): number {
    if (lane) return this.queues[lane].length;
    return this.queues.high.length + this.queues.medium.length + this.queues.low.length;
  }

  clear(lane?: QueueLane): void {
    if (lane) this.queues[lane] = [];
    else this.queues = { high: [], medium: [], low: [] };
  }

  start(): void {
    this.pollTimer = setInterval(() => this.processNext(), this.pollIntervalMs);
  }

  stop(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
  }
}
