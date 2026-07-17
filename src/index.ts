import "dotenv/config";
import { SimpleHarness } from "./harness/simpleHarness.js";
import { OpenAIProvider } from "./providers/openaiProvider.js";

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  throw new Error("OPENAI_API_KEY is missing from .env");
}

async function main(apiKey: string): Promise<void> {
  const provider = new OpenAIProvider(apiKey);
  const harness = new SimpleHarness(provider);

  const result = await harness.run(
    "Reply with exactly: The harness is using the OpenAI provider.",
  );

  console.log(result.output);
}

main(apiKey).catch((error: unknown) => {
  console.error("Application failed:", error);
  process.exit(1);
});