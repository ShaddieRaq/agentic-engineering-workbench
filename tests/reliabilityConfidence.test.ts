import { describe, expect, it } from "vitest";
import {
  calculateWilson95Interval,
  compareReliabilityConfidence,
} from "../src/orchestration/reliabilityConfidence.js";

describe("reliability confidence", () => {
  it("calculates a Wilson 95% interval", () => {
    const interval = calculateWilson95Interval({
      passedRuns: 5,
      totalRuns: 5,
    });

    expect(interval?.confidenceLevel).toBe(0.95);
    expect(interval?.lowerBound).toBeCloseTo(0.5655, 4);
    expect(interval?.upperBound).toBeCloseTo(1, 4);
  });

  it("reports overlapping intervals without overclaiming", () => {
    const comparison = compareReliabilityConfidence(
      { passedRuns: 5, totalRuns: 5 },
      { passedRuns: 5, totalRuns: 5 },
    );

    expect(comparison.relationship).toBe("overlapping");
  });

  it("detects a candidate interval entirely above baseline", () => {
    const comparison = compareReliabilityConfidence(
      { passedRuns: 10, totalRuns: 100 },
      { passedRuns: 90, totalRuns: 100 },
    );

    expect(comparison.relationship).toBe("candidate-above");
  });

  it("reports insufficient evidence for an empty sample", () => {
    const comparison = compareReliabilityConfidence(
      { passedRuns: 0, totalRuns: 0 },
      { passedRuns: 0, totalRuns: 0 },
    );

    expect(comparison.relationship).toBe(
      "insufficient-evidence",
    );
  });
});
