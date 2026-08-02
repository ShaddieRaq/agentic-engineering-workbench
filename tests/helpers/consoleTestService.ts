import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { AgentApplicationService } from "../../src/agents/agentApplicationService.js";
import { AgentRegistry } from "../../src/agents/agentRegistry.js";
import { defineAgent } from "../../src/agents/agentRegistration.js";
import { FileArtifactStore } from "../../src/artifacts/fileArtifactStore.js";
import { FakeProvider } from "../../src/providers/fakeProvider.js";
import { ToolRegistry } from "../../src/tools/toolRegistry.js";

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

export async function createConsoleTestService(apiKeyConfigured = true) {
  const directory = await mkdtemp(join(tmpdir(), "agent-console-"));
  return {
    directory,
    service: new AgentApplicationService(
      new AgentRegistry([consoleTestAgent]),
      new ToolRegistry([]),
      new FileArtifactStore(directory),
      directory,
      () => {
        if (!apiKeyConfigured) throw new Error("Provider unavailable.");
        return new FakeProvider("unused");
      },
    ),
  };
}
