import { randomUUID } from "node:crypto";
import { z } from "zod";
import { digestJsonEvidence } from "../agents/agentEvidenceDigest.js";
import { capabilityPlanSchema, type CapabilityPlan } from "./capabilityPlan.js";

export const capabilityPlanDecisionKindSchema = z.enum([
  "approve",
  "reject",
  "revise",
]);

export const capabilityPlanDecisionSchema = z
  .object({
    decisionId: z.uuid(),
    decision: capabilityPlanDecisionKindSchema,
    capabilityPlanId: z.uuid(),
    capabilityPlanArtifactId: z.string().min(1),
    capabilityPlanDigest: z.string().regex(/^[a-f0-9]{64}$/),
    planId: z.uuid(),
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

export type CapabilityPlanDecisionKind = z.infer<
  typeof capabilityPlanDecisionKindSchema
>;
export type CapabilityPlanDecision = z.infer<typeof capabilityPlanDecisionSchema>;

export function createCapabilityPlanDecision(input: {
  capabilityPlan: CapabilityPlan;
  capabilityPlanArtifactId: string;
  decision: CapabilityPlanDecisionKind;
  operatorId: string;
  rationale: string;
  requestedRevisions?: string[] | null;
  decisionId?: string;
  decidedAt?: string;
}): CapabilityPlanDecision {
  const capabilityPlan = capabilityPlanSchema.parse(input.capabilityPlan);

  if (input.decision === "approve") {
    const blockingConcerns = capabilityPlan.content.concerns.filter(
      ({ severity }) => severity === "blocking",
    );
    if (blockingConcerns.length > 0) {
      throw new Error(
        `A capability plan with blocking concerns cannot be approved: ${blockingConcerns
          .map(({ id }) => id)
          .join(", ")}.`,
      );
    }
  }

  return capabilityPlanDecisionSchema.parse({
    decisionId: input.decisionId ?? randomUUID(),
    decision: input.decision,
    capabilityPlanId: capabilityPlan.capabilityPlanId,
    capabilityPlanArtifactId: input.capabilityPlanArtifactId,
    capabilityPlanDigest: digestJsonEvidence(capabilityPlan),
    planId: capabilityPlan.planId,
    briefId: capabilityPlan.briefId,
    briefVersion: capabilityPlan.briefVersion,
    operatorId: input.operatorId,
    rationale: input.rationale,
    requestedRevisions: input.requestedRevisions ?? null,
    decidedAt: input.decidedAt ?? new Date().toISOString(),
  });
}
