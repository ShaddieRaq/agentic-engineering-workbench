import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { runAgent } from "../src/agents/agentRunner.js";
import {
  capabilityPlannerBaselinePolicy,
  capabilityPlannerPolicySchema,
} from "../src/agents/capabilityPlanner/capabilityPlannerPolicy.js";
import { buildCapabilityPlannerPrompt } from "../src/agents/capabilityPlanner/capabilityPlannerPrompt.js";
import { platformAgentRegistry } from "../src/agents/platformAgentRegistry.js";
import type { CapabilityPlanContentShape } from "../src/foundry/capabilityPlan.js";
import type { AIProvider } from "../src/providers/aiProvider.js";
import { ToolRegistry } from "../src/tools/toolRegistry.js";
import {
  architecturePlanFixture,
  capabilityContentFor,
  catalogFixture,
} from "./capabilityPlan.test.js";

function scriptedProvider(
  output: CapabilityPlanContentShape | null,
  refusal: string | null = null,
): AIProvider {
  return {
    async generate<TOutput>() {
      return {
        rawOutput: "scripted capability plan",
        parsedOutput: output as TOutput | null,
        refusal,
        provider: { model: "fake-capability-model", usage: null },
      };
    },
  };
}

describe("capabilityPlannerAgent", () => {
  it("is registered with an instructions revision surface", () => {
    const registration = platformAgentRegistry.get("capability-planner");
    expect(registration.manifest.version).toBe("0.1.0");
    expect(registration.manifest.permissions.toolIds).toEqual([]);
    expect(registration.revisionSurface?.mutableFields).toEqual(["instructions"]);
    expect(
      capabilityPlannerPolicySchema.parse(capabilityPlannerBaselinePolicy),
    ).toEqual(capabilityPlannerBaselinePolicy);
  });

  it("produces a validated capability plan through the shared runner", async () => {
    const plan = architecturePlanFixture();
    const result = await runAgent(
      "capability-planner",
      { plan, catalog: catalogFixture() },
      {
        agents: platformAgentRegistry,
        tools: new ToolRegistry([]),
        provider: scriptedProvider(capabilityContentFor(plan)),
        workspaceRoot: "/workspace",
      },
    );

    expect(result.succeeded).toBe(true);
    expect(result.output).toMatchObject({ reconciliation: null });
  });

  it("repairs dangling slice references instead of failing", async () => {
    const plan = architecturePlanFixture();
    const content = capabilityContentFor(plan);
    content.concerns.push({
      id: randomUUID(),
      description: "One slice may need clarification.",
      severity: "advisory",
      relatedSliceIds: [randomUUID()],
    });

    const result = await runAgent(
      "capability-planner",
      { plan, catalog: catalogFixture() },
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

  it("fails the run on unknown catalog citations", async () => {
    const plan = architecturePlanFixture();
    const content = capabilityContentFor(plan);
    content.needs[1]!.capabilityId = "ghost-tool";

    const result = await runAgent(
      "capability-planner",
      { plan, catalog: catalogFixture() },
      {
        agents: platformAgentRegistry,
        tools: new ToolRegistry([]),
        provider: scriptedProvider(content),
        workspaceRoot: "/workspace",
      },
    );

    expect(result.succeeded).toBe(false);
    expect(result.failure?.message).toMatch(/unknown tool/i);
  });

  it("threads policy changes into the prompt", () => {
    const plan = architecturePlanFixture();
    const patched = capabilityPlannerPolicySchema.parse({
      instructions: {
        ...capabilityPlannerBaselinePolicy.instructions,
        mappingRules: [
          ...capabilityPlannerBaselinePolicy.instructions.mappingRules,
          "Prefer at most one proposal per missing capability theme.",
        ],
      },
    });

    expect(
      buildCapabilityPlannerPrompt(plan, catalogFixture(), patched),
    ).toContain("Prefer at most one proposal per missing capability theme.");
    expect(buildCapabilityPlannerPrompt(plan, catalogFixture())).not.toContain(
      "Prefer at most one proposal per missing capability theme.",
    );
  });
});
