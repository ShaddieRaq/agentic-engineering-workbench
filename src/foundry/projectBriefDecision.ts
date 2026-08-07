import { randomUUID } from "node:crypto";
import { z } from "zod";
import { digestJsonEvidence } from "../agents/agentEvidenceDigest.js";
import { projectBriefSchema, type ProjectBrief } from "./projectBrief.js";

export const projectBriefDecisionKindSchema = z.enum([
  "approve",
  "reject",
  "revise",
  // Decision 088: recorded on an APPROVED brief to open an evolution
  // round; downstream gates close and the intake interview re-arms with a
  // session-scoped turn budget.
  "reopen",
]);

export const projectBriefDecisionSchema = z
  .object({
    decisionId: z.uuid(),
    decision: projectBriefDecisionKindSchema,
    briefId: z.uuid(),
    briefVersion: z.number().int().min(1),
    briefArtifactId: z.string().min(1),
    briefDigest: z.string().regex(/^[a-f0-9]{64}$/),
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

export type ProjectBriefDecisionKind = z.infer<
  typeof projectBriefDecisionKindSchema
>;
export type ProjectBriefDecision = z.infer<typeof projectBriefDecisionSchema>;

function collectUnresolvedEntryIds(brief: ProjectBrief): string[] {
  const unresolved: string[] = [];
  for (const section of [
    brief.goals,
    brief.users,
    brief.constraints,
    brief.risks,
    brief.nonGoals,
    brief.assumptions,
    brief.acceptanceCriteria,
  ]) {
    for (const entry of section) {
      if (entry.source === "unresolved") unresolved.push(entry.id);
    }
  }
  return unresolved;
}

export function createProjectBriefDecision(input: {
  brief: ProjectBrief;
  briefArtifactId: string;
  decision: ProjectBriefDecisionKind;
  operatorId: string;
  rationale: string;
  requestedRevisions?: string[] | null;
  decisionId?: string;
  decidedAt?: string;
}): ProjectBriefDecision {
  const brief = projectBriefSchema.parse(input.brief);

  if (input.decision === "approve") {
    const unresolvedIds = collectUnresolvedEntryIds(brief);
    if (unresolvedIds.length > 0) {
      throw new Error(
        `A brief with unresolved entries cannot be approved: ${unresolvedIds.join(", ")}.`,
      );
    }
    if (brief.openQuestions.length > 0) {
      throw new Error(
        `A brief with open questions cannot be approved: ${brief.openQuestions
          .map(({ id }) => id)
          .join(", ")}.`,
      );
    }
  }

  return projectBriefDecisionSchema.parse({
    decisionId: input.decisionId ?? randomUUID(),
    decision: input.decision,
    briefId: brief.briefId,
    briefVersion: brief.version,
    briefArtifactId: input.briefArtifactId,
    briefDigest: digestJsonEvidence(brief),
    operatorId: input.operatorId,
    rationale: input.rationale,
    requestedRevisions: input.requestedRevisions ?? null,
    decidedAt: input.decidedAt ?? new Date().toISOString(),
  });
}
