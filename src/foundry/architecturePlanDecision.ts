import { randomUUID } from "node:crypto";
import { z } from "zod";
import { digestJsonEvidence } from "../agents/agentEvidenceDigest.js";
import { architecturePlanSchema, type ArchitecturePlan } from "./architecturePlan.js";

export const architecturePlanDecisionKindSchema = z.enum([
  "approve",
  "reject",
  "revise",
]);

export const architecturePlanDecisionSchema = z
  .object({
    decisionId: z.uuid(),
    decision: architecturePlanDecisionKindSchema,
    planId: z.uuid(),
    planArtifactId: z.string().min(1),
    planDigest: z.string().regex(/^[a-f0-9]{64}$/),
    briefId: z.uuid(),
    briefVersion: z.number().int().min(1),
    operatorId: z.string().min(1).max(200),
    rationale: z.string().min(1).max(8_000),
    requestedRevisions: z
      .array(z.string().min(1).max(2_000))
      .min(1)
      .max(20)
      .nullable(),
    decidedAt: z.string().min(1),
  })
  .strict()
  .superRefine((decision, context) => {
    if (decision.decision === "revise" && decision.requestedRevisions === null) {
      context.addIssue({
        code: "custom",
        path: ["requestedRevisions"],
        message: "A revise decision must list the requested revisions.",
      });
    }
    if (decision.decision !== "revise" && decision.requestedRevisions !== null) {
      context.addIssue({
        code: "custom",
        path: ["requestedRevisions"],
        message: "Only a revise decision may include requested revisions.",
      });
    }
  });

export type ArchitecturePlanDecisionKind = z.infer<
  typeof architecturePlanDecisionKindSchema
>;
export type ArchitecturePlanDecision = z.infer<
  typeof architecturePlanDecisionSchema
>;

export function createArchitecturePlanDecision(input: {
  plan: ArchitecturePlan;
  planArtifactId: string;
  decision: ArchitecturePlanDecisionKind;
  operatorId: string;
  rationale: string;
  requestedRevisions?: string[] | null;
  decisionId?: string;
  decidedAt?: string;
}): ArchitecturePlanDecision {
  const plan = architecturePlanSchema.parse(input.plan);

  if (input.decision === "approve") {
    const blockingConcerns = plan.content.concerns.filter(
      ({ severity }) => severity === "blocking",
    );
    if (blockingConcerns.length > 0) {
      throw new Error(
        `A plan with blocking concerns cannot be approved: ${blockingConcerns
          .map(({ id }) => id)
          .join(", ")}.`,
      );
    }
  }

  return architecturePlanDecisionSchema.parse({
    decisionId: input.decisionId ?? randomUUID(),
    decision: input.decision,
    planId: plan.planId,
    planArtifactId: input.planArtifactId,
    planDigest: digestJsonEvidence(plan),
    briefId: plan.briefId,
    briefVersion: plan.briefVersion,
    operatorId: input.operatorId,
    rationale: input.rationale,
    requestedRevisions: input.requestedRevisions ?? null,
    decidedAt: input.decidedAt ?? new Date().toISOString(),
  });
}
