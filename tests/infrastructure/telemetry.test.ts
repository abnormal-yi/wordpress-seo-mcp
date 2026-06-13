import { describe, it, expect } from "vitest";
import { Telemetry } from "../../src/infrastructure/telemetry";

describe("Telemetry", () => {
  it("increments counters", () => {
    const t = new Telemetry();
    t.incrementCounter("requests");
    t.incrementCounter("requests");
    t.incrementCounter("errors");
    const s = t.snapshot();
    expect(s.counters["requests"]).toBe(2);
    expect(s.counters["errors"]).toBe(1);
  });

  it("observes histogram values", () => {
    const t = new Telemetry();
    t.observeHistogram("latency", 50);
    t.observeHistogram("latency", 150);
    const s = t.snapshot();
    expect(s.histograms["latency"].count).toBe(2);
    expect(s.histograms["latency"].sum).toBe(200);
    expect(s.histograms["latency"].avg).toBe(100);
  });

  it("supports labels on counters", () => {
    const t = new Telemetry();
    t.incrementCounter("requests", 1, { method: "GET", status: "200" });
    t.incrementCounter("requests", 1, { method: "POST", status: "200" });
    const s = t.snapshot();
    expect(Object.keys(s.counters).length).toBe(2);
  });

  it("reports uptime", () => {
    const t = new Telemetry();
    expect(t.uptime()).toBeGreaterThanOrEqual(0);
  });
});
