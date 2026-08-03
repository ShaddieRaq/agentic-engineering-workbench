import { z } from "zod";
import type { AgentImprovementEvidencePacket } from "./agentImprovementEvidence.js";

export const agentImprovementDispositionSchema = z.enum([
  "candidate-ready",
  "engineering-change-required",
  "evaluation-gap",
  "insufficient-evidence",
  "no-change",
]);

export const agentImprovementRecommendationCategorySchema = z.enum([
  "instructions",
  "context-policy",
  "workflow-policy",
  "model-policy",
  "tool-capability",
  "output-contract",
  "evaluator",
  "dataset",
  "implementation",
  "no-change",
]);

const citedObservationSchema = z
  .object({
    title: z.string().min(1).max(500),
    explanation: z.string().min(1).max(4_000),
    confidence: z.enum(["low", "medium", "high"]),
    evidenceIds: z.array(z.string().min(1).max(300)).min(1).max(20),
  })
  .strict();

export const agentImprovementProposalOutputSchema = z
  .object({
    disposition: agentImprovementDispositionSchema,
    summary: z.string().min(1).max(4_000),
    failureModes: z.array(citedObservationSchema).max(20),
    rootCauseHypotheses: z.array(citedObservationSchema).max(20),
    recommendations: z
      .array(
        z
          .object({
            category: agentImprovementRecommendationCategorySchema,
            title: z.string().min(1).max(500),
            rationale: z.string().min(1).max(4_000),
            proposedChange: z.string().min(1).max(8_000),
            priority: z.enum(["low", "medium", "high"]),
            evidenceIds: z.array(z.string().min(1).max(300)).min(1).max(20),
          })
          .strict(),
      )
      .min(1)
      .max(20),
    candidatePolicyPatch: z.record(z.string().min(1), z.json()).nullable(),
    suggestedEvaluationCases: z
      .array(
        z
          .object({
            title: z.string().min(1).max(500),
            purpose: z.string().min(1).max(2_000),
            expectedBehavior: z.string().min(1).max(2_000),
            protectsAgainst: z.string().min(1).max(2_000),
          })
          .strict(),
      )
      .max(20),
    expectedEffects: z
      .array(
        z
          .object({
            metric: z.enum([
              "reliability",
              "correctness",
              "grounding",
              "cost",
              "latency",
              "safety",
            ]),
            direction: z.enum(["improve", "unchanged", "may-regress"]),
            explanation: z.string().min(1).max(2_000),
          })
          .strict(),
      )
      .min(1)
      .max(20),
    risks: z
      .array(
        z
          .object({
            risk: z.string().min(1).max(2_000),
            mitigation: z.string().min(1).max(2_000),
          })
          .strict(),
      )
      .min(1)
      .max(20),
    evidenceGaps: z.array(z.string().min(1).max(2_000)).max(20),
    verificationPlan: z
      .object({
        successCriteria: z.array(z.string().min(1).max(2_000)).min(1).max(20),
        protectedRequirements: z.array(z.string().min(1).max(2_000)).min(1).max(20),
        recommendedRepetitions: z.number().int().positive().max(100),
      })
      .strict(),
  })
  .strict();

export type AgentImprovementProposalOutput = z.infer<
  typeof agentImprovementProposalOutputSchema
>;

export const agentImprovementProposalPolicyEvaluationSchema = z
  .object({
    passed: z.boolean(),
    citedEvidenceIds: z.array(z.string().min(1)),
    invalidEvidenceIds: z.array(z.string().min(1)),
    issues: z.array(z.string().min(1)),
    message: z.string().min(1),
  })
  .strict();

export type AgentImprovementProposalPolicyEvaluation = z.infer<
  typeof agentImprovementProposalPolicyEvaluationSchema
>;

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

export function evaluateAgentImprovementProposal(
  packet: AgentImprovementEvidencePacket,
  proposal: AgentImprovementProposalOutput,
): AgentImprovementProposalPolicyEvaluation {
  const issues: string[] = [];
  const available = new Set(packet.evidenceItems.map(({ id }) => id));
  const citedEvidenceIds = uniqueSorted([
    ...proposal.failureModes.flatMap(({ evidenceIds }) => evidenceIds),
    ...proposal.rootCauseHypotheses.flatMap(({ evidenceIds }) => evidenceIds),
    ...proposal.recommendations.flatMap(({ evidenceIds }) => evidenceIds),
  ]);
  const invalidEvidenceIds = citedEvidenceIds.filter((id) => !available.has(id));

  if (invalidEvidenceIds.length > 0) {
    issues.push(`Proposal cites unavailable evidence: ${invalidEvidenceIds.join(", ")}.`);
  }

  const patch = proposal.candidatePolicyPatch;
  const patchKeys = patch === null ? [] : Object.keys(patch);

  if (proposal.disposition === "candidate-ready") {
    if (packet.revisionSurface === null) {
      issues.push("A candidate cannot be prepared because the subject exposes no revision surface.");
    }
    if (patch === null || patchKeys.length === 0) {
      issues.push("A candidate-ready proposal requires a nonempty policy patch.");
    }
    if (packet.revisionSurface !== null) {
      const allowed = new Set(packet.revisionSurface.mutableFields);
      const invalidFields = patchKeys.filter((field) => !allowed.has(field));
      if (invalidFields.length > 0) {
        issues.push(`Candidate patch changes fields outside the revision surface: ${invalidFields.join(", ")}.`);
      }
    }
  } else if (patch !== null) {
    issues.push("Only a candidate-ready proposal may include a policy patch.");
  }

  if (
    proposal.disposition === "evaluation-gap" &&
    !proposal.recommendations.some(({ category }) =>
      category === "evaluator" || category === "dataset"
    )
  ) {
    issues.push("An evaluation-gap proposal must recommend an evaluator or dataset change.");
  }

  if (
    proposal.disposition === "insufficient-evidence" &&
    proposal.evidenceGaps.length === 0
  ) {
    issues.push("An insufficient-evidence proposal must identify an evidence gap.");
  }

  if (
    proposal.disposition === "no-change" &&
    !proposal.recommendations.some(({ category }) => category === "no-change")
  ) {
    issues.push("A no-change proposal must explicitly recommend no change.");
  }

  return {
    passed: issues.length === 0,
    citedEvidenceIds,
    invalidEvidenceIds,
    issues,
    message: issues.length === 0
      ? "The improvement proposal is grounded in supplied evidence and respects the candidate boundary."
      : `The improvement proposal violates policy: ${issues.join(" ")}`,
  };
}
