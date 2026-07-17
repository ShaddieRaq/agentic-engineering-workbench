import "dotenv/config";
import { OpenAIProvider } from "./providers/openaiProvider.js";

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  throw new Error("OPENAI_API_KEY is missing from .env");
}

async function main(apiKey: string): Promise<void> {
  const provider = new OpenAIProvider(apiKey);

  const output = await provider.generateText(
    "Reply with exactly: Provider abstraction works.",
  );

  console.log(output);
}

main(apiKey).catch((error: unknown) => {
  console.error("Application failed:", error);
  process.exit(1);
});