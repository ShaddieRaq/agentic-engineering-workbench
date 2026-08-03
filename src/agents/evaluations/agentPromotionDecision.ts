import { randomUUID } from "node:crypto";
import { z } from "zod";
import { agentCandidateIdentitySchema } from "../agentCandidateIdentity.js";
import type { AgentCandidateEvaluationArtifact } from "./agentCandidateEvaluationArtifact.js";

export const agentPromotionDecisionKindSchema = z.enum([
  "approve",
  "reject",
  "revise",
]);

export const agentPromotionReleaseTaskSchema = z
  .object({
    kind: z.literal("source-controlled-agent-release"),
    subjectAgentId: z.string().min(1),
    baseVersion: z.string().min(1),
    candidateId: z.uuid(),
    proposalId: z.string().min(1),
    effectivePolicyDigest: z.string().regex(/^[a-f0-9]{64}$/),
    requiredActions: z.array(z.string().min(1).max(2_000)).min(1).max(20),
  })
  .strict();

export const agentPromotionDecisionSchema = z
  .object({
    decisionId: z.uuid(),
    decision: agentPromotionDecisionKindSchema,
    candidateEvaluationArtifactId: z.string().min(1),
    proposalArtifactId: z.string().min(1).nullable(),
    subject: z
      .object({
        agentId: z.string().min(1),
        agentVersion: z.string().min(1),
        manifestDigest: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict(),
    candidate: agentCandidateIdentitySchema,
    planId: z.uuid(),
    planDigest: z.string().regex(/^[a-f0-9]{64}$/),
    gatesPassed: z.boolean(),
    operatorId: z.string().min(1).max(200),
    rationale: z.string().min(1).max(8_000),
    releaseTask: agentPromotionReleaseTaskSchema.nullable(),
    decidedAt: z.string().min(1),
  })
  .strict()
  .superRefine((decision, context) => {
    if (decision.decision === "approve" && !decision.gatesPassed) {
      context.addIssue({
        code: "custom",
        path: ["decision"],
        message: "A candidate with failed promotion gates cannot be approved.",
      });
    }
    if (decision.decision === "approve" && decision.releaseTask === null) {
      context.addIssue({
        code: "custom",
        path: ["releaseTask"],
        message: "An approval requires a source-controlled release task.",
      });
    }
    if (decision.decision !== "approve" && decision.releaseTask !== null) {
      context.addIssue({
        code: "custom",
        path: ["releaseTask"],
        message: "Only an approval may include a release task.",
      });
    }
    if (
      decision.releaseTask !== null &&
      (
        decision.releaseTask.subjectAgentId !== decision.subject.agentId ||
        decision.releaseTask.baseVersion !== decision.subject.agentVersion ||
        decision.releaseTask.candidateId !== decision.candidate.candidateId ||
        decision.releaseTask.proposalId !== decision.candidate.proposalId ||
        decision.releaseTask.effectivePolicyDigest !==
          decision.candidate.effectivePolicyDigest
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["releaseTask"],
        message: "Release task does not match the decided candidate.",
      });
    }
  });

export type AgentPromotionDecisionKind = z.infer<
  typeof agentPromotionDecisionKindSchema
>;
export type AgentPromotionDecision = z.infer<
  typeof agentPromotionDecisionSchema
>;
export type AgentPromotionReleaseTask = z.infer<
  typeof agentPromotionReleaseTaskSchema
>;

export function createAgentPromotionDecision(input: {
  comparison: AgentCandidateEvaluationArtifact;
  decision: AgentPromotionDecisionKind;
  operatorId: string;
  rationale: string;
  proposalArtifactId?: string | null;
  decisionId?: string;
  decidedAt?: string;
}): AgentPromotionDecision {
  const { comparison } = input;
  const releaseTask = input.decision === "approve"
    ? {
      kind: "source-controlled-agent-release" as const,
      subjectAgentId: comparison.plan.subject.agentId,
      baseVersion: comparison.plan.subject.agentVersion,
      candidateId: comparison.plan.candidate.candidateId,
      proposalId: comparison.plan.candidate.proposalId,
      effectivePolicyDigest:
        comparison.plan.candidate.effectivePolicyDigest,
      requiredActions: [
        "Review the candidate policy against the frozen comparison evidence.",
        "Apply the approved effective policy through a source-controlled agent registration change.",
        "Do not mutate the platform registry or source from this decision artifact.",
        `Preserve candidate ${comparison.plan.candidate.candidateId} and effective-policy digest ${comparison.plan.candidate.effectivePolicyDigest} in the release commit message or notes.`,
      ],
    }
    : null;

  return agentPromotionDecisionSchema.parse({
    decisionId: input.decisionId ?? randomUUID(),
    decision: input.decision,
    candidateEvaluationArtifactId: comparison.candidateEvaluationId,
    proposalArtifactId: input.proposalArtifactId ?? null,
    subject: comparison.plan.subject,
    candidate: comparison.plan.candidate,
    planId: comparison.plan.planId,
    planDigest: comparison.plan.planDigest,
    gatesPassed: comparison.gates.passed,
    operatorId: input.operatorId,
    rationale: input.rationale,
    releaseTask,
    decidedAt: input.decidedAt ?? new Date().toISOString(),
  });
}
