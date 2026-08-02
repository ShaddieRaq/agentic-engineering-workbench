import { describe, expect, it } from "vitest";
import { agentManifestSchema } from "../src/agents/agentManifest.js";

export const validAgentManifest = {
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

describe("agentManifestSchema", () => {
  it("accepts a complete serializable agent manifest", () => {
    expect(agentManifestSchema.parse(validAgentManifest)).toEqual(
      validAgentManifest,
    );
  });

  it.each(["Repository Assistant", "repository_assistant", "-agent"])(
    "rejects invalid agent ID %s",
    (id) => {
      expect(
        agentManifestSchema.safeParse({ ...validAgentManifest, id }).success,
      ).toBe(false);
    },
  );

  it("rejects duplicate component references", () => {
    const result = agentManifestSchema.safeParse({
      ...validAgentManifest,
      permissions: { toolIds: ["read-file", "read-file"] },
    });

    expect(result.success).toBe(false);
  });
});
