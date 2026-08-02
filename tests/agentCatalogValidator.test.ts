import { z } from "zod";
import { describe, expect, it } from "vitest";
import {
  assertAgentCatalogValid,
  validateAgentCatalog,
} from "../src/agents/agentCatalogValidator.js";
import { AgentRegistry } from "../src/agents/agentRegistry.js";
import { defineAgent } from "../src/agents/agentRegistration.js";
import { ToolRegistry } from "../src/tools/toolRegistry.js";

function registry(workflowId = "repository-assistant") {
  return new AgentRegistry([
    defineAgent({
      manifest: {
        id: "test-agent",
        name: "Test Agent",
        version: "1.0.0",
        status: "experimental",
        description: "Test registration.",
        owner: "tests",
        tags: [],
        defaultModel: "test-model",
        components: {
          workflowIds: [workflowId],
          harnessIds: ["basic-reliability"],
          scenarioIds: [],
          datasetIds: [],
        },
        permissions: { toolIds: ["test-tool"] },
        verification: { datasetIds: [], minimumPassRate: null },
      },
      inputSchema: z.object({}).strict(),
      outputSchema: z.object({}).strict(),
      async execute() {
        return {};
      },
    }),
  ]);
}

const tools = new ToolRegistry([
  {
    id: "test-tool",
    description: "Test tool.",
    inputSchema: z.object({}).strict(),
    outputSchema: z.object({}).strict(),
    async execute() {
      return {};
    },
  },
]);

describe("validateAgentCatalog", () => {
  it("accepts resolvable component references", () => {
    expect(validateAgentCatalog(registry(), tools)).toEqual([]);
    expect(() => assertAgentCatalogValid(registry(), tools)).not.toThrow();
  });

  it("reports unresolved component references before execution", () => {
    const issues = validateAgentCatalog(registry("missing-workflow"), tools);

    expect(issues).toEqual([
      expect.objectContaining({
        agentId: "test-agent",
        componentType: "workflow",
        referencedId: "missing-workflow",
      }),
    ]);
    expect(() =>
      assertAgentCatalogValid(registry("missing-workflow"), tools),
    ).toThrow("Agent catalog validation failed");
  });
});
