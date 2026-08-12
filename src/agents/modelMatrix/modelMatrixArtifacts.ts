import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { agentEvaluationExperimentSchema } from "../evaluations/agentEvaluationExperiment.js";
import {
  agentModelMatrixSchema,
  type AgentModelMatrix,
} from "./agentModelMatrix.js";
import type { ModelCaseFailures } from "./agentModelMatrixTriage.js";

/** Resolves the newest model-matrix artifact, or the one for a given id. */
export async function resolveModelMatrixFile(
  runsDirectory: string,
  id: string | null,
): Promise<string> {
  const files = (await readdir(runsDirectory)).filter((path) =>
    /^model-matrix-.+\.json$/.test(path),
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
 * Reads the per-model failed cases for a matrix's ok cells from their linked
 * evaluation artifacts. Error cells are skipped (they never produced an
 * evaluation). Throws if a referenced evaluation artifact is missing, so a
 * model is never silently treated as having zero failures.
 */
export async function loadEvaluationFailures(
  runsDirectory: string,
  matrix: AgentModelMatrix,
): Promise<ModelCaseFailures[]> {
  const results: ModelCaseFailures[] = [];

  for (const cell of matrix.cells) {
    if (cell.status !== "ok" || cell.evaluationArtifactId === null) continue;

    const file = join(
      runsDirectory,
      `agent-evaluation-${cell.evaluationArtifactId}.json`,
    );
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(file, "utf8"));
    } catch {
      throw new Error(
        `Evaluation artifact ${cell.evaluationArtifactId} for model ${cell.model} is missing or unreadable.`,
      );
    }
    const evaluation = agentEvaluationExperimentSchema.parse(raw);

    const failedCases = evaluation.datasets.flatMap((dataset) =>
      dataset.verification.failedCaseIds.map((caseId) => ({
        datasetId: dataset.datasetId,
        caseId,
      })),
    );
    results.push({ model: cell.model, failedCases });
  }

  return results;
}
