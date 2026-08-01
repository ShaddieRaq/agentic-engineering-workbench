import "dotenv/config";
import { getFileId } from "./cli/getFileId.js";
import { parseExperimentArgs } from "./cli/parseExperimentArgs.js";
import { createScenarioDatasetExecutor } from "./datasets/createScenarioDatasetExecutor.js";
import { getScenarioDatasetDefinition } from "./datasets/scenarioDatasetRegistry.js";
import { runScenarioDatasetExperiment } from "./experiments/scenarioDatasetExperimentRunner.js";
import { writeScenarioDatasetExperiment } from "./experiments/scenarioDatasetExperimentWriter.js";
import { loadRole } from "./harness/roleLoader.js";
import { getHarnessDefinition } from "./harnesses/harnessRegistry.js";
import { OpenAIProvider } from "./providers/openaiProvider.js";

async function main(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing from .env");
  }

  const definition = parseExperimentArgs(process.argv.slice(2));
  const dataset = getScenarioDatasetDefinition(definition.datasetId);
  const harnessDefinition = getHarnessDefinition(
    definition.harnessId,
  );
  const [baselineRole, candidateRole] = await Promise.all([
    loadRole(
      getFileId(definition.baseline.rolePath),
      definition.baseline.rolePath,
    ),
    loadRole(
      getFileId(definition.candidate.rolePath),
      definition.candidate.rolePath,
    ),
  ]);
  const baselineExecutor = createScenarioDatasetExecutor({
    provider: new OpenAIProvider(apiKey, {
      model: definition.baseline.model,
    }),
    role: baselineRole,
    harnessDefinition,
  });
  const candidateExecutor = createScenarioDatasetExecutor({
    provider: new OpenAIProvider(apiKey, {
      model: definition.candidate.model,
    }),
    role: candidateRole,
    harnessDefinition,
  });
  const result = await runScenarioDatasetExperiment(
    definition,
    dataset,
    baselineExecutor,
    candidateExecutor,
  );
  const runFilePath = await writeScenarioDatasetExperiment(result);

  console.log(`Experiment: ${definition.id}`);
  console.log(`Dataset: ${definition.datasetId}`);
  console.log(`Evidence saved: ${runFilePath}`);

  for (const comparison of result.reliabilityComparisons) {
    const delta =
      comparison.passRateDelta === null
        ? "n/a"
        : `${(comparison.passRateDelta * 100).toFixed(0)} points`;

    console.log(
      `Case [${comparison.datasetCaseId}]: ${comparison.classification} (${delta})`,
    );
  }

  for (const comparison of result.confidenceComparisons) {
    const formatInterval = (
      interval: typeof comparison.baseline,
    ): string =>
      interval
        ? `${(interval.lowerBound * 100).toFixed(0)}%-${(interval.upperBound * 100).toFixed(0)}%`
        : "n/a";

    console.log(
      `Confidence [${comparison.datasetCaseId}]: ${comparison.relationship} (baseline ${formatInterval(comparison.baseline)}, candidate ${formatInterval(comparison.candidate)})`,
    );
  }

  for (const comparison of result.latencyComparisons) {
    const delta =
      comparison.averageDurationDeltaMs === null
        ? "n/a"
        : `${comparison.averageDurationDeltaMs >= 0 ? "+" : ""}${comparison.averageDurationDeltaMs.toFixed(0)} ms average`;

    console.log(
      `Latency [${comparison.datasetCaseId}]: ${comparison.classification} (${delta})`,
    );
  }

  for (const comparison of result.tokenCostComparisons) {
    const tokenDelta =
      comparison.totalTokensDelta === null
        ? "n/a"
        : `${comparison.totalTokensDelta >= 0 ? "+" : ""}${comparison.totalTokensDelta} tokens`;
    const costDelta =
      comparison.estimatedCostDeltaUsd === null
        ? "n/a"
        : `${comparison.estimatedCostDeltaUsd >= 0 ? "+" : "-"}$${Math.abs(comparison.estimatedCostDeltaUsd).toFixed(6)} estimated`;

    console.log(
      `Usage [${comparison.datasetCaseId}]: ${comparison.tokenClassification} (${tokenDelta}), ${comparison.costClassification} (${costDelta})`,
    );
  }
}

main().catch((error: unknown) => {
  console.error("Experiment failed:", error);
  process.exit(1);
});
