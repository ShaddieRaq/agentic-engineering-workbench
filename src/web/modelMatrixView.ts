import {
  listModelMatrixIds,
  loadModelMatrix,
  loadModelMatrixTriage,
} from "../agents/modelMatrix/modelMatrixArtifacts.js";
import type { AgentModelMatrix } from "../agents/modelMatrix/agentModelMatrix.js";
import type {
  ModelMatrixTriage,
  TriagedCase,
} from "../agents/modelMatrix/agentModelMatrixTriage.js";

// One model's column in the matrix, shaped for the console. Verdict is the
// three-state form the table renders as a badge; the three "best" flags mark
// the winning cell per dimension so the operator reads the trade-off at a
// glance (most reliable model may not be the cheapest or fastest).
export interface ModelMatrixCellView {
  model: string;
  status: "ok" | "error";
  verdict: "pass" | "fail" | "error";
  passRate: number | null;
  passedRuns: number;
  totalRuns: number;
  totalTokens: number | null;
  avgTokensPerRun: number | null;
  estimatedCostUsd: number | null;
  avgLatencyMs: number | null;
  evaluationArtifactId: string | null;
  error: string | null;
  bestReliability: boolean;
  lowestCost: boolean;
  lowestLatency: boolean;
}

export interface ModelMatrixTriageCaseView {
  datasetId: string;
  caseId: string;
  classification: "ambiguity" | "capability-dependent";
  failedModels: string[];
  passedModels: string[];
  worstFailurePassRate: number | null;
  marginal: boolean;
}

export interface ModelMatrixTriageView {
  meaningful: boolean;
  ambiguity: ModelMatrixTriageCaseView[];
  capabilityDependent: ModelMatrixTriageCaseView[];
}

// Summary before detail: the counts and spread that let the operator judge the
// run before reading a single cell. ambiguityCount = prompt/gate gaps the
// improvement loop can fix; capabilityDependentCount = model-selection signals.
export interface ModelMatrixSummaryView {
  modelCount: number;
  modelsPassing: number;
  modelsFailing: number;
  modelsErrored: number;
  passRateSpread: number | null;
  ambiguityCount: number;
  capabilityDependentCount: number;
}

export interface ModelMatrixView {
  matrixId: string;
  agentId: string;
  agentVersion: string | null;
  models: string[];
  execution: { repetitions: number; concurrency: number };
  completedAt: string;
  summary: ModelMatrixSummaryView;
  cells: ModelMatrixCellView[];
  triage: ModelMatrixTriageView | null;
}

export interface ModelMatrixIndexEntry {
  matrixId: string;
  agentId: string;
  agentVersion: string | null;
  models: string[];
  completedAt: string;
  modelCount: number;
  modelsPassing: number;
  hasTriage: boolean;
}

export interface ModelMatrixIndex {
  matrices: ModelMatrixIndexEntry[];
}

function definedNumbers(values: Array<number | null>): number[] {
  return values.filter((value): value is number => value !== null);
}

function cellViews(matrix: AgentModelMatrix): ModelMatrixCellView[] {
  const okCells = matrix.cells.filter((cell) => cell.status === "ok");
  // "Best" is only meaningful as a comparison — with a single measured model
  // there is nothing to be best against, so suppress the flags.
  const rank = okCells.length >= 2;
  const bestPassRate = rank
    ? Math.max(...definedNumbers(okCells.map((cell) => cell.passRate)), Number.NEGATIVE_INFINITY)
    : Number.NEGATIVE_INFINITY;
  const costs = rank ? definedNumbers(okCells.map((cell) => cell.estimatedCostUsd)) : [];
  const latencies = rank ? definedNumbers(okCells.map((cell) => cell.avgLatencyMs)) : [];
  const lowestCost = costs.length > 0 ? Math.min(...costs) : null;
  const lowestLatency = latencies.length > 0 ? Math.min(...latencies) : null;

  return matrix.cells.map((cell) => {
    const ok = cell.status === "ok";
    return {
      model: cell.model,
      status: cell.status,
      verdict: cell.status === "error" ? "error" : cell.passed ? "pass" : "fail",
      passRate: cell.passRate,
      passedRuns: cell.passedRuns,
      totalRuns: cell.totalRuns,
      totalTokens: cell.totalTokens,
      avgTokensPerRun: cell.avgTokensPerRun,
      estimatedCostUsd: cell.estimatedCostUsd,
      avgLatencyMs: cell.avgLatencyMs,
      evaluationArtifactId: cell.evaluationArtifactId,
      error: cell.error,
      bestReliability:
        ok && rank && cell.passRate !== null && cell.passRate === bestPassRate,
      lowestCost:
        ok && lowestCost !== null && cell.estimatedCostUsd === lowestCost,
      lowestLatency:
        ok && lowestLatency !== null && cell.avgLatencyMs === lowestLatency,
    };
  });
}

function triageCaseView(triaged: TriagedCase): ModelMatrixTriageCaseView {
  return {
    datasetId: triaged.datasetId,
    caseId: triaged.caseId,
    classification: triaged.classification,
    failedModels: triaged.failedModels,
    passedModels: triaged.passedModels,
    worstFailurePassRate: triaged.worstFailurePassRate,
    marginal: triaged.marginal,
  };
}

function triageView(triage: ModelMatrixTriage | null): ModelMatrixTriageView | null {
  if (!triage) return null;
  return {
    meaningful: triage.meaningful,
    ambiguity: triage.ambiguity.map(triageCaseView),
    capabilityDependent: triage.capabilityDependent.map(triageCaseView),
  };
}

function summaryView(
  cells: ModelMatrixCellView[],
  triage: ModelMatrixTriageView | null,
): ModelMatrixSummaryView {
  const passRates = definedNumbers(
    cells.filter((cell) => cell.status === "ok").map((cell) => cell.passRate),
  );
  return {
    modelCount: cells.length,
    modelsPassing: cells.filter((cell) => cell.verdict === "pass").length,
    modelsFailing: cells.filter((cell) => cell.verdict === "fail").length,
    modelsErrored: cells.filter((cell) => cell.verdict === "error").length,
    passRateSpread:
      passRates.length >= 2 ? Math.max(...passRates) - Math.min(...passRates) : null,
    ambiguityCount: triage ? triage.ambiguity.length : 0,
    capabilityDependentCount: triage ? triage.capabilityDependent.length : 0,
  };
}

/** The detail view-model for one matrix, or null when the id is unknown. */
export async function buildModelMatrixView(
  runsDirectory: string,
  matrixId: string,
): Promise<ModelMatrixView | null> {
  let matrix: AgentModelMatrix;
  try {
    matrix = await loadModelMatrix(runsDirectory, matrixId);
  } catch {
    return null;
  }
  const cells = cellViews(matrix);
  const triage = triageView(await loadModelMatrixTriage(runsDirectory, matrixId));
  return {
    matrixId: matrix.matrixId,
    agentId: matrix.agentId,
    agentVersion: matrix.agentVersion,
    models: matrix.models,
    execution: matrix.execution,
    completedAt: matrix.completedAt,
    summary: summaryView(cells, triage),
    cells,
    triage,
  };
}

/** The index of every matrix run, newest first. */
export async function buildModelMatrixIndex(
  runsDirectory: string,
): Promise<ModelMatrixIndex> {
  const ids = await listModelMatrixIds(runsDirectory);
  const matrices: ModelMatrixIndexEntry[] = [];
  for (const id of ids) {
    const view = await buildModelMatrixView(runsDirectory, id);
    if (!view) continue;
    matrices.push({
      matrixId: view.matrixId,
      agentId: view.agentId,
      agentVersion: view.agentVersion,
      models: view.models,
      completedAt: view.completedAt,
      modelCount: view.summary.modelCount,
      modelsPassing: view.summary.modelsPassing,
      hasTriage: view.triage !== null,
    });
  }
  return { matrices };
}
