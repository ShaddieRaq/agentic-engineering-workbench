import { describe, expect, it } from "vitest";
import { platformAgentRegistry } from "../src/agents/platformAgentRegistry.js";
import { repositoryAssistantAgentInputSchema } from "../src/agents/repositoryAssistant/repositoryAssistantAgent.js";

describe("repositoryAssistantAgent", () => {
  it("registers a discoverable agent with bounded tool permissions", () => {
    const registration = platformAgentRegistry.get("repository-assistant");

    expect(registration.manifest).toMatchObject({
      version: "1.0.0",
      status: "active",
      components: { workflowIds: ["repository-assistant"] },
      permissions: {
        toolIds: [
          "inspect-git-diff",
          "inspect-package",
          "list-files",
          "read-file",
        ],
      },
    });
  });

  it("provides a default repository-analysis instruction", () => {
    expect(repositoryAssistantAgentInputSchema.parse({}).instruction).toContain(
      "Analyze this repository",
    );
  });
});
