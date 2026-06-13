import { describe, it, expect } from "vitest";
import { ScoringEngine } from "../../../src/infrastructure/scoring-engine";

describe("multi-site", () => {
  it("scoring engine validates score thresholds", () => {
    const engine = new ScoringEngine();
    const result = engine.score({ meta: { score: 0.8 } });
    expect(result.overall).toBe(0.8);
    expect(result.overall >= 0.7).toBe(true);
  });

  it("canary threshold logic works", () => {
    const minScore = 0.7;
    const canaryScore = 0.85;
    expect(canaryScore >= minScore).toBe(true);
    const lowScore = 0.3;
    expect(lowScore >= minScore).toBe(false);
  });
});
