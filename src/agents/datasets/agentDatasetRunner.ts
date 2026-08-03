import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  parseExecutionOptions,
  type ExecutionOptions,
} from "../../orchestration/executionPolicy.js";
import { mapWithConcurrency } from "../../orchestration/mapWithConcurrency.js";
import type { AgentRegistry } from "../agentRegistry.js";
import type { AgentOutputAssessment } from "../agentRegistration.js";
import type { AgentRunResult } from "../agentRunResult.js";
import { agentRunResultSchema } from "../agentRunResult.js";
import type {
  AgentDatasetCase,
  AgentDatasetDefinition,
} from "./agentDatasetDefinition.js";

export type AgentDatasetExecutor = (
  agentId: string,
  input: AgentDatasetCase["input"],
) => Promise<AgentRunResult>;

export interface AgentDatasetRunEvidence {
  datasetCaseId: string;
  agentRun: AgentRunResult;
  expectation?: AgentDatasetCase["expected"] | undefined;
  caseAssessment?: AgentOutputAssessment | undefined;
}

export interface AgentDatasetCaseSummary {
  datasetCaseId: string;
  totalRuns: number;
  passedRuns: number;
  failedRuns: number;
  passRate: number | null;
}

export interface AgentDatasetRunResult {
  datasetRunId: string;
  datasetId: string;
  agentId: string;
  agentVersion: string;
  runs: AgentDatasetRunEvidence[];
  caseSummaries: AgentDatasetCaseSummary[];
  completedAt: string;
}

export const agentDatasetRunResultSchema: z.ZodType<AgentDatasetRunResult> = z
  .object({
    datasetRunId: z.string().min(1),
    datasetId: z.string().min(1),
    agentId: z.string().min(1),
    agentVersion: z.string().min(1),
    runs: z.array(
      z
        .object({
          datasetCaseId: z.string().min(1),
          agentRun: agentRunResultSchema,
          expectation: z.json().optional(),
          caseAssessment: z
            .object({
              passed: z.boolean(),
              message: z.string().min(1),
            })
            .strict()
            .optional(),
        })
        .strict(),
    ),
    caseSummaries: z.array(
      z
        .object({
          datasetCaseId: z.string().min(1),
          totalRuns: z.number().int().nonnegative(),
          passedRuns: z.number().int().nonnegative(),
          failedRuns: z.number().int().nonnegative(),
          passRate: z.number().min(0).max(1).nullable(),
        })
        .strict(),
    ),
    completedAt: z.string().min(1),
  })
  .strict();

export async function runAgentDataset(
  dataset: AgentDatasetDefinition,
  agents: AgentRegistry,
  execute: AgentDatasetExecutor,
  options: ExecutionOptions = {},
): Promise<AgentDatasetRunResult> {
  const registration = agents.get(dataset.agentId);
  if (
    dataset.cases.some(({ expected }) => expected !== undefined) &&
    registration.assessDatasetCase === undefined
  ) {
    throw new Error(
      `Agent ${dataset.agentId} does not define dataset-case assessment.`,
    );
  }
  const policy = parseExecutionOptions(options);
  const plan = dataset.cases.flatMap((datasetCase) =>
    Array.from({ length: policy.repetitions }, () => datasetCase),
  );
  const runs = await mapWithConcurrency(
    plan,
    policy.concurrency,
    async (datasetCase) => {
      const agentRun = await execute(dataset.agentId, datasetCase.input);
      let caseAssessment: AgentOutputAssessment | undefined;

      if (
        datasetCase.expected !== undefined &&
        registration.assessDatasetCase !== undefined &&
        agentRun.succeeded &&
        agentRun.output !== null
      ) {
        try {
          caseAssessment = registration.assessDatasetCase(
            datasetCase.input,
            agentRun.output,
            datasetCase.expected,
          );
        } catch (error: unknown) {
          caseAssessment = {
            passed: false,
            message: `Dataset-case assessment failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          };
        }
      }

      return {
        datasetCaseId: datasetCase.id,
        agentRun,
        ...(datasetCase.expected === undefined
          ? {}
          : { expectation: datasetCase.expected }),
        ...(caseAssessment === undefined ? {} : { caseAssessment }),
      };
    },
  );
  const caseSummaries = dataset.cases.map(({ id }) => {
    const caseRuns = runs.filter(({ datasetCaseId }) => datasetCaseId === id);
    const passedRuns = caseRuns.filter(
      ({ agentRun, caseAssessment }) =>
        agentRun.succeeded && (caseAssessment?.passed ?? true),
    ).length;

    return {
      datasetCaseId: id,
      totalRuns: caseRuns.length,
      passedRuns,
      failedRuns: caseRuns.length - passedRuns,
      passRate: caseRuns.length === 0 ? null : passedRuns / caseRuns.length,
    };
  });

  return {
    datasetRunId: randomUUID(),
    datasetId: dataset.id,
    agentId: dataset.agentId,
    agentVersion: registration.manifest.version,
    runs,
    caseSummaries,
    completedAt: new Date().toISOString(),
  };
}
