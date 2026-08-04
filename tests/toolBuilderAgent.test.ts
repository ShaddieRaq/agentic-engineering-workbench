import { describe, expect, it } from "vitest";
import { runAgent } from "../src/agents/agentRunner.js";
import { platformAgentRegistry } from "../src/agents/platformAgentRegistry.js";
import type { AIProvider } from "../src/providers/aiProvider.js";
import { createPlatformToolRegistry } from "../src/tools/toolRegistry.js";
import type { ToolProposalOutput } from "../src/agents/toolBuilder/toolProposal.js";

describe("toolBuilderAgent", () => {
  it("runs through the shared agent platform without workspace permissions", async () => {
    const proposal: ToolProposalOutput = {
      disposition: "needs-clarification",
      title: "External project updater",
      summary: "The external contract is incomplete.",
      rationale: "Authentication and authorization have not been defined.",
      contract: null,
      files: [],
      registrationChanges: [],
      verificationCommands: [],
      clarifyingQuestions: ["Which API and authorization policy should the tool use?"],
      securityNotes: ["Do not generate an unauthenticated write integration."],
    };
    const provider: AIProvider = {
      async generate<TOutput>() {
        return {
          rawOutput: "structured clarification",
          parsedOutput: proposal as TOutput,
          refusal: null,
          provider: { model: "fake-tool-builder", usage: null },
        };
      },
    };

    const result = await runAgent(
      "tool-builder",
      {
        request:
          "Create a tool that updates our external project system without a defined API.",
        sourceImprovement: {
          artifactId: "proposal-artifact",
          recommendationIndex: 2,
        },
      },
      {
        agents: platformAgentRegistry,
        tools: createPlatformToolRegistry(process.cwd()),
        provider,
        workspaceRoot: process.cwd(),
      },
    );

    expect(result).toMatchObject({
      agentId: "tool-builder",
      agentVersion: "0.1.0",
      configuration: { permittedToolIds: [] },
      succeeded: true,
      assessment: {
        passed: true,
        message: "Tool proposal completed within the authoring safety policy.",
      },
      output: {
        disposition: "needs-clarification",
        toolId: null,
        policyEvaluation: { passed: true },
      },
      input: {
        allowSideEffects: false,
        sourceImprovement: {
          artifactId: "proposal-artifact",
          recommendationIndex: 2,
        },
      },
    });
  });
});
