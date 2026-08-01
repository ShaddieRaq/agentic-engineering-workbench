import "dotenv/config";
import { parseDatasetArgs } from "./cli/parseDatasetArgs.js";
import { getFileId } from "./cli/getFileId.js";
import { createScenarioDatasetExecutor } from "./datasets/createScenarioDatasetExecutor.js";
import { getScenarioDatasetDefinition } from "./datasets/scenarioDatasetRegistry.js";
import { writeScenarioDatasetRun } from "./datasets/scenarioDatasetRunWriter.js";
import { runScenarioDataset } from "./datasets/scenarioDatasetRunner.js";
import { getHarnessDefinition } from "./harnesses/harnessRegistry.js";
import { loadRole } from "./harness/roleLoader.js";
import { OpenAIProvider } from "./providers/openaiProvider.js";

async function main(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing from .env");
  }

  const args = parseDatasetArgs(process.argv.slice(2));
  const dataset = getScenarioDatasetDefinition(args.datasetId);
  const role = await loadRole(
    getFileId(args.rolePath),
    args.rolePath,
  );
  const harnessDefinition = getHarnessDefinition(args.harnessId);
  const executeDatasetCase = createScenarioDatasetExecutor({
    provider: new OpenAIProvider(apiKey),
    role,
    harnessDefinition,
  });
  const result = await runScenarioDataset(
    dataset,
    executeDatasetCase,
    {
      repetitions: args.repetitions,
      concurrency: args.concurrency,
    },
  );

  const runFilePath = await writeScenarioDatasetRun(result);

  console.log(`Dataset: ${result.datasetId}`);
  console.log(`Runs: ${result.runs.length}`);
  console.log(`Evidence saved: ${runFilePath}`);

  for (const summary of result.caseSummaries) {
    const passRate =
      summary.passRate === null
        ? "no evidence"
        : `${(summary.passRate * 100).toFixed(0)}%`;

    console.log(
      `Case [${summary.datasetCaseId}]: ${summary.passedRuns}/${summary.totalRuns} passed (${passRate})`,
    );
  }
}

main().catch((error: unknown) => {
  console.error("Dataset run failed:", error);
  process.exit(1);
});
