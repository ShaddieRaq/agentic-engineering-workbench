import "dotenv/config";
import { runAgent } from "./agents/agentRunner.js";
import { platformAgentRegistry } from "./agents/platformAgentRegistry.js";
import { createHandshakeProvider } from "./providers/handshakeProvider.js";
import { OpenAIProvider } from "./providers/openaiProvider.js";
import { createPlatformToolRegistry } from "./tools/toolRegistry.js";

/**
 * Run one registered agent once against a JSON input on the measured model and
 * print the full run result. A terminal path for smoke-testing an agent without
 * the MCP/web channel. It does not persist a run-evidence artifact — use the MCP
 * run_agent or the web route when the evidence trail must be recorded.
 *
 *   tsx src/runAgentOnce.ts <agentId> '<inputJson>'
 *
 * risk-linter handshake (its dependency guard admits ONE model request per run):
 *   RISK_LINTER_REQUEST_ID         the admitted request id, echoed back verbatim
 *   RISK_LINTER_MAX_MODEL_REQUESTS cap on model requests in this run (default 1 when a
 *                                  request id is present; uncapped otherwise)
 *   RISK_LINTER_MODEL              the model the admission was priced for; used as-is so
 *                                  the reservation and the request agree
 * SDK automatic retries are always OFF here: the admitting side is the retry authority.
 * The printed envelope carries `handshake` (id, request count, retries, provider error).
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
const requestId = process.env.RISK_LINTER_REQUEST_ID ?? null;
const capEnv = process.env.RISK_LINTER_MAX_MODEL_REQUESTS;
const maxModelRequests =
  capEnv !== undefined && capEnv !== ""
    ? Number(capEnv)
    : requestId !== null
      ? 1
      : null;
if (maxModelRequests !== null && !(Number.isInteger(maxModelRequests) && maxModelRequests >= 0)) {
  throw new Error(`RISK_LINTER_MAX_MODEL_REQUESTS must be a non-negative integer, got ${capEnv}`);
}
const model = process.env.RISK_LINTER_MODEL ?? registration.manifest.defaultModel;
const MAX_RETRIES = 0;

const handshake = createHandshakeProvider(
  new OpenAIProvider(apiKey, { model, maxRetries: MAX_RETRIES }),
  { requestId, maxModelRequests, maxRetries: MAX_RETRIES },
);
const result = await runAgent(agentId, input, {
  agents: platformAgentRegistry,
  tools: createPlatformToolRegistry(process.cwd()),
  provider: handshake.provider,
  workspaceRoot: process.cwd(),
  model,
});

console.log(JSON.stringify({ ...result, handshake: handshake.state }, null, 2));
