import { describe, expect, it } from "vitest";
import {
  compareLatencySummaries,
  summarizeLatencies,
} from "../src/orchestration/latencyComparison.js";

describe("latency comparison", () => {
  it("summarizes latency samples", () => {
    expect(summarizeLatencies([100, 200, 300])).toEqual({
      sampleCount: 3,
      averageDurationMs: 200,
      minimumDurationMs: 100,
      maximumDurationMs: 300,
    });
  });

  it("reports no metrics without samples", () => {
    expect(summarizeLatencies([])).toEqual({
      sampleCount: 0,
      averageDurationMs: null,
      minimumDurationMs: null,
      maximumDurationMs: null,
    });
  });

  it.each([
    [150, "faster"],
    [250, "slower"],
    [200, "unchanged"],
  ] as const)(
    "classifies a candidate average of %s ms as %s",
    (candidateAverage, classification) => {
      expect(
        compareLatencySummaries(
          summarizeLatencies([200]),
          summarizeLatencies([candidateAverage]),
        ),
      ).toMatchObject({
        averageDurationDeltaMs: candidateAverage - 200,
        classification,
      });
    },
  );

  it("reports insufficient evidence when samples are absent", () => {
    expect(
      compareLatencySummaries(
        summarizeLatencies([]),
        summarizeLatencies([100]),
      ),
    ).toMatchObject({
      averageDurationDeltaMs: null,
      classification: "insufficient-evidence",
    });
  });

  it("rejects invalid latency evidence", () => {
    expect(() => summarizeLatencies([-1])).toThrow(
      "Latency samples must be finite, non-negative numbers.",
    );
  });
});
