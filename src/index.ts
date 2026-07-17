import "dotenv/config";
import OpenAI from "openai";

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  throw new Error("OPENAI_API_KEY is missing from .env");
}

const client = new OpenAI({ apiKey });

async function main(): Promise<void> {
  const response = await client.responses.create({
    model: "gpt-5.4",
    input:
      "Reply with exactly: Agentic Engineering Workbench is connected.",
  });

  console.log(response.output_text);
}

main().catch((error: unknown) => {
  console.error("API request failed:", error);
  process.exit(1);
});