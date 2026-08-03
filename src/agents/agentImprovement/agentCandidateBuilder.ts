import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  agentCandidateIdentitySchema,
  type AgentCandidateIdentity,
} from "../agentCandidateIdentity.js";
import { digestJsonEvidence } from "../agentEvidenceDigest.js";
import type { AgentRegistration } from "../agentRegistration.js";
import type { RevisionPolicy } from "../agentRevisionSurface.js";
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

  const registration = surface.createCandidate(validatedPolicy);
  if (
    JSON.stringify(registration.manifest) !==
      JSON.stringify(input.registration.manifest)
  ) {
    throw new Error(
      "Candidate construction changed the released manifest boundary.",
    );
  }
  if (registration.outputSchema !== input.registration.outputSchema) {
    throw new Error("Candidate construction changed the output contract.");
  }
  if (
    Boolean(registration.assessDatasetCase) !==
    Boolean(input.registration.assessDatasetCase)
  ) {
    throw new Error(
      "Candidate construction changed dataset assessment capability.",
    );
  }

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
