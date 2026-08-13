import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { agentEvaluationExperimentSchema } from "../evaluations/agentEvaluationExperiment.js";
import { agentDatasetRunResultSchema } from "../datasets/agentDatasetRunner.js";
import {
  agentModelComparisonSchema,
  type AgentModelComparison,
} from "./agentModelComparison.js";
import {
  modelComparisonTriageSchema,
  type ModelCaseFailures,
  type ModelComparisonTriage,
} from "./agentModelComparisonTriage.js";

// The uuid-named modelComparison artifact, capturing the id. Mirrors the guard in
// resolveModelComparisonFile: the derived triage/report files carry a "triage"/
// "report" word before the uuid, whose letters fall outside [0-9a-f-].
const MODEL_COMPARISON_FILE_PATTERN = /^model-comparison-([0-9a-f-]{36})\.json$/;

/** Resolves the newest model-comparison artifact, or the one for a given id. */
export async function resolveModelComparisonFile(
  runsDirectory: string,
  id: string | null,
): Promise<string> {
  // Match only the uuid-named modelComparison artifacts — NOT the derived
  // model-comparison-triage-*.json / model-comparison-report-*.md files, whose
  // "triage"/"report" prefix contains non-hex letters and so is excluded.
  const files = (await readdir(runsDirectory)).filter((path) =>
    /^model-comparison-[0-9a-f-]{36}\.json$/.test(path),
  );

  if (files.length === 0) {
    throw new Error(
      "No model-comparison artifacts found in runs/. Run `npm run modelComparison` first.",
    );
  }

  if (id !== null) {
    const match = files.find((path) => path === `model-comparison-${id}.json`);
    if (!match) throw new Error(`No model-comparison artifact for id ${id}.`);
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

/** Loads and validates a model-comparison artifact (newest, or by id). */
export async function loadModelComparison(
  runsDirectory: string,
  id: string | null,
): Promise<AgentModelComparison> {
  const file = await resolveModelComparisonFile(runsDirectory, id);
  const raw = JSON.parse(await readFile(file, "utf8")) as unknown;
  return agentModelComparisonSchema.parse(raw);
}

/**
 * Ids of every modelComparison artifact in the runs directory, newest first. Returns []
 * (rather than throwing) when the directory is absent or holds no modelComparisons —
 * the index view treats "none yet" as an empty list, not an error.
 */
export async function listModelComparisonIds(runsDirectory: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(runsDirectory);
  } catch {
    return [];
  }
  const modelComparisons = entries
    .map((path) => MODEL_COMPARISON_FILE_PATTERN.exec(path))
    .filter((match): match is RegExpExecArray => match !== null);
  const withTimes = await Promise.all(
    modelComparisons.map(async (match) => ({
      id: match[1]!,
      mtimeMs: (await stat(join(runsDirectory, match[0]))).mtimeMs,
    })),
  );
  withTimes.sort((left, right) => right.mtimeMs - left.mtimeMs);
  return withTimes.map((entry) => entry.id);
}

/**
 * The failure-triage sibling for a modelComparison, or null when none was written.
 * Triage is optional enrichment (produced by `npm run modelComparison:triage`); a
 * missing or unreadable sibling leaves the modelComparison view to stand on its cells.
 */
export async function loadModelComparisonTriage(
  runsDirectory: string,
  id: string,
): Promise<ModelComparisonTriage | null> {
  let raw: unknown;
  try {
    raw = JSON.parse(
      await readFile(join(runsDirectory, `model-comparison-triage-${id}.json`), "utf8"),
    );
  } catch {
    return null;
  }
  return modelComparisonTriageSchema.parse(raw);
}

/**
 * Reads the per-model failed cases for a modelComparison's ok cells from their linked
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
  modelComparison: AgentModelComparison,
): Promise<ModelCaseFailures[]> {
  const results: ModelCaseFailures[] = [];

  for (const cell of modelComparison.cells) {
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
