import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { runAgent } from "../src/agents/agentRunner.js";
import { platformAgentRegistry } from "../src/agents/platformAgentRegistry.js";
import {
  projectArchitectBaselinePolicy,
  projectArchitectPolicySchema,
} from "../src/agents/projectArchitect/projectArchitectPolicy.js";
import { buildProjectArchitectPrompt } from "../src/agents/projectArchitect/projectArchitectPrompt.js";
import type { ArchitecturePlanContentShape } from "../src/foundry/architecturePlan.js";
import type { AIProvider } from "../src/providers/aiProvider.js";
import { ToolRegistry } from "../src/tools/toolRegistry.js";
import { briefWithCriteria, planContentFor } from "./architecturePlan.test.js";

function scriptedProvider(
  output: ArchitecturePlanContentShape | null,
  refusal: string | null = null,
): AIProvider {
  return {
    async generate<TOutput>() {
      return {
        rawOutput: "scripted architecture plan",
        parsedOutput: output as TOutput | null,
        refusal,
        provider: { model: "fake-architect-model", usage: null },
      };
    },
  };
}

describe("projectArchitectAgent", () => {
  it("is registered with an instructions revision surface", () => {
    const registration = platformAgentRegistry.get("project-architect");
    expect(registration.manifest.version).toBe("0.1.0");
    expect(registration.manifest.permissions.toolIds).toEqual([]);
    expect(registration.revisionSurface?.mutableFields).toEqual(["instructions"]);
    expect(registration.revisionSurface?.baselinePolicy).toEqual(
      projectArchitectBaselinePolicy,
    );
    expect(
      projectArchitectPolicySchema.parse(projectArchitectBaselinePolicy),
    ).toEqual(projectArchitectBaselinePolicy);
  });

  it("produces a coverage-validated plan through the shared runner", async () => {
    const brief = briefWithCriteria();
    const result = await runAgent(
      "project-architect",
      { brief },
      {
        agents: platformAgentRegistry,
        tools: new ToolRegistry([]),
        provider: scriptedProvider(planContentFor(brief)),
        workspaceRoot: "/workspace",
      },
    );

    expect(result.succeeded).toBe(true);
    expect(result.assessment?.passed).toBe(true);
    expect(result.output).toMatchObject({ reconciliation: null });
  });

  it("repairs dangling brief references instead of failing", async () => {
    const brief = briefWithCriteria();
    const content = planContentFor(brief);
    content.concerns.push({
      id: randomUUID(),
      description: "Persistence durability is untested.",
      severity: "advisory",
      relatedBriefEntryIds: [randomUUID()],
    });

    const result = await runAgent(
      "project-architect",
      { brief },
      {
        agents: platformAgentRegistry,
        tools: new ToolRegistry([]),
        provider: scriptedProvider(content),
        workspaceRoot: "/workspace",
      },
    );

    expect(result.succeeded).toBe(true);
    const output = result.output as {
      reconciliation: { removedReferences: unknown[] };
    };
    expect(output.reconciliation.removedReferences).toHaveLength(1);
  });

  it("fails the run when a brief criterion is uncovered", async () => {
    const brief = briefWithCriteria();
    const content = planContentFor(brief);
    content.acceptancePlan = content.acceptancePlan.slice(0, 1);

    const result = await runAgent(
      "project-architect",
      { brief },
      {
        agents: platformAgentRegistry,
        tools: new ToolRegistry([]),
        provider: scriptedProvider(content),
        workspaceRoot: "/workspace",
      },
    );

    expect(result.succeeded).toBe(false);
    expect(result.failure?.message).toMatch(/not covered/i);
  });

  it("threads policy changes into the prompt", () => {
    const brief = briefWithCriteria();
    const patched = projectArchitectPolicySchema.parse({
      instructions: {
        ...projectArchitectBaselinePolicy.instructions,
        planRules: [
          ...projectArchitectBaselinePolicy.instructions.planRules,
          "Prefer at most five components in the first plan.",
        ],
      },
    });

    expect(buildProjectArchitectPrompt(brief, patched)).toContain(
      "Prefer at most five components",
    );
    expect(buildProjectArchitectPrompt(brief)).not.toContain(
      "Prefer at most five components",
    );
  });
});
