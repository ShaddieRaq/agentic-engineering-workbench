import "dotenv/config";
import { resolve } from "node:path";
import { AgentApplicationService } from "./agents/agentApplicationService.js";
import { platformAgentRegistry } from "./agents/platformAgentRegistry.js";
import { FileArtifactStore } from "./artifacts/fileArtifactStore.js";
import { ArchitectService } from "./foundry/architectService.js";
import {
  BuildCompletionService,
  createProcessGitInspector,
} from "./foundry/buildCompletionService.js";
import { createProcessSubmissionRunner } from "./foundry/submissionService.js";
import { CapabilityService } from "./foundry/capabilityService.js";
import { prepareBuilderWorkspace } from "./foundry/builderWorkspace.js";
import { FoundryArtifactStore } from "./foundry/foundryArtifactStore.js";
import { IntakeSessionController } from "./foundry/intakeSessionController.js";
import { ProjectBriefService } from "./foundry/projectBriefService.js";
import { TestDesignService } from "./foundry/testDesignService.js";
import { createProcessSuiteVacuityCheck } from "./foundry/suiteVacuityCheck.js";
import { WorkOrderService } from "./foundry/workOrderService.js";
import { OpenAIProvider } from "./providers/openaiProvider.js";
import { createPlatformToolRegistry } from "./tools/toolRegistry.js";
import { buildAgentWebServer } from "./web/agentWebServer.js";
import { loadOrCreateOperatorToken } from "./web/operatorToken.js";
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
  const foundry = new FoundryArtifactStore(resolve(workspaceRoot, "runs/foundry"));
  const briefService = new ProjectBriefService(foundry);
  const architectService = new ArchitectService({
    agentService: service,
    briefService,
    store: foundry,
  });
  const toolRegistry = createPlatformToolRegistry(workspaceRoot);
  const capabilityService = new CapabilityService({
    agentService: service,
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
    agentService: service,
    capability: capabilityService,
    architect: architectService,
    briefs: briefService,
    store: foundry,
    vacuityCheck: createProcessSuiteVacuityCheck(workspaceRoot),
  });

  const operatorToken = await loadOrCreateOperatorToken(
    resolve(workspaceRoot, ".workbench", "operator-token"),
  );
  const workOrderService = new WorkOrderService({
    testDesign: testDesignService,
    architect: architectService,
    briefs: briefService,
    store: foundry,
  });
  const app = await buildAgentWebServer({
    service,
    apiKeyConfigured: Boolean(apiKey),
    operatorToken,
    foundry,
    matrixRunsDirectory: resolve(workspaceRoot, "runs"),
    foundryServices: {
      intake: new IntakeSessionController({
        agentService: service,
        briefService,
        store: foundry,
      }),
      architect: architectService,
      capability: capabilityService,
      testDesign: testDesignService,
      workOrders: workOrderService,
      builderWorkspaces: {
        prepare: (input) =>
          prepareBuilderWorkspace(
            { workOrders: workOrderService, testDesign: testDesignService },
            { ...input, workbenchRoot: workspaceRoot },
          ),
      },
      completions: new BuildCompletionService({
        testDesign: testDesignService,
        architect: architectService,
        store: foundry,
        runner: createProcessSubmissionRunner(),
        git: createProcessGitInspector(),
        isolationRoot: resolve(workspaceRoot, ".workbench", "verification"),
      }),
    },
    clientDirectory: resolve(workspaceRoot, "web/dist"),
    logger: true,
  });
  const port = Number(process.env.PORT ?? 4173);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be a valid TCP port, got: ${process.env.PORT}`);
  }
  const address = await app.listen({ host: "127.0.0.1", port });
  console.log(`Agent Workbench available at ${address}`);
  console.log(
    `Operator decision token (enter once on the console's Operator page): ${operatorToken}`,
  );
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
