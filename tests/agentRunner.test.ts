import { z } from "zod";
import { describe, expect, it, vi } from "vitest";
import { AgentRegistry } from "../src/agents/agentRegistry.js";
import { defineAgent } from "../src/agents/agentRegistration.js";
import { runAgent } from "../src/agents/agentRunner.js";
import { FakeProvider } from "../src/providers/fakeProvider.js";
import { ToolRegistry } from "../src/tools/toolRegistry.js";

const tools = new ToolRegistry([
  {
    id: "read-file",
    description: "Test reader.",
    inputSchema: z.object({ path: z.string() }).strict(),
    outputSchema: z.object({ content: z.string() }).strict(),
    async execute() {
      return { content: "test" };
    },
  },
  {
    id: "unapproved-tool",
    description: "Must not be exposed.",
    inputSchema: z.object({}).strict(),
    outputSchema: z.object({}).strict(),
    async execute() {
      return {};
    },
  },
]);

function manifest(
  workflowId = "repository-assistant",
  status: "active" | "deprecated" = "active",
) {
  return {
    id: "test-agent",
    name: "Test Agent",
    version: "1.2.3",
    status,
    description: "Test agent execution.",
    owner: "tests",
    tags: [],
    defaultModel: "default-model",
    components: {
      workflowIds: [workflowId],
      harnessIds: [],
      scenarioIds: [],
      datasetIds: [],
    },
    permissions: { toolIds: ["read-file"] },
    verification: { datasetIds: [], minimumPassRate: null },
  };
}

function registration(
  execute = vi.fn(async (input: { instruction: string }) => ({
    answer: input.instruction,
  })),
  workflowId = "repository-assistant",
  status: "active" | "deprecated" = "active",
) {
  return {
    execute,
    definition: defineAgent({
      manifest: manifest(workflowId, status),
      inputSchema: z.object({ instruction: z.string().min(1) }).strict(),
      outputSchema: z.object({ answer: z.string().min(1) }).strict(),
      async execute(input, services) {
        expect(services.tools.ids()).toEqual(["read-file"]);
        return execute(input);
      },
    }),
  };
}

function options(definition: ReturnType<typeof registration>["definition"]) {
  return {
    agents: new AgentRegistry([definition]),
    tools,
    provider: new FakeProvider("unused"),
    workspaceRoot: "/workspace",
  };
}

describe("runAgent", () => {
  it("validates, executes, and records versioned agent evidence", async () => {
    const registered = registration();
    const result = await runAgent(
      "test-agent",
      { instruction: "Review this." },
      options(registered.definition),
    );

    expect(result).toMatchObject({
      agentId: "test-agent",
      agentVersion: "1.2.3",
      configuration: {
        model: "default-model",
        permittedToolIds: ["read-file"],
      },
      warnings: [],
      output: { answer: "Review this." },
      assessment: {
        passed: true,
        message: "Agent output satisfied its runtime contract.",
      },
      failure: null,
      succeeded: true,
    });
    expect(result.manifestDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(registered.execute).toHaveBeenCalledOnce();
  });

  it("preserves invalid input without calling the agent", async () => {
    const registered = registration();
    const result = await runAgent(
      "test-agent",
      { instruction: "" },
      options(registered.definition),
    );

    expect(result.failure).toMatchObject({
      stage: "input",
      category: "validation",
    });
    expect(result.succeeded).toBe(false);
    expect(registered.execute).not.toHaveBeenCalled();
  });

  it("rejects unresolved catalog references before execution", async () => {
    const registered = registration(undefined, "missing-workflow");
    const result = await runAgent(
      "test-agent",
      { instruction: "Review this." },
      options(registered.definition),
    );

    expect(result.failure).toMatchObject({ stage: "catalog" });
    expect(registered.execute).not.toHaveBeenCalled();
  });

  it("classifies invalid agent output", async () => {
    const registered = registration(
      vi.fn(async () => ({ answer: "" })),
    );
    const result = await runAgent(
      "test-agent",
      { instruction: "Review this." },
      options(registered.definition),
    );

    expect(result.failure).toMatchObject({
      stage: "output",
      category: "validation",
    });
  });

  it("records a warning when a deprecated agent still executes", async () => {
    const registered = registration(
      undefined,
      "repository-assistant",
      "deprecated",
    );
    const result = await runAgent(
      "test-agent",
      { instruction: "Review this." },
      options(registered.definition),
    );

    expect(result.succeeded).toBe(true);
    expect(result.warnings).toEqual([
      "Agent test-agent@1.2.3 is deprecated.",
    ]);
  });

  it("rejects non-JSON input before agent-specific validation", async () => {
    const registered = registration();
    const result = await runAgent(
      "test-agent",
      { value: 1n },
      options(registered.definition),
    );

    expect(result.input).toBeNull();
    expect(result.failure).toMatchObject({
      stage: "input",
      message: "Agent input must be JSON-serializable.",
    });
    expect(registered.execute).not.toHaveBeenCalled();
  });
});
