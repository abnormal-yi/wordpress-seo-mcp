import { describe, it, expect } from "vitest";
import { ScoringEngine } from "../../src/infrastructure/scoring-engine";

describe("ScoringEngine", () => {
  it("computes overall score from category results", () => {
    const engine = new ScoringEngine();
    const result = engine.score({
      meta: { score: 1.0 },
      schema: { score: 0.5 },
    });
    expect(result.overall).toBeGreaterThan(0.7);
    expect(result.overall).toBeLessThan(0.8);
    expect(result.categories.meta).toBe(1.0);
    expect(result.categories.schema).toBe(0.5);
  });

  it("marks categories below 0.7 as not passed", () => {
    const engine = new ScoringEngine();
    const result = engine.score({ meta: { score: 0.3 } });
    expect(result.details.meta.passed).toBe(false);
  });

  it("accepts custom weight overrides", () => {
    const engine = new ScoringEngine({ meta: 0.5, content: 0.5 });
    const result = engine.score({ meta: { score: 1.0 }, content: { score: 0.0 } });
    expect(result.overall).toBe(0.5);
  });
});
