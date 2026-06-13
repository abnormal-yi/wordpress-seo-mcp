export interface ScoreResult {
  overall: number;
  categories: Record<string, number>;
  details: Record<string, { score: number; weight: number; passed: boolean }>;
}

export class ScoringEngine {
  private weights: Record<string, number> = {
    meta: 0.25,
    schema: 0.20,
    content: 0.20,
    technical: 0.15,
    image: 0.10,
    keyword: 0.10,
  };

  constructor(overrides?: Record<string, number>) {
    if (overrides) Object.assign(this.weights, overrides);
  }

  score(results: Record<string, { score: number; details?: Record<string, unknown> }>): ScoreResult {
    const details: ScoreResult["details"] = {};
    let weightedSum = 0;
    let totalWeight = 0;

    for (const [category, result] of Object.entries(results)) {
      const weight = this.weights[category] ?? 0.05;
      const passed = result.score >= 0.7;
      details[category] = { score: result.score, weight, passed };
      weightedSum += result.score * weight;
      totalWeight += weight;
    }

    const overall = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) / 100 : 0;
    const categories: Record<string, number> = {};
    for (const [cat, det] of Object.entries(details)) categories[cat] = det.score;

    return { overall, categories, details };
  }
}
