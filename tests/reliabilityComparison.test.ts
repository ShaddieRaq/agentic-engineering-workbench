import { describe, expect, it } from "vitest";
import { compareReliabilitySummaries } from "../src/orchestration/reliabilityComparison.js";

describe("compareReliabilitySummaries", () => {
  it("classifies a lower candidate pass rate as regressed", () => {
    const comparison = compareReliabilitySummaries(
      {
        passRate: 0.75,
      },
      {
        passRate: 0.5,
      },
    );

    expect(comparison).toEqual({
      baselinePassRate: 0.75,
      candidatePassRate: 0.5,
      passRateDelta: -0.25,
      classification: "regressed",
    });
  });
  it.each([
    {
      baselinePassRate: 0.5,
      candidatePassRate: 0.75,
      expectedDelta: 0.25,
      expectedClassification: "improved",
    },
    {
      baselinePassRate: 0.75,
      candidatePassRate: 0.75,
      expectedDelta: 0,
      expectedClassification: "unchanged",
    },
  ])(
    "classifies the candidate as $expectedClassification",
    ({
      baselinePassRate,
      candidatePassRate,
      expectedDelta,
      expectedClassification,
    }) => {
      const comparison = compareReliabilitySummaries(
        { passRate: baselinePassRate },
        { passRate: candidatePassRate },
      );

      expect(comparison.passRateDelta).toBe(expectedDelta);
      expect(comparison.classification).toBe(
        expectedClassification,
      );
    },
  );
  it.each([
    {
      baselinePassRate: null,
      candidatePassRate: 0.75,
    },
    {
      baselinePassRate: 0.75,
      candidatePassRate: null,
    },
  ])(
    "reports insufficient evidence when a pass rate is missing",
    ({ baselinePassRate, candidatePassRate }) => {
      const comparison = compareReliabilitySummaries(
        { passRate: baselinePassRate },
        { passRate: candidatePassRate },
      );

      expect(comparison.passRateDelta).toBeNull();
      expect(comparison.classification).toBe(
        "insufficient-evidence",
      );
    },
  );
});