import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  architecturePlanContentSchema,
  architecturePlanSchema,
  validatePlanAgainstBrief,
  type ArchitecturePlanContentShape,
} from "../src/foundry/architecturePlan.js";
import {
  createInitialProjectBrief,
  type ProjectBrief,
} from "../src/foundry/projectBrief.js";

export function briefWithCriteria(): ProjectBrief {
  return createInitialProjectBrief({
    title: "Habit tracker",
    ideaSummary: "A CLI habit tracker.",
    goals: [
      { id: randomUUID(), text: "Track daily habits.", source: "user-stated" },
    ],
    acceptanceCriteria: [
      {
        id: randomUUID(),
        text: "A weekly plan covers seven days.",
        source: "user-stated",
        verification: "Generate a plan and count the days.",
      },
      {
        id: randomUUID(),
        text: "Streaks reset after a missed day.",
        source: "user-stated",
        verification: "Skip a day in a fixture and assert the streak resets.",
      },
    ],
  });
}

export function planContentFor(brief: ProjectBrief): ArchitecturePlanContentShape {
  const componentId = randomUUID();
  const sliceId = randomUUID();
  return {
    overview: "A small CLI with local JSON persistence.",
    components: [
      {
        id: componentId,
        name: "Habit store",
        responsibility: "Persist habits and completions in a local JSON file.",
        dependsOnComponentIds: [],
      },
    ],
    decisions: [
      {
        id: randomUUID(),
        decision: "Use a single local JSON file for persistence.",
        rationale: "Matches the local-only constraint stated in the brief.",
        relatedBriefEntryIds: [brief.goals[0]!.id],
      },
    ],
    acceptancePlan: brief.acceptanceCriteria.map((criterion) => ({
      criterionId: criterion.id,
      testType: "integration" as const,
      verificationApproach: `Automated check: ${criterion.verification}`,
      independentOfImplementation: true,
    })),
    implementationSlices: [
      {
        id: sliceId,
        title: "Core tracking loop",
        delivers: "Add and complete habits with streaks persisted.",
        dependsOnSliceIds: [],
        verifiedByCriterionIds: brief.acceptanceCriteria.map(({ id }) => id),
      },
    ],
    concerns: [],
  };
}

describe("architecturePlanContentSchema", () => {
  it("accepts valid plan content", () => {
    const brief = briefWithCriteria();
    expect(() =>
      architecturePlanContentSchema.parse(planContentFor(brief)),
    ).not.toThrow();
  });

  it("rejects duplicate plan element ids", () => {
    const brief = briefWithCriteria();
    const content = planContentFor(brief);
    content.decisions.push({ ...content.decisions[0]! });

    expect(() => architecturePlanContentSchema.parse(content)).toThrowError(
      /duplicate plan element id/i,
    );
  });

  it("rejects unresolved internal dependencies and self-dependent slices", () => {
    const brief = briefWithCriteria();
    const content = planContentFor(brief);
    content.components[0]!.dependsOnComponentIds = [randomUUID()];

    expect(() => architecturePlanContentSchema.parse(content)).toThrowError(
      /unknown component/i,
    );

    const selfDependent = planContentFor(brief);
    selfDependent.implementationSlices[0]!.dependsOnSliceIds = [
      selfDependent.implementationSlices[0]!.id,
    ];
    expect(() => architecturePlanContentSchema.parse(selfDependent)).toThrowError(
      /cannot depend on itself/i,
    );
  });
});

describe("validatePlanAgainstBrief", () => {
  it("passes when every brief criterion is covered", () => {
    const brief = briefWithCriteria();
    const result = validatePlanAgainstBrief(planContentFor(brief), brief);
    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("fails when a brief criterion is uncovered", () => {
    const brief = briefWithCriteria();
    const content = planContentFor(brief);
    content.acceptancePlan = content.acceptancePlan.slice(0, 1);

    const result = validatePlanAgainstBrief(content, brief);
    expect(result.passed).toBe(false);
    expect(result.failures.join(" ")).toMatch(/not covered/i);
  });

  it("fails on unknown criterion and brief-entry references", () => {
    const brief = briefWithCriteria();
    const content = planContentFor(brief);
    content.acceptancePlan[0]!.criterionId = randomUUID();
    content.decisions[0]!.relatedBriefEntryIds = [randomUUID()];

    const result = validatePlanAgainstBrief(content, brief);
    expect(result.passed).toBe(false);
    expect(result.failures.join(" ")).toMatch(/unknown brief criterion/i);
    expect(result.failures.join(" ")).toMatch(/unknown brief entry/i);
  });
});

describe("architecturePlanSchema", () => {
  it("pins the source brief identity", () => {
    const brief = briefWithCriteria();
    const plan = architecturePlanSchema.parse({
      planId: randomUUID(),
      briefId: brief.briefId,
      briefVersion: 1,
      briefArtifactId: `${brief.briefId}-v1`,
      briefDigest: "a".repeat(64),
      agentRunArtifactId: "agent-run-1",
      content: planContentFor(brief),
      reconciliation: null,
      createdAt: new Date().toISOString(),
    });
    expect(plan.briefId).toBe(brief.briefId);

    expect(() =>
      architecturePlanSchema.parse({ ...plan, briefDigest: "not-hex" }),
    ).toThrowError();
  });
});
