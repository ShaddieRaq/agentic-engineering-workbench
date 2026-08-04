import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { AgentApplicationService } from "../../src/agents/agentApplicationService.js";
import { AgentRegistry } from "../../src/agents/agentRegistry.js";
import { defineAgent } from "../../src/agents/agentRegistration.js";
import { FileArtifactStore } from "../../src/artifacts/fileArtifactStore.js";
import { FakeProvider } from "../../src/providers/fakeProvider.js";
import {
  createPlatformToolRegistry,
  ToolRegistry,
} from "../../src/tools/toolRegistry.js";
import { FileWorkspaceStore } from "../../src/workspaces/fileWorkspaceStore.js";
import { agentImprovementAnalystAgent } from "../../src/agents/agentImprovement/agentImprovementAnalystAgent.js";
import { documentationAuditorAgent } from "../../src/agents/documentationAuditor/documentationAuditorAgent.js";
import { toolBuilderAgent } from "../../src/agents/toolBuilder/toolBuilderAgent.js";
import { changeRiskReviewerAgent } from "../../src/agents/changeRiskReviewer/changeRiskReviewerAgent.js";

export const consoleTestAgent = defineAgent({
  manifest: {
    id: "console-test-agent",
    name: "Console Test Agent",
    version: "1.0.0",
    status: "active",
    description: "Tests shared application services.",
    owner: "tests",
    tags: ["test"],
    defaultModel: "fake-model",
    components: { workflowIds: [], harnessIds: [], scenarioIds: [], datasetIds: [] },
    permissions: { toolIds: [] },
    verification: { datasetIds: [], minimumPassRate: null },
  },
  inputSchema: z.object({ instruction: z.string().min(1).default("Test") }).strict(),
  outputSchema: z.object({ answer: z.string().min(1) }).strict(),
  async execute(input) { return { answer: input.instruction }; },
});

export async function createConsoleTestService(
  apiKeyConfigured = true,
  options: {
    includeCandidateWorkflow?: boolean;
    includeToolBuilder?: boolean;
    includeChangeRiskReviewer?: boolean;
  } = {},
) {
  const directory = await mkdtemp(join(tmpdir(), "agent-console-"));
  const registrations = [agentImprovementAnalystAgent, consoleTestAgent];
  if (options.includeCandidateWorkflow) {
    registrations.push(documentationAuditorAgent);
  }
  if (options.includeToolBuilder) {
    registrations.push(toolBuilderAgent);
  }
  if (options.includeChangeRiskReviewer) {
    registrations.push(changeRiskReviewerAgent);
  }
  return {
    directory,
    service: new AgentApplicationService(
      new AgentRegistry(registrations),
      new FileArtifactStore(directory),
      new FileWorkspaceStore(join(directory, ".workbench", "workspaces.json"), directory),
      (workspaceRoot) =>
        options.includeCandidateWorkflow ||
            options.includeChangeRiskReviewer
          ? createPlatformToolRegistry(workspaceRoot)
          : new ToolRegistry([]),
      () => {
        if (!apiKeyConfigured) throw new Error("Provider unavailable.");
        return new FakeProvider("unused");
      },
    ),
  };
}
