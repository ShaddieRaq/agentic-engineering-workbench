import "dotenv/config";
import { runAgent } from "./agents/agentRunner.js";
import { platformAgentRegistry } from "./agents/platformAgentRegistry.js";
import { OpenAIProvider } from "./providers/openaiProvider.js";
import { createPlatformToolRegistry } from "./tools/toolRegistry.js";

/**
 * Run one registered agent once against a JSON input on the measured model and
 * print the full run result. A terminal path for smoke-testing an agent without
 * the MCP/web channel. It does not persist a run-evidence artifact — use the MCP
 * run_agent or the web route when the evidence trail must be recorded.
 *
 *   tsx src/runAgentOnce.ts <agentId> '<inputJson>'
 */
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error("OPENAI_API_KEY is missing from .env");
}

const agentId = process.argv[2];
const inputJson = process.argv[3];
if (!agentId || !inputJson) {
  throw new Error("usage: tsx src/runAgentOnce.ts <agentId> '<inputJson>'");
}

let input: unknown;
try {
  input = JSON.parse(inputJson);
} catch (error: unknown) {
  throw new Error(
    `input must be JSON: ${error instanceof Error ? error.message : String(error)}`,
  );
}

const registration = platformAgentRegistry.get(agentId);
const result = await runAgent(agentId, input, {
  agents: platformAgentRegistry,
  tools: createPlatformToolRegistry(process.cwd()),
  provider: new OpenAIProvider(apiKey, {
    model: registration.manifest.defaultModel,
  }),
  workspaceRoot: process.cwd(),
});

console.log(JSON.stringify(result, null, 2));
