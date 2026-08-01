import "dotenv/config";
import { parseRepositoryAnalysisArgs } from "./cli/parseRepositoryAnalysisArgs.js";
import { OpenAIProvider } from "./providers/openaiProvider.js";
import { runRepositoryAnalysis } from "./workflows/repositoryAnalysisRunner.js";
import {
  runRepositoryAssistantWorkflow,
} from "./workflows/repositoryAssistantWorkflow.js";
import { writeRepositoryAssistantRun } from "./workflows/repositoryAssistantWriter.js";
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
  const tools = createRepositoryInspectionTools({
    allowedRoot: process.cwd(),
  });
  const provider = new OpenAIProvider(apiKey, { model: args.model });
  const result = await runRepositoryAssistantWorkflow(
    () => runRepositoryInspectionWorkflow(tools),
    (inspection) => runRepositoryAnalysis(
      inspection,
      provider,
      args.instruction,
    ),
  );
  const evidencePath = await writeRepositoryAssistantRun(result);

  console.log(`Assistant workflow: ${result.succeeded ? "succeeded" : "failed"}`);
  console.log(`Status: ${result.status}`);
  console.log(`Steps: ${result.steps.length}/3`);
  console.log(`Evidence saved: ${evidencePath}`);

  for (const step of result.steps) {
    console.log(
      `Step [${step.stepId}]: ${step.succeeded ? "succeeded" : "failed"}`,
    );
  }

  const overview = result.state.analysis?.parsedOutput?.overview;

  if (overview) {
    console.log(`Overview: ${overview}`);
  }

  if (!result.succeeded) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error("Repository assistant failed:", error);
  process.exit(1);
});
