import type { ArtifactStore } from "../artifacts/artifactStore.js";
import type { AgentPromotionDecision } from "../agents/evaluations/agentPromotionDecision.js";
import type { AgentCandidateEvaluationArtifact } from "../agents/evaluations/agentCandidateEvaluationArtifact.js";
import type { AgentImprovementAnalysisResult } from "../agents/agentImprovement/agentImprovementAnalysis.js";

// The self-hardening loop, surfaced as ONE story per promotion decision — the
// point where the platform found its own weakness, proposed a fix, gated it,
// and the operator disposed. The decision is the anchor: it links both the
// analyst proposal and the gated candidate evaluation.

export type SelfHardeningDecision = "approve" | "reject" | "revise";

export interface SelfHardeningSignalView {
  proposalArtifactId: string;
  model: string;
  repetitions: number;
  disposition: string | null;
  recommendationCount: number;
  hasPolicyPatch: boolean;
  policyValid: boolean | null;
}

export interface SelfHardeningGateView {
  gateId: string;
  status: "passed" | "failed" | "not-applicable";
  message: string;
}

export interface SelfHardeningComparisonView {
  candidateEvaluationArtifactId: string;
  improvedCases: number;
  regressedCases: number;
  unchangedCases: number;
  insufficientEvidenceCases: number;
  gatesPassed: boolean;
  gates: SelfHardeningGateView[];
}

export interface SelfHardeningCycleView {
  decisionId: string;
  subjectAgentId: string;
  subjectAgentVersion: string;
  decision: SelfHardeningDecision;
  gatesPassed: boolean;
  released: boolean;
  releaseActions: string[];
  operatorId: string;
  rationale: string;
  decidedAt: string;
  signal: SelfHardeningSignalView | null;
  comparison: SelfHardeningComparisonView | null;
}

export interface SelfHardeningIndexEntry {
  decisionId: string;
  subjectAgentId: string;
  subjectAgentVersion: string;
  decision: SelfHardeningDecision;
  gatesPassed: boolean;
  released: boolean;
  decidedAt: string;
}

export interface SelfHardeningIndex {
  cycles: SelfHardeningIndexEntry[];
}

type Store = Pick<ArtifactStore, "list" | "load">;

async function loadDecision(
  store: Store,
  id: string,
): Promise<AgentPromotionDecision | null> {
  try {
    const stored = await store.load(id);
    return stored.kind === "agent-promotion-decision" ? stored.artifact : null;
  } catch {
    return null;
  }
}

async function loadProposal(
  store: Store,
  id: string | null,
): Promise<AgentImprovementAnalysisResult | null> {
  if (id === null) return null;
  try {
    const stored = await store.load(id);
    return stored.kind === "agent-improvement-proposal" ? stored.artifact : null;
  } catch {
    return null;
  }
}

async function loadCandidate(
  store: Store,
  id: string,
): Promise<AgentCandidateEvaluationArtifact | null> {
  try {
    const stored = await store.load(id);
    return stored.kind === "agent-candidate-evaluation" ? stored.artifact : null;
  } catch {
    return null;
  }
}

function signalView(
  proposalArtifactId: string,
  proposal: AgentImprovementAnalysisResult,
): SelfHardeningSignalView {
  return {
    proposalArtifactId,
    model: proposal.packet.execution.model,
    repetitions: proposal.packet.execution.repetitions,
    disposition: proposal.parsedOutput?.disposition ?? null,
    recommendationCount: proposal.parsedOutput?.recommendations.length ?? 0,
    hasPolicyPatch: (proposal.parsedOutput?.candidatePolicyPatch ?? null) !== null,
    policyValid: proposal.policyEvaluation?.passed ?? null,
  };
}

function comparisonView(
  candidateEvaluationArtifactId: string,
  candidate: AgentCandidateEvaluationArtifact,
): SelfHardeningComparisonView {
  return {
    candidateEvaluationArtifactId,
    improvedCases: candidate.comparison.summary.improvedCases,
    regressedCases: candidate.comparison.summary.regressedCases,
    unchangedCases: candidate.comparison.summary.unchangedCases,
    insufficientEvidenceCases: candidate.comparison.summary.insufficientEvidenceCases,
    gatesPassed: candidate.gates.passed,
    gates: candidate.gates.results.map((result) => ({
      gateId: result.gateId,
      status: result.status,
      message: result.message,
    })),
  };
}

function indexEntry(decision: AgentPromotionDecision): SelfHardeningIndexEntry {
  return {
    decisionId: decision.decisionId,
    subjectAgentId: decision.subject.agentId,
    subjectAgentVersion: decision.subject.agentVersion,
    decision: decision.decision,
    gatesPassed: decision.gatesPassed,
    released: decision.releaseTask !== null,
    decidedAt: decision.decidedAt,
  };
}

/** The full cycle for one promotion decision, or null when the id is unknown. */
export async function buildSelfHardeningCycle(
  store: Store,
  decisionId: string,
): Promise<SelfHardeningCycleView | null> {
  const decision = await loadDecision(store, decisionId);
  if (!decision) return null;

  const proposal = await loadProposal(store, decision.proposalArtifactId);
  const candidate = await loadCandidate(store, decision.candidateEvaluationArtifactId);

  return {
    decisionId: decision.decisionId,
    subjectAgentId: decision.subject.agentId,
    subjectAgentVersion: decision.subject.agentVersion,
    decision: decision.decision,
    gatesPassed: decision.gatesPassed,
    released: decision.releaseTask !== null,
    releaseActions: decision.releaseTask?.requiredActions ?? [],
    operatorId: decision.operatorId,
    rationale: decision.rationale,
    decidedAt: decision.decidedAt,
    signal:
      proposal && decision.proposalArtifactId
        ? signalView(decision.proposalArtifactId, proposal)
        : null,
    comparison: candidate
      ? comparisonView(decision.candidateEvaluationArtifactId, candidate)
      : null,
  };
}

/** Every self-hardening cycle (promotion decision), newest disposition first. */
export async function buildSelfHardeningIndex(
  store: Store,
): Promise<SelfHardeningIndex> {
  const listed = await store.list({ kind: "agent-promotion-decision" });
  const decisions: AgentPromotionDecision[] = [];
  for (const summary of listed.artifacts) {
    const decision = await loadDecision(store, summary.id);
    if (decision) decisions.push(decision);
  }
  decisions.sort((left, right) => (left.decidedAt < right.decidedAt ? 1 : -1));
  return { cycles: decisions.map(indexEntry) };
}
