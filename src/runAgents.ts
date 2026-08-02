import "dotenv/config";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { assertAgentCatalogValid } from "./agents/agentCatalogValidator.js";
import { platformAgentRegistry } from "./agents/platformAgentRegistry.js";
import { runAgent } from "./agents/agentRunner.js";
import { writeAgentRun } from "./agents/agentRunWriter.js";
import { parseAgentArgs } from "./cli/parseAgentArgs.js";
import { OpenAIProvider } from "./providers/openaiProvider.js";
import { createPlatformToolRegistry } from "./tools/toolRegistry.js";

async function readInput(path: string | null): Promise<unknown> {
  if (path === null) return {};
  return JSON.parse(await readFile(resolve(process.cwd(), path), "utf8"));
}

async function main(): Promise<void> {
  const args = parseAgentArgs(process.argv.slice(2));
  const tools = createPlatformToolRegistry(process.cwd());

  if (args.command === "list") {
    for (const manifest of platformAgentRegistry.list()) {
      console.log(
        `${manifest.id}\t${manifest.version}\t${manifest.status}\t${manifest.description}`,
      );
    }
    return;
  }

  if (args.command === "describe") {
    console.log(
      JSON.stringify(platformAgentRegistry.get(args.agentId).manifest, null, 2),
    );
    return;
  }

  if (args.command === "validate") {
    assertAgentCatalogValid(platformAgentRegistry, tools);
    console.log(
      `Agent catalog valid: ${platformAgentRegistry.list().length} agent(s).`,
    );
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing from .env");
  }

  const registration = platformAgentRegistry.get(args.agentId);
  const model = args.model ?? registration.manifest.defaultModel;
  const result = await runAgent(args.agentId, await readInput(args.inputPath), {
    agents: platformAgentRegistry,
    tools,
    provider: new OpenAIProvider(apiKey, { model }),
    workspaceRoot: process.cwd(),
    model,
  });
  const evidencePath = await writeAgentRun(result);

  console.log(`Agent: ${result.agentId}@${result.agentVersion}`);
  console.log(`Status: ${result.succeeded ? "succeeded" : "failed"}`);
  console.log(`Evidence saved: ${evidencePath}`);

  if (result.output && typeof result.output === "object") {
    const overview = (result.output as Record<string, unknown>).overview;
    if (typeof overview === "string") console.log(`Overview: ${overview}`);
  }

  if (result.failure) {
    console.log(`Failure [${result.failure.stage}]: ${result.failure.message}`);
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error("Agent command failed:", error);
  process.exit(1);
});
