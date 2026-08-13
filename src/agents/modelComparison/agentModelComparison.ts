import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  parseExecutionOptions,
} from "../../orchestration/executionPolicy.js";
import { summarizeLatencies } from "../../orchestration/latencyComparison.js";
import { summarizeTokenCosts } from "../../orchestration/tokenCostComparison.js";
import type { AgentEvaluationEvidence } from "../agentApplicationService.js";

export const agentModelComparisonCellSchema = z
  .object({
    model: z.string().min(1),
    status: z.enum(["ok", "error"]),
    passed: z.boolean(),
    passRate: z.number().min(0).max(1).nullable(),
    totalRuns: z.number().int().nonnegative(),
    passedRuns: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative().nullable(),
    avgTokensPerRun: z.number().nonnegative().nullable(),
    estimatedCostUsd: z.number().nonnegative().nullable(),
    avgLatencyMs: z.number().nonnegative().nullable(),
    evaluationArtifactId: z.string().min(1).nullable(),
    error: z.string().min(1).nullable(),
  })
  .strict();

export const agentModelComparisonSchema = z
  .object({
    modelComparisonId: z.string().min(1),
    agentId: z.string().min(1),
    agentVersion: z.string().min(1).nullable(),
    execution: z
      .object({
        repetitions: z.number().int().positive(),
        concurrency: z.number().int().positive(),
      })
      .strict(),
    models: z.array(z.string().min(1)).min(1),
    cells: z.array(agentModelComparisonCellSchema).min(1),
    completedAt: z.string().min(1),
  })
  .strict();

export type AgentModelComparisonCell = z.infer<typeof agentModelComparisonCellSchema>;
export type AgentModelComparison = z.infer<typeof agentModelComparisonSchema>;

export interface AgentModelComparisonRequest {
  agentId: string;
  models: string[];
  repetitions?: number;
  concurrency?: number;
  workspaceId?: string;
}

/**
 * The narrow slice of {@link AgentApplicationService.verify} the modelComparison depends
 * on. Injecting the verifier (rather than the whole service) keeps the axis a
 * pure aggregation over per-model evaluation evidence — one live model at a
 * time — and lets it be exercised without booting real agents or providers.
 */
export type ModelComparisonVerifier = (request: {
  agentId: string;
  model: string;
  repetitions?: number;
  concurrency?: number;
  workspaceId?: string;
  allowBelowFloor?: boolean;
}) => Promise<AgentEvaluationEvidence>;

function buildCell(
  model: string,
  evidence: AgentEvaluationEvidence,
): AgentModelComparisonCell {
  const runs = evidence.datasets.flatMap((dataset) =>
    dataset.datasetRun.runs.map((run) => run.agentRun),
  );
  const tokens = summarizeTokenCosts(runs.map((run) => run.provider ?? null));
  const latency = summarizeLatencies(runs.map((run) => run.durationMs));
  const hasUsage = tokens.usageSampleCount > 0;

  return {
    model,
    status: "ok",
    passed: evidence.experiment.passed,
    passRate: evidence.experiment.summary.passRate,
    totalRuns: evidence.experiment.summary.totalRuns,
    passedRuns: evidence.experiment.summary.passedRuns,
    totalTokens: hasUsage ? tokens.totalTokens : null,
    avgTokensPerRun: hasUsage
      ? tokens.totalTokens / tokens.usageSampleCount
      : null,
    estimatedCostUsd: tokens.estimatedCostUsd,
    avgLatencyMs: latency.averageDurationMs,
    evaluationArtifactId: evidence.artifactId,
    error: null,
  };
}

/**
 * Runs one agent against its verification datasets across a set of models and
 * rolls up per-model pass-rate, tokens, cost, and latency — the cross-model
 * "tested on" badge. Each model is a self-contained `verify` call (already
 * parallel across cases internally), so the outer axis runs sequentially to
 * avoid cross-model rate-limit contention. A model that cannot run at all
 * (missing key, construction failure) becomes an `error` cell rather than
 * aborting the modelComparison; a model that runs but produces bad output simply scores
 * a low pass-rate — the intended failure signal, not an exception.
 */
export async function runAgentModelComparison(
  verify: ModelComparisonVerifier,
  request: AgentModelComparisonRequest,
): Promise<AgentModelComparison> {
  const execution = parseExecutionOptions({
    repetitions: request.repetitions,
    concurrency: request.concurrency,
  });
  const models = [...new Set(request.models)];
  if (models.length === 0) {
    throw new Error("A model comparison eval requires at least one model.");
  }

  const cells: AgentModelComparisonCell[] = [];
  let agentVersion: string | null = null;

  for (const model of models) {
    try {
      const evidence = await verify({
        agentId: request.agentId,
        model,
        repetitions: execution.repetitions,
        concurrency: execution.concurrency,
        // Measurement is the deliberate below-floor exception: a judgment-seat
        // agent must still be measurable on a weak model — that is how the
        // floor earns its evidence (Decision 091).
        allowBelowFloor: true,
        ...(request.workspaceId ? { workspaceId: request.workspaceId } : {}),
      });
      agentVersion = agentVersion ?? evidence.experiment.agentVersion;
      cells.push(buildCell(model, evidence));
    } catch (error: unknown) {
      cells.push({
        model,
        status: "error",
        passed: false,
        passRate: null,
        totalRuns: 0,
        passedRuns: 0,
        totalTokens: null,
        avgTokensPerRun: null,
        estimatedCostUsd: null,
        avgLatencyMs: null,
        evaluationArtifactId: null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return agentModelComparisonSchema.parse({
    modelComparisonId: randomUUID(),
    agentId: request.agentId,
    agentVersion,
    execution,
    models,
    cells,
    completedAt: new Date().toISOString(),
  });
}

/** Renders one modelComparison cell as a single badge line for the CLI. */
export function formatModelComparisonCell(cell: AgentModelComparisonCell): string {
  const model = cell.model.padEnd(24);

  if (cell.status === "error") {
    return `${model} error   ${cell.error ?? "unknown error"}`;
  }

  const gate = (cell.passed ? "pass" : "FAIL").padEnd(5);
  const passRate =
    cell.passRate === null
      ? "n/a"
      : `${Math.round(cell.passRate * 100)}%`;
  const tokens =
    cell.totalTokens === null ? "tokens=n/a" : `tokens=${cell.totalTokens}`;
  const avgTokens =
    cell.avgTokensPerRun === null
      ? ""
      : ` (avg ${Math.round(cell.avgTokensPerRun)}/run)`;
  const cost =
    cell.estimatedCostUsd === null
      ? "cost=n/a"
      : `cost=$${cell.estimatedCostUsd.toFixed(4)}`;
  const latency =
    cell.avgLatencyMs === null
      ? "latency=n/a"
      : `latency=${Math.round(cell.avgLatencyMs)}ms`;

  return `${model} ${gate} passRate=${passRate.padEnd(4)} runs=${cell.totalRuns} ${tokens}${avgTokens} ${cost} ${latency}`;
}
