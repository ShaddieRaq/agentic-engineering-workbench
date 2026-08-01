import "dotenv/config";
import { parseRepositoryAnalysisArgs } from "./cli/parseRepositoryAnalysisArgs.js";
import { OpenAIProvider } from "./providers/openaiProvider.js";
import { runRepositoryAnalysis } from "./workflows/repositoryAnalysisRunner.js";
import { writeRepositoryAnalysis } from "./workflows/repositoryAnalysisWriter.js";
import {
  createRepositoryInspectionTools,
  runRepositoryInspectionWorkflow,
} from "./workflows/repositoryInspectionWorkflow.js";

async function main(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing from .env");
  }

  const args = parseRepositoryAnalysisArgs(process.argv.slice(2));
  const inspection = await runRepositoryInspectionWorkflow(
    createRepositoryInspectionTools({ allowedRoot: process.cwd() }),
  );
  const provider = new OpenAIProvider(apiKey, { model: args.model });
  const result = await runRepositoryAnalysis(
    inspection,
    provider,
    args.instruction,
  );
  const evidencePath = await writeRepositoryAnalysis(result);

  console.log(`Analysis: ${result.succeeded ? "succeeded" : "failed"}`);
  console.log(`Model: ${result.provider?.model ?? args.model}`);
  console.log(
    `Context: ${inspection.contextAssembly.items.length} files, ${inspection.contextAssembly.totalBytes}/${inspection.contextAssembly.maximumBytes} bytes`,
  );
  console.log(`Evidence saved: ${evidencePath}`);

  if (result.parsedOutput) {
    console.log(`Overview: ${result.parsedOutput.overview}`);
    console.log(
      `Findings: ${result.parsedOutput.architectureComponents.length} components, ${result.parsedOutput.entryPoints.length} entry points, ${result.parsedOutput.risks.length} risks, ${result.parsedOutput.recommendedTests.length} test recommendations`,
    );
  }

  if (result.refusal) {
    console.log(`Refusal: ${result.refusal}`);
  }

  if (result.executionFailure) {
    console.log(
      `Failure [${result.executionFailure.category}]: ${result.executionFailure.message}`,
    );
  }

  for (const evaluation of result.evaluations) {
    if (!evaluation.passed) {
      console.log(
        `Evaluation [${evaluation.evaluatorId}]: ${evaluation.message}`,
      );
    }
  }

  if (!result.succeeded) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error("Repository analysis failed:", error);
  process.exit(1);
});
