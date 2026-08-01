export interface ReliabilityCountEvidence {
  passedRuns: number;
  totalRuns: number;
}

export interface ProportionConfidenceInterval {
  confidenceLevel: 0.95;
  lowerBound: number;
  upperBound: number;
}

export type ConfidenceIntervalRelationship =
  | "candidate-above"
  | "baseline-above"
  | "overlapping"
  | "insufficient-evidence";

export interface ReliabilityConfidenceComparison {
  baseline: ProportionConfidenceInterval | null;
  candidate: ProportionConfidenceInterval | null;
  relationship: ConfidenceIntervalRelationship;
}

const zScore95 = 1.959963984540054;

export function calculateWilson95Interval(
  evidence: ReliabilityCountEvidence,
): ProportionConfidenceInterval | null {
  if (evidence.totalRuns === 0) {
    return null;
  }

  if (
    evidence.passedRuns < 0 ||
    evidence.passedRuns > evidence.totalRuns ||
    !Number.isInteger(evidence.passedRuns) ||
    !Number.isInteger(evidence.totalRuns)
  ) {
    throw new Error("Reliability counts must be valid integers.");
  }

  const proportion = evidence.passedRuns / evidence.totalRuns;
  const zSquared = zScore95 ** 2;
  const denominator = 1 + zSquared / evidence.totalRuns;
  const center =
    (proportion + zSquared / (2 * evidence.totalRuns)) /
    denominator;
  const margin =
    (zScore95 *
      Math.sqrt(
        (proportion * (1 - proportion)) / evidence.totalRuns +
          zSquared / (4 * evidence.totalRuns ** 2),
      )) /
    denominator;

  return {
    confidenceLevel: 0.95,
    lowerBound: Math.max(0, center - margin),
    upperBound: Math.min(1, center + margin),
  };
}

export function compareReliabilityConfidence(
  baselineEvidence: ReliabilityCountEvidence,
  candidateEvidence: ReliabilityCountEvidence,
): ReliabilityConfidenceComparison {
  const baseline = calculateWilson95Interval(baselineEvidence);
  const candidate = calculateWilson95Interval(candidateEvidence);

  if (!baseline || !candidate) {
    return {
      baseline,
      candidate,
      relationship: "insufficient-evidence",
    };
  }

  return {
    baseline,
    candidate,
    relationship:
      candidate.lowerBound > baseline.upperBound
        ? "candidate-above"
        : baseline.lowerBound > candidate.upperBound
          ? "baseline-above"
          : "overlapping",
  };
}
