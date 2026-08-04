import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { validateAgentCatalog } from "../src/agents/agentCatalogValidator.js";
import { runAgent } from "../src/agents/agentRunner.js";
import { platformAgentRegistry } from "../src/agents/platformAgentRegistry.js";
import {
  briefContentOf,
  createInitialProjectBrief,
} from "../src/foundry/projectBrief.js";
import type { IntakeTurnOutput } from "../src/foundry/intakeTurnOutput.js";
import type { AIProvider } from "../src/providers/aiProvider.js";
import {
  createPlatformToolRegistry,
  ToolRegistry,
} from "../src/tools/toolRegistry.js";

function turnInput() {
  return {
    briefContent: briefContentOf(
      createInitialProjectBrief({
        title: "Recipe planner",
        ideaSummary: "Plan weekly meals from pantry contents.",
      }),
    ),
    operatorAnswers: [],
    turnNumber: 1,
    remainingTurns: 4,
  };
}

function turnOutput(): IntakeTurnOutput {
  const goalId = randomUUID();
  return {
    updatedBriefDraft: {
      title: "Recipe planner",
      ideaSummary: "Plan weekly meals from pantry contents.",
      goals: [
        { id: goalId, text: "Generate a weekly meal plan.", source: "agent-inferred" },
      ],
      users: [],
      constraints: [],
      risks: [],
      nonGoals: [],
      assumptions: [],
      acceptanceCriteria: [],
      openQuestions: [],
    },
    nextQuestions: [
      {
        id: randomUUID(),
        question: "Did I capture the core goal correctly?",
        targetEntryIds: [goalId],
        intent: "confirm-inferred",
      },
    ],
    openIssues: [],
  };
}

function scriptedProvider(output: IntakeTurnOutput | null, refusal: string | null = null): AIProvider {
  return {
    async generate<TOutput>() {
      return {
        rawOutput: "scripted intake output",
        parsedOutput: output as TOutput | null,
        refusal,
        provider: { model: "fake-intake-model", usage: null },
      };
    },
  };
}

describe("projectIntakeAgent", () => {
  it("is registered and the catalog stays valid", () => {
    const manifest = platformAgentRegistry.get("project-intake").manifest;
    expect(manifest.status).toBe("experimental");
    expect(manifest.permissions.toolIds).toEqual([]);
    expect(
      validateAgentCatalog(
        platformAgentRegistry,
        createPlatformToolRegistry(process.cwd()),
      ),
    ).toEqual([]);
  });

  it("runs through the shared agent runner without tools", async () => {
    const result = await runAgent("project-intake", turnInput(), {
      agents: platformAgentRegistry,
      tools: new ToolRegistry([]),
      provider: scriptedProvider(turnOutput()),
      workspaceRoot: "/workspace",
    });

    expect(result).toMatchObject({
      agentId: "project-intake",
      succeeded: true,
      configuration: { permittedToolIds: [] },
      assessment: { passed: true },
    });
  });

  it("fails the run when the provider refuses", async () => {
    const result = await runAgent("project-intake", turnInput(), {
      agents: platformAgentRegistry,
      tools: new ToolRegistry([]),
      provider: scriptedProvider(null, "I cannot help with that."),
      workspaceRoot: "/workspace",
    });

    expect(result.succeeded).toBe(false);
    expect(result.failure?.message).toMatch(/refused/i);
  });

  it("fails the run when the provider returns no parsable output", async () => {
    const result = await runAgent("project-intake", turnInput(), {
      agents: platformAgentRegistry,
      tools: new ToolRegistry([]),
      provider: scriptedProvider(null),
      workspaceRoot: "/workspace",
    });

    expect(result.succeeded).toBe(false);
    expect(result.failure?.message).toMatch(/no parsable/i);
  });

  it("passes assessment for blocking issues without questions on a final turn", async () => {
    const output = turnOutput();
    output.nextQuestions = [];
    output.openIssues = [
      {
        id: randomUUID(),
        description: "The idea has no identified users.",
        severity: "blocking",
        relatedEntryIds: [],
      },
    ];

    const result = await runAgent("project-intake", turnInput(), {
      agents: platformAgentRegistry,
      tools: new ToolRegistry([]),
      provider: scriptedProvider(output),
      workspaceRoot: "/workspace",
    });

    expect(result.succeeded).toBe(true);
    expect(result.assessment?.passed).toBe(true);
    expect(result.assessment?.message).toMatch(/1 blocking issue/i);
  });
});
