import { z } from "zod";

export const agentCandidateIdentitySchema = z
  .object({
    subjectAgentId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    baseVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    candidateId: z.uuid(),
    proposalId: z.string().min(1).max(200),
    baselinePolicyDigest: z.string().regex(/^[a-f0-9]{64}$/),
    effectivePolicyDigest: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export type AgentCandidateIdentity = z.infer<
  typeof agentCandidateIdentitySchema
>;
