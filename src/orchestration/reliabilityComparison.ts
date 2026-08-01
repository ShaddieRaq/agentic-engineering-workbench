export interface PassRateSummary {
    passRate: number | null;
  }

  export type ReliabilityClassification =
    | "improved"
    | "regressed"
    | "unchanged"
    | "insufficient-evidence";

  export interface ReliabilityComparison {
    baselinePassRate: number | null;
    candidatePassRate: number | null;
    passRateDelta: number | null;
    classification: ReliabilityClassification;
  }

  export function compareReliabilitySummaries(
    baseline: PassRateSummary,
    candidate: PassRateSummary,
  ): ReliabilityComparison {
    if (
      baseline.passRate === null ||
      candidate.passRate === null
    ) {
      return {
        baselinePassRate: baseline.passRate,
        candidatePassRate: candidate.passRate,
        passRateDelta: null,
        classification: "insufficient-evidence",
      };
    }

    const passRateDelta =
      candidate.passRate - baseline.passRate;

    return {
      baselinePassRate: baseline.passRate,
      candidatePassRate: candidate.passRate,
      passRateDelta,
      classification:
        passRateDelta > 0
          ? "improved"
          : passRateDelta < 0
            ? "regressed"
            : "unchanged",
    };
  }