import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  agentCandidateIdentitySchema,
  type AgentCandidateIdentity,
} from "../agentCandidateIdentity.js";
import { digestJsonEvidence } from "../agentEvidenceDigest.js";
import type { AgentRegistration } from "../agentRegistration.js";
import type {
  AgentRevisionSurface,
  RevisionPolicy,
} from "../agentRevisionSurface.js";
import type { AgentImprovementEvidencePacket } from "./agentImprovementEvidence.js";
import {
  evaluateAgentImprovementProposal,
  type AgentImprovementProposalOutput,
} from "./agentImprovementProposal.js";

const policyRecordSchema = z.record(z.string().min(1), z.json());

export const agentCandidateEvidenceSchema = z
  .object({
    identity: agentCandidateIdentitySchema,
    changedFields: z
      .array(z.string().min(1).max(200))
      .min(1)
      .max(20)
      .refine((values) => new Set(values).size === values.length, {
        message: "Candidate changed fields must be unique.",
      }),
    baselinePolicy: policyRecordSchema,
    effectivePolicy: policyRecordSchema,
  })
  .strict();

export { agentCandidateIdentitySchema };
export type { AgentCandidateIdentity };
export type AgentCandidateEvidence = z.infer<
  typeof agentCandidateEvidenceSchema
>;

export interface BuiltAgentCandidate {
  evidence: AgentCandidateEvidence;
  registration: AgentRegistration;
}

// Validates that applying a proposal's policy patch to the baseline yields
// a policy the subject's schema accepts. Run at PROPOSAL time so schema
// violations (e.g. an over-long instruction line) surface as legible
// policy issues instead of a raw parse error when the operator later
// launches the frozen comparison (observed live: a 321-character
// briefRules line passed proposal policy and failed at the comparison
// click).
export function validateCandidatePolicyPatch(
  surface: Pick<AgentRevisionSurface, "schema" | "baselinePolicy">,
  patch: { changes: { field: string; valueJson: string }[] },
): string[] {
  const issues: string[] = [];
  const effectivePolicy: RevisionPolicy = structuredClone(
    surface.baselinePolicy,
  );
  for (const change of patch.changes) {
    try {
      effectivePolicy[change.field] = z.json().parse(JSON.parse(change.valueJson));
    } catch {
      // Malformed JSON is already reported by the shape checks.
      return issues;
    }
  }
  const parsed = surface.schema.safeParse(effectivePolicy);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      issues.push(
        `Candidate patch produces an invalid policy at ${issue.path.join(".")}: ${issue.message}.`,
      );
    }
  }
  return issues;
}

export function buildAgentCandidate(input: {
  registration: AgentRegistration;
  packet: AgentImprovementEvidencePacket;
  proposal: AgentImprovementProposalOutput;
  proposalId: string;
  candidateId?: string;
}): BuiltAgentCandidate {
  const policyEvaluation = evaluateAgentImprovementProposal(
    input.packet,
    input.proposal,
  );
  if (!policyEvaluation.passed) {
    throw new Error(policyEvaluation.message);
  }
  if (
    input.proposal.disposition !== "candidate-ready" ||
    input.proposal.candidatePolicyPatch === null
  ) {
    throw new Error("Only a valid candidate-ready proposal can build a candidate.");
  }

  const surface = input.registration.revisionSurface;
  if (!surface || input.packet.revisionSurface === null) {
    throw new Error("The subject does not expose a candidate revision surface.");
  }
  if (
    input.registration.manifest.id !== input.packet.subject.agentId ||
    input.registration.manifest.version !== input.packet.subject.agentVersion
  ) {
    throw new Error(
      "Candidate registration does not match the proposal subject.",
    );
  }

  const baselinePolicy = surface.schema.parse(
    structuredClone(surface.baselinePolicy),
  );
  const packetBaselineDigest = digestJsonEvidence(
    input.packet.revisionSurface.baselinePolicy,
  );
  const baselinePolicyDigest = digestJsonEvidence(baselinePolicy);
  if (
    packetBaselineDigest !== baselinePolicyDigest ||
    JSON.stringify(input.packet.revisionSurface.mutableFields) !==
      JSON.stringify(surface.mutableFields)
  ) {
    throw new Error(
      "Candidate revision surface does not match the analyzed evidence.",
    );
  }

  const effectivePolicy: RevisionPolicy = structuredClone(baselinePolicy);
  for (const change of input.proposal.candidatePolicyPatch.changes) {
    effectivePolicy[change.field] = z.json().parse(
      JSON.parse(change.valueJson),
    );
  }
  const validatedPolicy = surface.schema.parse(effectivePolicy);
  const effectivePolicyDigest = digestJsonEvidence(validatedPolicy);
  if (effectivePolicyDigest === baselinePolicyDigest) {
    throw new Error("Candidate policy patch does not change effective policy.");
  }

  const candidateRegistration = surface.createCandidate(validatedPolicy);
  if (
    JSON.stringify(candidateRegistration.manifest) !==
      JSON.stringify(input.registration.manifest)
  ) {
    throw new Error(
      "Candidate construction changed the released manifest boundary.",
    );
  }
  if (candidateRegistration.outputSchema !== input.registration.outputSchema) {
    throw new Error("Candidate construction changed the output contract.");
  }
  if (
    Boolean(candidateRegistration.assessDatasetCase) !==
    Boolean(input.registration.assessDatasetCase)
  ) {
    throw new Error(
      "Candidate construction changed dataset assessment capability.",
    );
  }
  const registration: AgentRegistration = {
    ...candidateRegistration,
    assess: input.registration.assess,
    ...(input.registration.assessDatasetCase
      ? { assessDatasetCase: input.registration.assessDatasetCase }
      : {}),
  };

  const evidence = agentCandidateEvidenceSchema.parse({
    identity: {
      subjectAgentId: input.registration.manifest.id,
      baseVersion: input.registration.manifest.version,
      candidateId: input.candidateId ?? randomUUID(),
      proposalId: input.proposalId,
      baselinePolicyDigest,
      effectivePolicyDigest,
    },
    changedFields: input.proposal.candidatePolicyPatch.changes.map(
      ({ field }) => field,
    ),
    baselinePolicy,
    effectivePolicy: validatedPolicy,
  });

  return { evidence, registration };
}
