import { PriorityQueue } from "./priority-queue";
import type { Job, JobType } from "../types/queue";

interface ScheduledJob {
  id: string;
  type: JobType;
  intervalMs: number;
  data: Record<string, unknown>;
  priority: "high" | "medium" | "low";
  timer?: ReturnType<typeof setInterval>;
}

export class JobScheduler {
  private jobs: Map<string, ScheduledJob> = new Map();

  constructor(private queue: PriorityQueue) {}

  schedule(id: string, type: JobType, intervalMs: number, data: Record<string, unknown> = {}, priority: "high" | "medium" | "low" = "medium"): void {
    this.unschedule(id);
    const scheduled: ScheduledJob = { id, type, intervalMs, data, priority };
    scheduled.timer = setInterval(() => {
      this.queue.enqueue({
        id: `${id}-${Date.now()}`,
        type,
        siteId: (data.siteId as string) || "default",
        payload: data,
        priority,
        status: "queued",
        retryCount: 0,
        maxRetries: 3,
        correlationId: id,
        createdAt: Date.now(),
      });
    }, intervalMs);
    this.jobs.set(id, scheduled);
  }

  unschedule(id: string): void {
    const existing = this.jobs.get(id);
    if (existing?.timer) clearInterval(existing.timer);
    this.jobs.delete(id);
  }

  list(): string[] {
    return Array.from(this.jobs.keys());
  }

  stopAll(): void {
    for (const id of this.jobs.keys()) this.unschedule(id);
  }
}
