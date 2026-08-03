import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  parseExecutionOptions,
  type ExecutionOptions,
} from "../../orchestration/executionPolicy.js";
import { agentCandidateIdentitySchema } from "../agentCandidateIdentity.js";
import { digestJsonEvidence } from "../agentEvidenceDigest.js";
import type {
  BuiltAgentCandidate,
} from "../agentImprovement/agentCandidateBuilder.js";
import type { AgentRegistration } from "../agentRegistration.js";
import {
  agentDatasetDefinitionSchema,
  agentDatasetPurposeSchema,
  type AgentDatasetDefinition,
} from "../datasets/agentDatasetDefinition.js";

const frozenDatasetSchema = z
  .object({
    datasetId: z.string().min(1),
    purpose: agentDatasetPurposeSchema,
    datasetDigest: z.string().regex(/^[a-f0-9]{64}$/),
    caseIds: z.array(z.string().min(1)).min(1),
    minimumPassRate: z.number().min(0).max(1).nullable().default(null),
  })
  .strict();

const planBodySchema = z
  .object({
    subject: z
      .object({
        agentId: z.string().min(1),
        agentVersion: z.string().min(1),
        manifestDigest: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict(),
    candidate: agentCandidateIdentitySchema,
    workspaceId: z.string().min(1),
    model: z.string().min(1),
    execution: z
      .object({
        repetitions: z.number().int().positive(),
        concurrency: z.number().int().positive(),
      })
      .strict(),
    graderBoundary: z
      .object({
        outputAssessment: z.literal("baseline-registration"),
        datasetCaseAssessment: z.enum([
          "baseline-registration",
          "none",
        ]),
      })
      .strict(),
    datasets: z.array(frozenDatasetSchema).min(1),
  })
  .strict();

export const agentCandidateEvaluationPlanEvidenceSchema = planBodySchema
  .extend({
    planId: z.uuid(),
    planDigest: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export type AgentCandidateEvaluationPlanEvidence = z.infer<
  typeof agentCandidateEvaluationPlanEvidenceSchema
>;

export interface FrozenAgentCandidateEvaluationPlan {
  evidence: Readonly<AgentCandidateEvaluationPlanEvidence>;
  baselineRegistration: AgentRegistration;
  candidateRegistration: AgentRegistration;
  datasets: readonly AgentDatasetDefinition[];
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export function createFrozenAgentCandidateEvaluationPlan(input: {
  baselineRegistration: AgentRegistration;
  candidate: BuiltAgentCandidate;
  datasets: readonly AgentDatasetDefinition[];
  workspaceId: string;
  model: string;
  execution?: ExecutionOptions;
  planId?: string;
}): FrozenAgentCandidateEvaluationPlan {
  const baseline = input.baselineRegistration;
  const candidateIdentity = input.candidate.evidence.identity;
  if (
    candidateIdentity.subjectAgentId !== baseline.manifest.id ||
    candidateIdentity.baseVersion !== baseline.manifest.version
  ) {
    throw new Error("Candidate identity does not match the baseline subject.");
  }
  if (
    JSON.stringify(input.candidate.registration.manifest) !==
      JSON.stringify(baseline.manifest)
  ) {
    throw new Error("Candidate manifest does not match the frozen baseline.");
  }
  if (
    input.candidate.registration.assess !== baseline.assess ||
    input.candidate.registration.assessDatasetCase !==
      baseline.assessDatasetCase
  ) {
    throw new Error("Candidate graders do not match the baseline registration.");
  }

  const expectedDatasetIds = [...baseline.manifest.verification.datasetIds]
    .sort();
  const datasets = input.datasets.map((dataset) =>
    agentDatasetDefinitionSchema.parse(structuredClone(dataset))
  );
  const actualDatasetIds = datasets.map(({ id }) => id).sort();
  if (
    JSON.stringify(actualDatasetIds) !== JSON.stringify(expectedDatasetIds)
  ) {
    throw new Error(
      "Evaluation datasets do not match the released verification manifest.",
    );
  }
  if (datasets.some(({ agentId }) => agentId !== baseline.manifest.id)) {
    throw new Error("Evaluation dataset belongs to another agent.");
  }

  const execution = parseExecutionOptions(input.execution);
  const body = planBodySchema.parse({
    subject: {
      agentId: baseline.manifest.id,
      agentVersion: baseline.manifest.version,
      manifestDigest: digestJsonEvidence(baseline.manifest),
    },
    candidate: candidateIdentity,
    workspaceId: input.workspaceId,
    model: input.model,
    execution,
    graderBoundary: {
      outputAssessment: "baseline-registration",
      datasetCaseAssessment: baseline.assessDatasetCase
        ? "baseline-registration"
        : "none",
    },
    datasets: datasets.map((dataset) => ({
      datasetId: dataset.id,
      purpose: dataset.purpose,
      datasetDigest: digestJsonEvidence(dataset),
      caseIds: dataset.cases.map(({ id }) => id),
      minimumPassRate: baseline.manifest.verification.minimumPassRate,
    })),
  });
  const evidence = agentCandidateEvaluationPlanEvidenceSchema.parse({
    ...body,
    planId: input.planId ?? randomUUID(),
    planDigest: digestJsonEvidence(body),
  });

  return Object.freeze({
    evidence: deepFreeze(evidence),
    baselineRegistration: baseline,
    candidateRegistration: input.candidate.registration,
    datasets: deepFreeze(datasets),
  });
}
