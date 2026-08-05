import "dotenv/config";
import { resolve } from "node:path";
import { AgentApplicationService } from "./agents/agentApplicationService.js";
import { platformAgentRegistry } from "./agents/platformAgentRegistry.js";
import { FileArtifactStore } from "./artifacts/fileArtifactStore.js";
import { FoundryArtifactStore } from "./foundry/foundryArtifactStore.js";
import { OpenAIProvider } from "./providers/openaiProvider.js";
import { createPlatformToolRegistry } from "./tools/toolRegistry.js";
import { buildAgentWebServer } from "./web/agentWebServer.js";
import { FileWorkspaceStore } from "./workspaces/fileWorkspaceStore.js";

async function main(): Promise<void> {
  const workspaceRoot = process.cwd();
  const apiKey = process.env.OPENAI_API_KEY;
  const workspaces = new FileWorkspaceStore(
    resolve(workspaceRoot, ".workbench", "workspaces.json"),
    workspaceRoot,
  );
  const service = new AgentApplicationService(
    platformAgentRegistry,
    new FileArtifactStore(resolve(workspaceRoot, "runs")),
    workspaces,
    createPlatformToolRegistry,
    (model) => {
      if (!apiKey) throw new Error("OPENAI_API_KEY is missing from .env");
      return new OpenAIProvider(apiKey, { model });
    },
  );
  const app = await buildAgentWebServer({
    service,
    apiKeyConfigured: Boolean(apiKey),
    foundry: new FoundryArtifactStore(resolve(workspaceRoot, "runs/foundry")),
    clientDirectory: resolve(workspaceRoot, "web/dist"),
    logger: true,
  });
  const address = await app.listen({ host: "127.0.0.1", port: 4173 });
  console.log(`Agent Workbench available at ${address}`);
  const shutdown = async () => {
    await app.close();
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

main().catch((error: unknown) => {
  console.error("Web console failed:", error);
  process.exit(1);
});
