import { describe, it, expect, vi } from "vitest";
import { PriorityQueue } from "../../src/infrastructure/priority-queue";
import type { Job } from "../../src/types/queue";

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "1",
    type: "analyze",
    siteId: "site-1",
    payload: {},
    priority: "high",
    status: "queued",
    retryCount: 0,
    maxRetries: 3,
    correlationId: "corr-1",
    createdAt: Date.now(),
    ...overrides,
  };
}

describe("PriorityQueue", () => {
  it("processes jobs via worker", async () => {
    const worker = vi.fn().mockResolvedValue(undefined);
    const pq = new PriorityQueue({ high: 5, medium: 3, low: 2 }, worker);
    const job = makeJob();
    pq.enqueue(job);
    await new Promise((r) => setTimeout(r, 50));
    expect(worker).toHaveBeenCalledWith(job);
  });

  it("respects concurrency limits", async () => {
    let concurrent = 0;
    let maxConcurrent = 0;
    const worker = vi.fn().mockImplementation(async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 30));
      concurrent--;
    });
    const pq = new PriorityQueue({ high: 2, medium: 3, low: 2 }, worker);
    for (let i = 0; i < 5; i++) {
      pq.enqueue(makeJob({ id: `${i}` }));
    }
    await new Promise((r) => setTimeout(r, 200));
    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });

  it("returns queue size", () => {
    const pq = new PriorityQueue();
    expect(pq.size()).toBe(0);
    pq.enqueue(makeJob());
    expect(pq.size()).toBe(1);
  });

  it("clears all queues", () => {
    const pq = new PriorityQueue();
    pq.enqueue(makeJob());
    pq.enqueue(makeJob({ id: "2", priority: "medium" }));
    pq.clear();
    expect(pq.size()).toBe(0);
  });
});
