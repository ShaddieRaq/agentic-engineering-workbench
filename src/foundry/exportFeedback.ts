import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  agentExportManifestSchema,
  type AgentExportManifest,
} from "./agentExport.js";
import { projectBriefDraftContentSchema } from "./projectBrief.js";

export const exportFeedbackBundleSchema = z
  .object({
    exportIdentity: z
      .object({
        agentId: z.string().min(1),
        agentVersion: z.string().min(1),
        policyDigest: z.string().regex(/^[a-f0-9]{64}$/),
        exportId: z.uuid(),
      })
      .strict(),
    sessionDate: z.string().min(1),
    turnCount: z.number().int().min(0),
    finalBriefVersion: z.number().int().min(1),
    finalBrief: projectBriefDraftContentSchema,
    issuesObserved: z.array(z.string().min(1)).max(100),
    observations: z.array(z.string().min(1)).max(100),
  })
  .strict();

export const exportFeedbackRecordSchema = z
  .object({
    feedbackId: z.uuid(),
    importedAt: z.string().min(1),
    exportId: z.uuid(),
    subject: z
      .object({
        agentId: z.string().min(1),
        agentVersion: z.string().min(1),
        policyDigest: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict(),
    bundle: exportFeedbackBundleSchema,
    provenanceVerified: z.literal(true),
  })
  .strict();

export type ExportFeedbackBundle = z.infer<typeof exportFeedbackBundleSchema>;
export type ExportFeedbackRecord = z.infer<typeof exportFeedbackRecordSchema>;

export function importExportFeedback(input: {
  bundle: unknown;
  provenance: unknown;
  feedbackId?: string;
  importedAt?: string;
}): ExportFeedbackRecord {
  const bundle = exportFeedbackBundleSchema.parse(input.bundle);
  const provenance: AgentExportManifest = agentExportManifestSchema.parse(
    input.provenance,
  );

  const identity = bundle.exportIdentity;
  if (identity.exportId !== provenance.exportId) {
    throw new Error(
      `Feedback bundle export ${identity.exportId} does not match provenance export ${provenance.exportId}.`,
    );
  }
  if (
    identity.agentId !== provenance.subject.agentId ||
    identity.agentVersion !== provenance.subject.agentVersion
  ) {
    throw new Error(
      `Feedback bundle subject ${identity.agentId}@${identity.agentVersion} does not match ` +
        `provenance subject ${provenance.subject.agentId}@${provenance.subject.agentVersion}.`,
    );
  }
  if (identity.policyDigest !== provenance.subject.policyDigest) {
    throw new Error(
      "Feedback bundle policy digest does not match the export provenance.",
    );
  }

  return exportFeedbackRecordSchema.parse({
    feedbackId: input.feedbackId ?? randomUUID(),
    importedAt: input.importedAt ?? new Date().toISOString(),
    exportId: identity.exportId,
    subject: {
      agentId: identity.agentId,
      agentVersion: identity.agentVersion,
      policyDigest: identity.policyDigest,
    },
    bundle,
    provenanceVerified: true,
  });
}
