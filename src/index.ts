import "dotenv/config";
import { SimpleHarness } from "./harness/simpleHarness.js";
import { OpenAIProvider } from "./providers/openaiProvider.js";
import { writeRun } from "./harness/runWriter.js";
import { loadRole } from "./harness/roleLoader.js";
import { loadTask } from "./harness/taskLoader.js";
import { parseArgs } from "./cli/parseArgs.js";
import { getFileId } from "./cli/getFileId.js";
import { loadContextItem } from "./harness/contextLoader.js";
import { getHarnessDefinition } from "./harnesses/harnessRegistry.js";
import { composeEvaluators } from "./evaluations/composeEvaluators.js";
import { findScenarioDefinition } from "./scenarios/scenarioRegistry.js";

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing from .env");
}

async function main(apiKey: string): Promise<void> {

    const { rolePath, taskPath, contextPaths, harnessId } = parseArgs(
        process.argv.slice(2),
    );
    const provider = new OpenAIProvider(apiKey);
    const harnessDefinition = getHarnessDefinition(harnessId);
    const role = await loadRole(getFileId(rolePath), rolePath);
    const task = await loadTask(getFileId(taskPath), taskPath);
    const scenarioDefinition = findScenarioDefinition(task.id);
    const evaluators = composeEvaluators(
        harnessDefinition,
        scenarioDefinition,
    );
    const harness = new SimpleHarness(
        provider,
        evaluators,
        harnessDefinition.id,
    );
    const context = await Promise.all(
        contextPaths.map((contextPath) =>
            loadContextItem(getFileId(contextPath), contextPath),
        ),
    );
    const result = await harness.run(role, task, context);
    const runFilePath = await writeRun(result);

    console.log(`Harness: ${result.harnessId}`);
    console.log(result.output);
    console.log(`Duration: ${result.durationMs.toFixed(0)} ms`);
    console.log(`Run saved: ${runFilePath}`);
    for (const evaluation of result.evaluations) {
        console.log(
            `Evaluation [${evaluation.evaluatorId}]: ${evaluation.passed ? "PASS" : "FAIL"
            } - ${evaluation.message}`,
        );
    }
    console.log(`Overall result: ${result.passed ? "PASS" : "FAIL"}`);
}

main(apiKey).catch((error: unknown) => {
    console.error("Application failed:", error);
    process.exit(1);
});