import "dotenv/config";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { AgentApplicationService } from "./agents/agentApplicationService.js";
import { platformAgentRegistry } from "./agents/platformAgentRegistry.js";
import { FileArtifactStore } from "./artifacts/fileArtifactStore.js";
import { ArchitectService } from "./foundry/architectService.js";
import { FoundryArtifactStore } from "./foundry/foundryArtifactStore.js";
import { IntakeSessionController } from "./foundry/intakeSessionController.js";
import { ProjectBriefService } from "./foundry/projectBriefService.js";
import { buildWorkbenchMcpServer } from "./mcp/workbenchMcpServer.js";
import { OpenAIProvider } from "./providers/openaiProvider.js";
import { createPlatformToolRegistry } from "./tools/toolRegistry.js";
import { FileWorkspaceStore } from "./workspaces/fileWorkspaceStore.js";

async function main(): Promise<void> {
  const workspaceRoot = process.cwd();
  const packageJson = JSON.parse(
    await readFile(resolve(workspaceRoot, "package.json"), "utf8"),
  ) as { version?: string };

  const apiKey = process.env.OPENAI_API_KEY;
  const workspaces = new FileWorkspaceStore(
    resolve(workspaceRoot, ".workbench", "workspaces.json"),
    workspaceRoot,
  );
  const artifacts = new FileArtifactStore(resolve(workspaceRoot, "runs"));
  const foundry = new FoundryArtifactStore(resolve(workspaceRoot, "runs/foundry"));
  const agentService = new AgentApplicationService(
    platformAgentRegistry,
    artifacts,
    workspaces,
    createPlatformToolRegistry,
    (model) => {
      if (!apiKey) {
        throw new Error(
          "OPENAI_API_KEY is missing from .env; model-invoking MCP tools are unavailable.",
        );
      }
      return new OpenAIProvider(apiKey, { model });
    },
  );
  const briefService = new ProjectBriefService(foundry);

  const server = buildWorkbenchMcpServer(
    {
      agents: platformAgentRegistry,
      artifacts,
      foundry,
      exportsRoot: resolve(workspaceRoot, "exports"),
      agentRunner: agentService,
      promotionDecisions: agentService,
      intake: new IntakeSessionController({
        agentService,
        briefService,
        store: foundry,
      }),
      briefs: briefService,
      architect: new ArchitectService({
        agentService,
        briefService,
        store: foundry,
      }),
    },
    packageJson.version ?? "0.0.0",
  );

  await server.connect(new StdioServerTransport());
  console.error("Agentic Workbench MCP server connected over stdio.");
}

main().catch((error: unknown) => {
  console.error("Workbench MCP server failed:", error);
  process.exit(1);
});
