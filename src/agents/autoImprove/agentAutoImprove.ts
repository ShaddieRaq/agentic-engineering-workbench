import type {
  AgentCandidateEvaluationEvidence,
  AgentImprovementEvidence,
  AnalyzeAgentImprovementRequest,
} from "../agentApplicationService.js";
import type { TriagedCase } from "../modelComparison/agentModelComparisonTriage.js";

/** Injected wrapper over AgentApplicationService.analyzeEvaluation. */
export type ImprovementAnalyzer = (
  request: AnalyzeAgentImprovementRequest,
) => Promise<AgentImprovementEvidence>;

/** Injected wrapper over AgentApplicationService.evaluateImprovementProposal. */
export type CandidateEvaluator = (
  proposalArtifactId: string,
) => Promise<AgentCandidateEvaluationEvidence>;

export type AutoImproveOutcome =
  | "promotable"
  | "gate-rejected"
  | "analyst-failed"
  | "error";

export interface AutoImproveAttempt {
  datasetId: string;
  caseId: string;
  analystAttempts: number;
  proposalArtifactId: string | null;
  disposition: string | null;
  policyValid: boolean;
  candidateEvaluationId: string | null;
  passedAllGates: boolean;
  failedGateIds: string[];
  improvedCases: number;
  regressedCases: number;
  outcome: AutoImproveOutcome;
  detail: string;
}

export interface AutoImproveResult {
  agentId: string;
  sourceExperimentId: string;
  solidAmbiguityCases: number;
  marginalSkipped: number;
  attempts: AutoImproveAttempt[];
}

/**
 * Standing constraints distilled from the by-hand improvement run. On the weak
 * (mini) analyst these failure modes each cost a wasted round; baked in here so
 * the floored (gpt-5.4) analyst produces a policy-valid candidate first try.
 */
export const HARDENED_ANALYST_CONSTRAINTS: readonly string[] = [
  "Edit only the exposed revision-surface instruction lines; do not change schema or ids.",
  "Keep each added or changed instruction line under 300 characters.",
  "Every evidenceIds entry must be an exact packet id beginning with 'case:' or 'trial:'; never cite 'revisionSurface', 'objective', 'aggregate', or a section name.",
  "If you include a candidatePolicyPatch, the disposition MUST be 'candidate-ready'. Use 'engineering-change-required' only when no instruction change can help, and then attach no patch.",
  "The change must be additive and must not weaken any existing rule.",
];

function describeCase(triaged: Pick<TriagedCase, "datasetId" | "caseId">): string {
  return (
    `The case "${triaged.caseId}" in dataset "${triaged.datasetId}" fails on every model ` +
    `measured by the model comparison eval — an ambiguity failure, meaning the task is under-specified ` +
    `or the expectation is off rather than a model-capability limit. Propose an additive ` +
    `instruction change on the exposed revision surface so this case passes without ` +
    `regressing any other case.`
  );
}

function isReady(evidence: AgentImprovementEvidence): boolean {
  const analysis = evidence.analysis;
  return (
    analysis.succeeded &&
    analysis.parsedOutput?.disposition === "candidate-ready" &&
    analysis.policyEvaluation?.passed === true
  );
}

/**
 * Drives the improvement loop over the triage's SOLID ambiguity cases: for each,
 * asks the analyst for a fix (bounded retries, feeding back any policy issue),
 * and — only on a policy-valid candidate-ready proposal — runs the gated
 * comparison. It never records a decision: a promotable or gate-rejected
 * candidate is handed to the operator to dispose. Marginal ambiguity cases are
 * skipped (they are likely variance; re-verify first).
 */
export async function runAutoImprove(input: {
  agentId: string;
  sourceExperimentId: string;
  ambiguity: TriagedCase[];
  analyze: ImprovementAnalyzer;
  evaluate: CandidateEvaluator;
  maxCases?: number;
  maxAnalystAttempts?: number;
}): Promise<AutoImproveResult> {
  const solid = input.ambiguity.filter((triaged) => !triaged.marginal);
  const marginalSkipped = input.ambiguity.length - solid.length;
  const maxCases = input.maxCases ?? 1;
  const maxAttempts = input.maxAnalystAttempts ?? 3;
  const attempts: AutoImproveAttempt[] = [];

  for (const triaged of solid.slice(0, maxCases)) {
    try {
      const constraints = [...HARDENED_ANALYST_CONSTRAINTS];
      let evidence: AgentImprovementEvidence | null = null;
      let analystAttempts = 0;

      while (analystAttempts < maxAttempts) {
        analystAttempts++;
        evidence = await input.analyze({
          experimentId: input.sourceExperimentId,
          target: "correctness",
          description: describeCase(triaged),
          constraints,
        });
        if (isReady(evidence)) break;

        const issues = evidence.analysis.policyEvaluation?.issues ?? [];
        const disposition = evidence.analysis.parsedOutput?.disposition;
        if (issues.length > 0) {
          constraints.push(
            `Correct these policy issues from your prior attempt: ${issues.join("; ")}`,
          );
        } else if (disposition && disposition !== "candidate-ready") {
          constraints.push(
            `Your prior disposition was '${disposition}'. An instruction change is possible here; return 'candidate-ready' with a candidatePolicyPatch.`,
          );
        }
      }

      if (!evidence || !isReady(evidence)) {
        attempts.push({
          datasetId: triaged.datasetId,
          caseId: triaged.caseId,
          analystAttempts,
          proposalArtifactId: evidence?.artifactId ?? null,
          disposition: evidence?.analysis.parsedOutput?.disposition ?? null,
          policyValid: false,
          candidateEvaluationId: null,
          passedAllGates: false,
          failedGateIds: [],
          improvedCases: 0,
          regressedCases: 0,
          outcome: "analyst-failed",
          detail: `Analyst did not produce a policy-valid candidate-ready proposal in ${analystAttempts} attempt(s).`,
        });
        continue;
      }

      const comparison = await input.evaluate(evidence.artifactId);
      const gateResults = comparison.evaluation.gates.results;
      const failedGateIds = gateResults
        .filter((gate) => gate.status === "failed")
        .map((gate) => gate.gateId);
      const summary = comparison.evaluation.comparison.summary;
      const passedAllGates = failedGateIds.length === 0;

      attempts.push({
        datasetId: triaged.datasetId,
        caseId: triaged.caseId,
        analystAttempts,
        proposalArtifactId: evidence.artifactId,
        disposition: "candidate-ready",
        policyValid: true,
        candidateEvaluationId: comparison.evaluation.candidateEvaluationId,
        passedAllGates,
        failedGateIds,
        improvedCases: summary.improvedCases,
        regressedCases: summary.regressedCases,
        outcome: passedAllGates ? "promotable" : "gate-rejected",
        detail: passedAllGates
          ? `Promotable: ${summary.improvedCases} improved, ${summary.regressedCases} regressed, all gates passed. Awaiting operator approval.`
          : `Gate-rejected: failed [${failedGateIds.join(", ")}]; ${summary.improvedCases} improved, ${summary.regressedCases} regressed.`,
      });
    } catch (error: unknown) {
      attempts.push({
        datasetId: triaged.datasetId,
        caseId: triaged.caseId,
        analystAttempts: 0,
        proposalArtifactId: null,
        disposition: null,
        policyValid: false,
        candidateEvaluationId: null,
        passedAllGates: false,
        failedGateIds: [],
        improvedCases: 0,
        regressedCases: 0,
        outcome: "error",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    agentId: input.agentId,
    sourceExperimentId: input.sourceExperimentId,
    solidAmbiguityCases: solid.length,
    marginalSkipped,
    attempts,
  };
}

/** One-line-per-attempt console summary of an auto-improve run. */
export function formatAutoImproveResult(result: AutoImproveResult): string {
  const lines: string[] = [];
  lines.push(
    `Auto-improve ${result.agentId}: ${result.solidAmbiguityCases} solid ambiguity case(s), ${result.marginalSkipped} marginal skipped.`,
  );
  if (result.attempts.length === 0) {
    lines.push(
      "No solid ambiguity cases to improve — nothing sent to the analyst.",
    );
    return lines.join("\n");
  }
  for (const attempt of result.attempts) {
    lines.push(
      `- ${attempt.datasetId}/${attempt.caseId} [${attempt.outcome}] — ${attempt.detail}` +
        (attempt.candidateEvaluationId
          ? ` (candidate ${attempt.candidateEvaluationId})`
          : ""),
    );
  }
  return lines.join("\n");
}
