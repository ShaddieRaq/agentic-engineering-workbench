import "dotenv/config";
import { SimpleHarness } from "./harness/simpleHarness.js";
import { OpenAIProvider } from "./providers/openaiProvider.js";
import { writeRun } from "./harness/runWriter.js";
import { loadRole } from "./harness/roleLoader.js";

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  throw new Error("OPENAI_API_KEY is missing from .env");
}

const role = await loadRole(
    "technical-coach",
    "roles/technical-coach.md",
  );

async function main(apiKey: string): Promise<void> {
  const provider = new OpenAIProvider(apiKey);
  const harness = new SimpleHarness(provider);

  const result = await harness.run(role, {
    id: "connection-check",
    instruction:
      "Reply with exactly: The harness is using the OpenAI provider.",
  });
  const runFilePath = await writeRun(result);

  console.log(result.output);
  console.log(`Duration: ${result.durationMs.toFixed(0)} ms`);
  console.log(`Run saved: ${runFilePath}`);
}

main(apiKey).catch((error: unknown) => {
  console.error("Application failed:", error);
  process.exit(1);
});