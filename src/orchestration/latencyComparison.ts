export interface LatencySummary {
  sampleCount: number;
  averageDurationMs: number | null;
  minimumDurationMs: number | null;
  maximumDurationMs: number | null;
}

export type LatencyClassification =
  | "faster"
  | "slower"
  | "unchanged"
  | "insufficient-evidence";

export interface LatencyComparison {
  baseline: LatencySummary;
  candidate: LatencySummary;
  averageDurationDeltaMs: number | null;
  classification: LatencyClassification;
}

export function summarizeLatencies(
  durationsMs: readonly number[],
): LatencySummary {
  if (
    durationsMs.some(
      (duration) => !Number.isFinite(duration) || duration < 0,
    )
  ) {
    throw new Error(
      "Latency samples must be finite, non-negative numbers.",
    );
  }

  if (durationsMs.length === 0) {
    return {
      sampleCount: 0,
      averageDurationMs: null,
      minimumDurationMs: null,
      maximumDurationMs: null,
    };
  }

  const totalDurationMs = durationsMs.reduce(
    (total, duration) => total + duration,
    0,
  );

  return {
    sampleCount: durationsMs.length,
    averageDurationMs: totalDurationMs / durationsMs.length,
    minimumDurationMs: Math.min(...durationsMs),
    maximumDurationMs: Math.max(...durationsMs),
  };
}

export function compareLatencySummaries(
  baseline: LatencySummary,
  candidate: LatencySummary,
): LatencyComparison {
  if (
    baseline.averageDurationMs === null ||
    candidate.averageDurationMs === null
  ) {
    return {
      baseline,
      candidate,
      averageDurationDeltaMs: null,
      classification: "insufficient-evidence",
    };
  }

  const averageDurationDeltaMs =
    candidate.averageDurationMs - baseline.averageDurationMs;

  return {
    baseline,
    candidate,
    averageDurationDeltaMs,
    classification:
      averageDurationDeltaMs < 0
        ? "faster"
        : averageDurationDeltaMs > 0
          ? "slower"
          : "unchanged",
  };
}
