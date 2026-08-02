import { z } from "zod";
import { describe, expect, it } from "vitest";
import { AgentRegistry } from "../src/agents/agentRegistry.js";
import { defineAgent } from "../src/agents/agentRegistration.js";

const validAgentManifest = {
  id: "repository-assistant",
  name: "Repository Assistant",
  version: "1.0.0",
  status: "active" as const,
  description: "Inspects and analyzes repositories.",
  owner: "local-platform",
  tags: ["engineering"],
  defaultModel: "test-model",
  components: {
    workflowIds: ["repository-assistant"],
    harnessIds: [],
    scenarioIds: [],
    datasetIds: [],
  },
  permissions: { toolIds: ["read-file"] },
  verification: { datasetIds: [], minimumPassRate: null },
};

function registration(id = validAgentManifest.id) {
  return defineAgent({
    manifest: { ...validAgentManifest, id, name: id },
    inputSchema: z.object({ instruction: z.string() }).strict(),
    outputSchema: z.object({ answer: z.string() }).strict(),
    async execute(input) {
      return { answer: input.instruction };
    },
  });
}

describe("AgentRegistry", () => {
  it("lists agents deterministically and resolves them by ID", () => {
    const registry = new AgentRegistry([
      registration("zeta-agent"),
      registration("alpha-agent"),
    ]);

    expect(registry.list().map(({ id }) => id)).toEqual([
      "alpha-agent",
      "zeta-agent",
    ]);
    expect(registry.get("zeta-agent").manifest.id).toBe("zeta-agent");
  });

  it("rejects duplicate agent IDs", () => {
    expect(
      () => new AgentRegistry([registration(), registration()]),
    ).toThrow("Agent IDs must be unique");
  });

  it("rejects an unknown agent ID", () => {
    expect(() => new AgentRegistry([]).get("missing-agent")).toThrow(
      "Unknown agent: missing-agent",
    );
  });
});
