import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { ArchitecturePlan } from "../src/foundry/architecturePlan.js";
import {
  capabilityPlanContentSchema,
  capabilityPlanSchema,
  validateCapabilityPlan,
  type CapabilityCatalog,
  type CapabilityPlanContentShape,
} from "../src/foundry/capabilityPlan.js";
import { briefWithCriteria, planContentFor } from "./architecturePlan.test.js";

export function architecturePlanFixture(): ArchitecturePlan {
  const brief = briefWithCriteria();
  return {
    planId: randomUUID(),
    briefId: brief.briefId,
    briefVersion: 1,
    briefArtifactId: `${brief.briefId}-v1`,
    briefDigest: "a".repeat(64),
    agentRunArtifactId: "agent-run-1",
    content: planContentFor(brief),
    reconciliation: null,
    createdAt: "2026-08-05T00:00:00.000Z",
  };
}

export function catalogFixture(): CapabilityCatalog {
  return {
    agents: [
      { id: "change-risk-reviewer", description: "Reviews changes for risk." },
      { id: "documentation-auditor", description: "Audits documentation." },
    ],
    tools: [
      { id: "verification-command", description: "Runs fixed npm actions." },
    ],
  };
}

export function capabilityContentFor(
  plan: ArchitecturePlan,
): CapabilityPlanContentShape {
  const sliceId = plan.content.implementationSlices[0]!.id;
  return {
    overview: "Project code implements the features; platform tools verify.",
    needs: [
      {
        id: randomUUID(),
        need: "Implement the core tracking features.",
        resolution: "project-code",
        capabilityId: null,
        rationale: "Application features belong to the generated project.",
        relatedSliceIds: [sliceId],
      },
      {
        id: randomUUID(),
        need: "Run the project's tests during verification.",
        resolution: "existing-tool",
        capabilityId: "verification-command",
        rationale: "The platform's controlled npm runner covers test execution.",
        relatedSliceIds: [sliceId],
      },
    ],
    proposedCapabilities: [],
    concerns: [],
  };
}

describe("capabilityPlanContentSchema", () => {
  it("accepts valid content", () => {
    const plan = architecturePlanFixture();
    expect(() =>
      capabilityPlanContentSchema.parse(capabilityContentFor(plan)),
    ).not.toThrow();
  });

  it("enforces capabilityId presence rules per resolution", () => {
    const plan = architecturePlanFixture();
    const missingId = capabilityContentFor(plan);
    missingId.needs[1]!.capabilityId = null;
    expect(() => capabilityPlanContentSchema.parse(missingId)).toThrowError(
      /names no capabilityId/i,
    );

    const spuriousId = capabilityContentFor(plan);
    spuriousId.needs[0]!.capabilityId = "verification-command";
    expect(() => capabilityPlanContentSchema.parse(spuriousId)).toThrowError(
      /must not name a capabilityId/i,
    );
  });

  it("requires proposals for engineering-change needs", () => {
    const plan = architecturePlanFixture();
    const content = capabilityContentFor(plan);
    content.needs[0] = {
      ...content.needs[0]!,
      resolution: "engineering-change-required",
      capabilityId: null,
    };
    expect(() => capabilityPlanContentSchema.parse(content)).toThrowError(
      /no capability proposal references it/i,
    );

    content.proposedCapabilities = [
      {
        id: randomUUID(),
        name: "Project scaffolder",
        contractSketch: "Generates the initial project skeleton.",
        route: "tool-builder",
        relatedNeedIds: [content.needs[0]!.id],
      },
    ];
    expect(() => capabilityPlanContentSchema.parse(content)).not.toThrow();
  });
});

describe("validateCapabilityPlan", () => {
  it("passes when catalog ids resolve and every slice is covered", () => {
    const plan = architecturePlanFixture();
    const result = validateCapabilityPlan(
      capabilityContentFor(plan),
      plan,
      catalogFixture(),
    );
    expect(result.passed).toBe(true);
  });

  it("fails on unknown catalog ids and uncovered slices", () => {
    const plan = architecturePlanFixture();
    const badTool = capabilityContentFor(plan);
    badTool.needs[1]!.capabilityId = "ghost-tool";
    expect(
      validateCapabilityPlan(badTool, plan, catalogFixture()).failures.join(" "),
    ).toMatch(/unknown tool/i);

    const uncovered = capabilityContentFor(plan);
    const ghostSlice = randomUUID();
    plan.content.implementationSlices.push({
      id: ghostSlice,
      title: "Extra slice",
      delivers: "Something else.",
      dependsOnSliceIds: [],
      verifiedByCriterionIds: plan.content.implementationSlices[0]!.verifiedByCriterionIds,
    });
    const result = validateCapabilityPlan(uncovered, plan, catalogFixture());
    expect(result.passed).toBe(false);
    expect(result.failures.join(" ")).toMatch(/not covered by any capability need/i);
  });
});

describe("capabilityPlanSchema", () => {
  it("pins the source plan identity", () => {
    const plan = architecturePlanFixture();
    const artifact = capabilityPlanSchema.parse({
      capabilityPlanId: randomUUID(),
      planId: plan.planId,
      planArtifactId: plan.planId,
      planDigest: "b".repeat(64),
      briefId: plan.briefId,
      briefVersion: 1,
      agentRunArtifactId: "agent-run-2",
      catalog: catalogFixture(),
      content: capabilityContentFor(plan),
      reconciliation: null,
      createdAt: "2026-08-05T00:00:00.000Z",
    });
    expect(artifact.planId).toBe(plan.planId);
  });
});
