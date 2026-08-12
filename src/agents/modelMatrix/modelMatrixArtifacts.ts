import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { agentEvaluationExperimentSchema } from "../evaluations/agentEvaluationExperiment.js";
import { agentDatasetRunResultSchema } from "../datasets/agentDatasetRunner.js";
import {
  agentModelMatrixSchema,
  type AgentModelMatrix,
} from "./agentModelMatrix.js";
import {
  modelMatrixTriageSchema,
  type ModelCaseFailures,
  type ModelMatrixTriage,
} from "./agentModelMatrixTriage.js";

// The uuid-named matrix artifact, capturing the id. Mirrors the guard in
// resolveModelMatrixFile: the derived triage/report files carry a "triage"/
// "report" word before the uuid, whose letters fall outside [0-9a-f-].
const MATRIX_FILE_PATTERN = /^model-matrix-([0-9a-f-]{36})\.json$/;

/** Resolves the newest model-matrix artifact, or the one for a given id. */
export async function resolveModelMatrixFile(
  runsDirectory: string,
  id: string | null,
): Promise<string> {
  // Match only the uuid-named matrix artifacts — NOT the derived
  // model-matrix-triage-*.json / model-matrix-report-*.md files, whose
  // "triage"/"report" prefix contains non-hex letters and so is excluded.
  const files = (await readdir(runsDirectory)).filter((path) =>
    /^model-matrix-[0-9a-f-]{36}\.json$/.test(path),
  );

  if (files.length === 0) {
    throw new Error(
      "No model-matrix artifacts found in runs/. Run `npm run matrix` first.",
    );
  }

  if (id !== null) {
    const match = files.find((path) => path === `model-matrix-${id}.json`);
    if (!match) throw new Error(`No model-matrix artifact for id ${id}.`);
    return join(runsDirectory, match);
  }

  const withTimes = await Promise.all(
    files.map(async (path) => ({
      path,
      mtimeMs: (await stat(join(runsDirectory, path))).mtimeMs,
    })),
  );
  withTimes.sort((left, right) => right.mtimeMs - left.mtimeMs);
  return join(runsDirectory, withTimes[0]!.path);
}

/** Loads and validates a model-matrix artifact (newest, or by id). */
export async function loadModelMatrix(
  runsDirectory: string,
  id: string | null,
): Promise<AgentModelMatrix> {
  const file = await resolveModelMatrixFile(runsDirectory, id);
  const raw = JSON.parse(await readFile(file, "utf8")) as unknown;
  return agentModelMatrixSchema.parse(raw);
}

/**
 * Ids of every matrix artifact in the runs directory, newest first. Returns []
 * (rather than throwing) when the directory is absent or holds no matrices —
 * the index view treats "none yet" as an empty list, not an error.
 */
export async function listModelMatrixIds(runsDirectory: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(runsDirectory);
  } catch {
    return [];
  }
  const matrices = entries
    .map((path) => MATRIX_FILE_PATTERN.exec(path))
    .filter((match): match is RegExpExecArray => match !== null);
  const withTimes = await Promise.all(
    matrices.map(async (match) => ({
      id: match[1]!,
      mtimeMs: (await stat(join(runsDirectory, match[0]))).mtimeMs,
    })),
  );
  withTimes.sort((left, right) => right.mtimeMs - left.mtimeMs);
  return withTimes.map((entry) => entry.id);
}

/**
 * The failure-triage sibling for a matrix, or null when none was written.
 * Triage is optional enrichment (produced by `npm run matrix:triage`); a
 * missing or unreadable sibling leaves the matrix view to stand on its cells.
 */
export async function loadModelMatrixTriage(
  runsDirectory: string,
  id: string,
): Promise<ModelMatrixTriage | null> {
  let raw: unknown;
  try {
    raw = JSON.parse(
      await readFile(join(runsDirectory, `model-matrix-triage-${id}.json`), "utf8"),
    );
  } catch {
    return null;
  }
  return modelMatrixTriageSchema.parse(raw);
}

/**
 * Reads the per-model failed cases for a matrix's ok cells from their linked
 * evaluation artifacts. Error cells are skipped (they never produced an
 * evaluation). Throws if a referenced evaluation artifact is missing, so a
 * model is never silently treated as having zero failures.
 */
async function readArtifactJson(
  runsDirectory: string,
  fileName: string,
  label: string,
): Promise<unknown> {
  try {
    return JSON.parse(await readFile(join(runsDirectory, fileName), "utf8"));
  } catch {
    throw new Error(`${label} is missing or unreadable.`);
  }
}

export async function loadEvaluationFailures(
  runsDirectory: string,
  matrix: AgentModelMatrix,
): Promise<ModelCaseFailures[]> {
  const results: ModelCaseFailures[] = [];

  for (const cell of matrix.cells) {
    if (cell.status !== "ok" || cell.evaluationArtifactId === null) continue;

    const evaluation = agentEvaluationExperimentSchema.parse(
      await readArtifactJson(
        runsDirectory,
        `agent-evaluation-${cell.evaluationArtifactId}.json`,
        `Evaluation artifact ${cell.evaluationArtifactId} for model ${cell.model}`,
      ),
    );

    const failedCases: ModelCaseFailures["failedCases"] = [];
    for (const dataset of evaluation.datasets) {
      // Per-case pass-rates live on the dataset run, not the evaluation summary.
      const datasetRun = agentDatasetRunResultSchema.parse(
        await readArtifactJson(
          runsDirectory,
          `agent-dataset-run-${dataset.datasetRunArtifactId}.json`,
          `Dataset-run artifact ${dataset.datasetRunArtifactId} for model ${cell.model}`,
        ),
      );
      const passRateByCase = new Map(
        datasetRun.caseSummaries.map((summary) => [
          summary.datasetCaseId,
          summary.passRate,
        ]),
      );
      for (const caseId of dataset.verification.failedCaseIds) {
        failedCases.push({
          datasetId: dataset.datasetId,
          caseId,
          passRate: passRateByCase.get(caseId) ?? null,
        });
      }
    }

    results.push({ model: cell.model, failedCases });
  }

  return results;
}
