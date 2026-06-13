import { describe, it, expect, vi } from "vitest";
import { PriorityQueue } from "../../src/infrastructure/priority-queue";
import { JobScheduler } from "../../src/infrastructure/job-scheduler";

describe("JobScheduler", () => {
  it("schedules recurring jobs", async () => {
    const worker = vi.fn().mockResolvedValue(undefined);
    const pq = new PriorityQueue({ high: 5, medium: 3, low: 2 }, worker);
    const scheduler = new JobScheduler(pq);
    scheduler.schedule("test", "analyze", 50, { siteId: "1" });
    await new Promise((r) => setTimeout(r, 120));
    scheduler.stopAll();
    expect(worker).toHaveBeenCalledTimes(2);
  });

  it("unschedules a job", async () => {
    const worker = vi.fn().mockResolvedValue(undefined);
    const pq = new PriorityQueue({ high: 5, medium: 3, low: 2 }, worker);
    const scheduler = new JobScheduler(pq);
    scheduler.schedule("test", "analyze", 30, {});
    scheduler.unschedule("test");
    await new Promise((r) => setTimeout(r, 100));
    expect(worker).not.toHaveBeenCalled();
  });

  it("lists scheduled jobs", () => {
    const pq = new PriorityQueue();
    const scheduler = new JobScheduler(pq);
    scheduler.schedule("a", "analyze", 1000, {});
    scheduler.schedule("b", "analyze", 2000, {});
    expect(scheduler.list()).toEqual(expect.arrayContaining(["a", "b"]));
  });

  it("stops all jobs", () => {
    const pq = new PriorityQueue();
    const scheduler = new JobScheduler(pq);
    scheduler.schedule("a", "analyze", 1000, {});
    scheduler.schedule("b", "analyze", 2000, {});
    scheduler.stopAll();
    expect(scheduler.list()).toEqual([]);
  });
});
