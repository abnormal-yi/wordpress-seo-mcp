interface Counter {
  value: number;
  labels: Record<string, string>;
}

interface Histogram {
  buckets: number[];
  counts: number[];
  sum: number;
}

export class Telemetry {
  private counters: Map<string, Counter> = new Map();
  private histograms: Map<string, Histogram> = new Map();
  private startTime: number = Date.now();

  incrementCounter(name: string, by: number = 1, labels?: Record<string, string>): void {
    const key = this.labelKey(name, labels);
    const existing = this.counters.get(key);
    if (existing) {
      existing.value += by;
    } else {
      this.counters.set(key, { value: by, labels: labels ?? {} });
    }
  }

  observeHistogram(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.labelKey(name, labels);
    let h = this.histograms.get(key);
    if (!h) {
      h = { buckets: [1, 5, 10, 50, 100, 500, 1000, 5000], counts: new Array(9).fill(0), sum: 0 };
      this.histograms.set(key, h);
    }
    h.sum += value;
    for (let i = 0; i < h.buckets.length; i++) {
      if (value <= h.buckets[i]) { h.counts[i]++; break; }
    }
    if (value > h.buckets[h.buckets.length - 1]) h.counts[h.counts.length - 1]++;
  }

  snapshot(): { counters: Record<string, number>; histograms: Record<string, { count: number; sum: number; avg: number }> } {
    const counters: Record<string, number> = {};
    for (const [key, c] of this.counters) counters[key] = c.value;
    const histograms: Record<string, { count: number; sum: number; avg: number }> = {};
    for (const [key, h] of this.histograms) {
      const totalCount = h.counts.reduce((a, b) => a + b, 0);
      histograms[key] = { count: totalCount, sum: h.sum, avg: totalCount > 0 ? h.sum / totalCount : 0 };
    }
    return { counters, histograms };
  }

  uptime(): number {
    return Date.now() - this.startTime;
  }

  private labelKey(name: string, labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) return name;
    const parts = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b));
    return name + "{" + parts.map(([k, v]) => `${k}=${v}`).join(",") + "}";
  }
}
