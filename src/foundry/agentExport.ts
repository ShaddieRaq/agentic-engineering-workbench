import { randomUUID } from "node:crypto";
import { z } from "zod";
import { digestJsonEvidence } from "../agents/agentEvidenceDigest.js";
import type { AgentPromotionDecision } from "../agents/evaluations/agentPromotionDecision.js";
import { projectIntakeAgent } from "../agents/projectIntake/projectIntakeAgent.js";
import { projectIntakeBaselinePolicy } from "../agents/projectIntake/projectIntakePolicy.js";
import { intakeTurnModelOutputSchema } from "./intakeTurnOutput.js";
import { projectBriefDraftContentShapeSchema } from "./projectBrief.js";

export const agentExportManifestSchema = z
  .object({
    exportId: z.uuid(),
    exportedAt: z.string().min(1),
    target: z.literal("claude-code"),
    subject: z
      .object({
        agentId: z.string().min(1),
        agentVersion: z.string().min(1),
        manifestDigest: z.string().regex(/^[a-f0-9]{64}$/),
        policyDigest: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict(),
    approval: z
      .object({
        decisionArtifactId: z.string().min(1),
        candidateId: z.uuid(),
        effectivePolicyDigest: z.string().regex(/^[a-f0-9]{64}$/),
        candidateEvaluationArtifactId: z.string().min(1),
      })
      .strict(),
    instructions: z
      .object({
        roleLines: z.array(z.string().min(1)).min(1),
        briefRules: z.array(z.string().min(1)).min(1),
        questionRules: z.array(z.string().min(1)).min(1),
        taskLines: z.array(z.string().min(1)).min(1),
      })
      .strict(),
    briefContentJsonSchema: z.json(),
    // Optional so first-generation provenance files (exported before the turn
    // schema shipped) remain importable evidence; new exports always set it.
    turnOutputJsonSchema: z.json().optional(),
    feedbackBundle: z
      .object({
        formatVersion: z.literal(1),
        fileName: z.string().min(1),
        requiredFields: z.array(z.string().min(1)).min(1),
      })
      .strict(),
  })
  .strict();

export type AgentExportManifest = z.infer<typeof agentExportManifestSchema>;

export function createProjectIntakeExport(input: {
  decision: AgentPromotionDecision;
  exportId?: string;
  exportedAt?: string;
}): AgentExportManifest {
  const { decision } = input;
  if (decision.decision !== "approve" || decision.releaseTask === null) {
    throw new Error("Only an approved promotion decision can be exported.");
  }
  if (decision.subject.agentId !== "project-intake") {
    throw new Error(
      `Decision subject ${decision.subject.agentId} is not project-intake.`,
    );
  }

  const policyDigest = digestJsonEvidence(projectIntakeBaselinePolicy);
  if (decision.releaseTask.effectivePolicyDigest !== policyDigest) {
    throw new Error(
      "The current baseline policy does not match the approved effective " +
        "policy digest; re-run the improvement loop or fix the release before exporting.",
    );
  }

  return agentExportManifestSchema.parse({
    exportId: input.exportId ?? randomUUID(),
    exportedAt: input.exportedAt ?? new Date().toISOString(),
    target: "claude-code",
    subject: {
      agentId: projectIntakeAgent.manifest.id,
      agentVersion: projectIntakeAgent.manifest.version,
      manifestDigest: digestJsonEvidence(projectIntakeAgent.manifest),
      policyDigest,
    },
    approval: {
      decisionArtifactId: decision.decisionId,
      candidateId: decision.candidate.candidateId,
      effectivePolicyDigest: decision.releaseTask.effectivePolicyDigest,
      candidateEvaluationArtifactId: decision.candidateEvaluationArtifactId,
    },
    instructions: projectIntakeBaselinePolicy.instructions,
    briefContentJsonSchema: z.toJSONSchema(projectBriefDraftContentShapeSchema),
    turnOutputJsonSchema: z.toJSONSchema(intakeTurnModelOutputSchema),
    feedbackBundle: {
      formatVersion: 1,
      fileName: "project-intake-feedback.json",
      requiredFields: [
        "exportIdentity",
        "sessionDate",
        "turnCount",
        "finalBriefVersion",
        "finalBrief",
        "issuesObserved",
        "observations",
      ],
    },
  });
}
