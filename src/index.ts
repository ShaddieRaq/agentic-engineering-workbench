import "dotenv/config";
import { SimpleHarness } from "./harness/simpleHarness.js";
import { OpenAIProvider } from "./providers/openaiProvider.js";
import { writeRun } from "./harness/runWriter.js";
import { loadRole } from "./harness/roleLoader.js";
import { loadTask } from "./harness/taskLoader.js";
import { parseArgs } from "./cli/parseArgs.js";

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing from .env");
}

async function main(apiKey: string): Promise<void> {

    const { rolePath, taskPath } = parseArgs(process.argv.slice(2));
    const provider = new OpenAIProvider(apiKey);
    const harness = new SimpleHarness(provider);

    const role = await loadRole("technical-coach", rolePath);
    const task = await loadTask("connection-check", taskPath);

    const result = await harness.run(role, task);
    const runFilePath = await writeRun(result);

    console.log(result.output);
    console.log(`Duration: ${result.durationMs.toFixed(0)} ms`);
    console.log(`Run saved: ${runFilePath}`);
}

main(apiKey).catch((error: unknown) => {
    console.error("Application failed:", error);
    process.exit(1);
});