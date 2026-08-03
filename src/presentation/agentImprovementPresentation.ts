import { summarizeTokenCosts } from "../orchestration/tokenCostComparison.js";
import type { AgentImprovementAnalysisResult } from "../agents/agentImprovement/agentImprovementAnalysis.js";
import {
  artifactPresentationSchema,
  type ArtifactPresentation,
} from "./artifactPresentation.js";

export function presentAgentImprovement(
  artifactId: string,
  analysis: AgentImprovementAnalysisResult,
): ArtifactPresentation {
  const proposal = analysis.parsedOutput;
  const policy = analysis.policyEvaluation;
  const usageSummary = summarizeTokenCosts([analysis.provider]);
  const usage = analysis.provider?.usage
    ? {
        model: analysis.provider.model,
        inputTokens: analysis.provider.usage.inputTokens,
        cachedInputTokens: analysis.provider.usage.cachedInputTokens,
        outputTokens: analysis.provider.usage.outputTokens,
        reasoningTokens: analysis.provider.usage.reasoningTokens,
        totalTokens: analysis.provider.usage.totalTokens,
        estimatedCostUsd: usageSummary.estimatedCostUsd,
        pricingIds: usageSummary.pricingIds,
      }
    : null;

  return artifactPresentationSchema.parse({
    artifactId,
    artifactKind: "agent-improvement-proposal",
    presentationKind: "agent-improvement",
    title: `Improvement Proposal: ${analysis.packet.subject.agentId}`,
    agentId: analysis.packet.subject.agentId,
    agentVersion: analysis.packet.subject.agentVersion,
    workspaceId: analysis.packet.execution.workspaceId,
    succeeded: analysis.succeeded,
    assessment:
      policy?.message ??
      analysis.executionFailure?.message ??
      analysis.refusal ??
      "No policy assessment was produced.",
    overview: proposal?.summary ?? null,
    completedAt: analysis.completedAt,
    durationMs: analysis.durationMs,
    metrics: [
      {
        id: "disposition",
        label: "Disposition",
        value: proposal?.disposition ?? "Unavailable",
        detail: null,
      },
      {
        id: "evidence",
        label: "Evidence items",
        value: String(analysis.packet.evidenceItems.length),
        detail: `${analysis.packet.excludedEvidence.length} deliberately excluded`,
      },
      {
        id: "failure-modes",
        label: "Failure modes",
        value: String(proposal?.failureModes.length ?? 0),
        detail: null,
      },
      {
        id: "recommendations",
        label: "Recommendations",
        value: String(proposal?.recommendations.length ?? 0),
        detail: proposal?.candidatePolicyPatch
          ? "Bounded candidate patch proposed"
          : "No executable candidate patch",
      },
    ],
    findings: [],
    coverageGaps:
      proposal?.evidenceGaps.map((reason, index) => ({
        area: `Evidence gap ${index + 1}`,
        reason,
        evidencePaths: [],
      })) ?? [],
    prioritizedActions:
      proposal?.recommendations.map(
        ({ priority, category, proposedChange }) =>
          `${priority} · ${category}: ${proposedChange}`,
      ) ?? [],
    sources: [],
    timeline: [
      {
        id: "selection",
        label: "Evaluation evidence selection",
        status: "completed",
        detail: `${analysis.packet.evidenceItems.length} bounded items selected; hidden expectations remained excluded.`,
        durationMs: null,
      },
      {
        id: "analysis",
        label: "Read-only improvement analysis",
        status: analysis.executionFailure
          ? "failed"
          : analysis.refusal
            ? "warning"
            : proposal
              ? "completed"
              : "skipped",
        detail:
          analysis.executionFailure?.message ??
          analysis.refusal ??
          `Structured proposal produced by ${analysis.provider?.model ?? "an unknown model"}.`,
        durationMs: analysis.durationMs,
      },
      {
        id: "policy",
        label: "Citation and candidate policy",
        status: policy === null ? "skipped" : policy.passed ? "completed" : "failed",
        detail: policy?.message ?? "Policy validation was unavailable.",
        durationMs: null,
      },
      {
        id: "persistence",
        label: "Immutable proposal persistence",
        status: "completed",
        detail: `Proposal ${artifactId} references evaluation ${analysis.packet.sourceExperimentIds.join(", ")}.`,
        durationMs: null,
      },
    ],
    usage,
    warnings: [
      ...(analysis.refusal ? [`Provider refusal: ${analysis.refusal}`] : []),
      ...(analysis.executionFailure
        ? [
            `Provider ${analysis.executionFailure.category} failure: ${analysis.executionFailure.message}`,
          ]
        : []),
      ...(policy && !policy.passed ? policy.issues : []),
    ],
    improvement: {
      sourceExperimentIds: analysis.packet.sourceExperimentIds,
      evidenceItemCount: analysis.packet.evidenceItems.length,
      excludedEvidenceCount: analysis.packet.excludedEvidence.length,
      proposal,
      policyEvaluation: policy,
    },
  });
}
