import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import { platformAgentRegistry } from "../src/agents/platformAgentRegistry.js";
import { FileArtifactStore } from "../src/artifacts/fileArtifactStore.js";
import { FoundryArtifactStore } from "../src/foundry/foundryArtifactStore.js";
import { IntakeSessionController } from "../src/foundry/intakeSessionController.js";
import { ProjectBriefService } from "../src/foundry/projectBriefService.js";
import { buildWorkbenchMcpServer } from "../src/mcp/workbenchMcpServer.js";

const createdDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    createdDirectories.map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
  createdDirectories.length = 0;
});

describe("workbench MCP server", () => {
  it("serves tools over the protocol with tier descriptions", async () => {
    const runsDirectory = await mkdtemp(join(tmpdir(), "mcp-server-runs-"));
    const foundryDirectory = await mkdtemp(join(tmpdir(), "mcp-server-foundry-"));
    createdDirectories.push(runsDirectory, foundryDirectory);

    const foundry = new FoundryArtifactStore(foundryDirectory);
    const briefService = new ProjectBriefService(foundry);
    const server = buildWorkbenchMcpServer(
      {
        agents: platformAgentRegistry,
        artifacts: new FileArtifactStore(runsDirectory),
        foundry,
        exportsRoot: runsDirectory,
        agentRunner: {
          async run() {
            throw new Error("Not scripted.");
          },
        },
        promotionDecisions: {
          async recordPromotionDecision() {
            throw new Error("Not scripted.");
          },
        },
        intake: new IntakeSessionController({
          agentService: {
            async run() {
              throw new Error("Not scripted.");
            },
          },
          briefService,
          store: foundry,
        }),
        briefs: briefService,
        architect: {
          async createPlan() {
            throw new Error("Not scripted.");
          },
          async recordPlanDecision() {
            throw new Error("Not scripted.");
          },
        },
        capability: {
          async createCapabilityPlan() {
            throw new Error("Not scripted.");
          },
          async recordCapabilityDecision() {
            throw new Error("Not scripted.");
          },
        },
        testDesign: {
          async createTestSuite() {
            throw new Error("Not scripted.");
          },
          async recordTestSuiteDecision() {
            throw new Error("Not scripted.");
          },
        },
        workOrders: {
          async createWorkOrder() {
            throw new Error("Not scripted.");
          },
          async nextSlice() {
            throw new Error("Not scripted.");
          },
          async materializeVisibleTests() {
            throw new Error("Not scripted.");
          },
          async loadWorkOrder() {
            throw new Error("Not scripted.");
          },
        },
        suiteReads: {
          async loadTestSuite() {
            throw new Error("Not scripted.");
          },
        },
        submissions: {
          async submitSlice() {
            throw new Error("Not scripted.");
          },
          async recordSubmissionDecision() {
            throw new Error("Not scripted.");
          },
        },
        completions: {
          async recordCompletion() {
            throw new Error("Not scripted.");
          },
        },
      },
      "0.0.0-test",
    );

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "0.0.0" });
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    const listed = await client.listTools();
    const names = listed.tools.map(({ name }) => name).sort();
    expect(names).toEqual([
      "architect_plan",
      "capability_plan",
      "create_work_order",
      "describe_agent",
      "design_tests",
      "get_approved_export",
      "get_artifact",
      "intake_start",
      "intake_status",
      "intake_turn",
      "list_agents",
      "list_artifacts",
      "materialize_tests",
      "prepare_builder_workspace",
      "record_brief_decision",
      "record_build_completion",
      "record_capability_decision",
      "record_plan_decision",
      "record_promotion_decision",
      "record_submission_decision",
      "record_test_decision",
      "run_agent",
      "submit_feedback",
      "submit_slice",
    ]);

    const submit = listed.tools.find(({ name }) => name === "submit_feedback");
    expect(submit?.description).toMatch(/writes evidence/i);
    expect(submit?.description).toMatch(/never modifies agent policy/i);

    for (const decisionTool of [
      "record_brief_decision",
      "record_promotion_decision",
    ]) {
      const tool = listed.tools.find(({ name }) => name === decisionTool);
      expect(tool?.description).toMatch(/operator/i);
    }

    const result = await client.callTool({ name: "list_agents", arguments: {} });
    const content = result.content as { type: string; text: string }[];
    const agents = JSON.parse(content[0]!.text) as { id: string }[];
    expect(agents.map(({ id }) => id)).toContain("project-intake");

    await client.close();
    await server.close();
  });
});
