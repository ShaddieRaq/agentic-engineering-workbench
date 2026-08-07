import "dotenv/config";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { AgentApplicationService } from "./agents/agentApplicationService.js";
import { platformAgentRegistry } from "./agents/platformAgentRegistry.js";
import { FileArtifactStore } from "./artifacts/fileArtifactStore.js";
import { ArchitectService } from "./foundry/architectService.js";
import { CapabilityService } from "./foundry/capabilityService.js";
import { FoundryArtifactStore } from "./foundry/foundryArtifactStore.js";
import { IntakeSessionController } from "./foundry/intakeSessionController.js";
import { ProjectBriefService } from "./foundry/projectBriefService.js";
import {
  BuildCompletionService,
  createProcessGitInspector,
} from "./foundry/buildCompletionService.js";
import {
  createProcessSubmissionRunner,
  SubmissionService,
} from "./foundry/submissionService.js";
import { TestDesignService } from "./foundry/testDesignService.js";
import { WorkOrderService } from "./foundry/workOrderService.js";
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
  const architectService = new ArchitectService({
    agentService,
    briefService,
    store: foundry,
  });
  const toolRegistry = createPlatformToolRegistry(workspaceRoot);
  const capabilityService = new CapabilityService({
    agentService,
    architect: architectService,
    store: foundry,
    catalogFactory: () => ({
      agents: platformAgentRegistry
        .list()
        .map(({ id, description }) => ({ id, description })),
      tools: toolRegistry
        .ids()
        .map((id) => ({ id, description: toolRegistry.get(id).description })),
    }),
  });

  const testDesignService = new TestDesignService({
    agentService,
    capability: capabilityService,
    architect: architectService,
    briefs: briefService,
    store: foundry,
  });
  const workOrderService = new WorkOrderService({
    testDesign: testDesignService,
    architect: architectService,
    briefs: briefService,
    store: foundry,
  });
  const submissionService = new SubmissionService({
    workOrders: workOrderService,
    testDesign: testDesignService,
    store: foundry,
    runner: createProcessSubmissionRunner(),
    isolationRoot: resolve(workspaceRoot, ".workbench", "verification"),
  });
  const completionService = new BuildCompletionService({
    testDesign: testDesignService,
    architect: architectService,
    store: foundry,
    runner: createProcessSubmissionRunner(),
    git: createProcessGitInspector(),
    isolationRoot: resolve(workspaceRoot, ".workbench", "verification"),
  });

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
      architect: architectService,
      capability: capabilityService,
      testDesign: testDesignService,
      suiteReads: testDesignService,
      workOrders: workOrderService,
      submissions: submissionService,
      completions: completionService,
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
