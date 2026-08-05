import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  assessProjectArchitectExpectation,
  projectArchitectExpectationSchema,
} from "../src/agents/projectArchitect/projectArchitectExpectation.js";
import type { ArchitectPlanOutput } from "../src/foundry/architecturePlan.js";
import { briefWithCriteria, planContentFor } from "./architecturePlan.test.js";

function output(
  overrides: Partial<ArchitectPlanOutput> = {},
): ArchitectPlanOutput {
  const brief = briefWithCriteria();
  return {
    ...planContentFor(brief),
    reconciliation: null,
    ...overrides,
  };
}

describe("projectArchitectExpectationSchema", () => {
  it("applies defaults and rejects unknown keys", () => {
    expect(projectArchitectExpectationSchema.parse({})).toEqual({
      requireBlockingConcern: false,
      forbidBlockingConcerns: false,
      requireConcernReferencingEntryIds: [],
      requireDecisionCitingEntryIds: [],
      requireIndependentVerificationForCriterionIds: [],
      minimumSlices: null,
    });
    expect(() =>
      projectArchitectExpectationSchema.parse({ surprise: true }),
    ).toThrowError();
  });
});

describe("assessProjectArchitectExpectation", () => {
  it("enforces blocking-concern requirements in both directions", () => {
    const clean = output();
    expect(
      assessProjectArchitectExpectation(clean, { forbidBlockingConcerns: true })
        .passed,
    ).toBe(true);
    expect(
      assessProjectArchitectExpectation(clean, { requireBlockingConcern: true })
        .passed,
    ).toBe(false);

    const withBlocking = output({
      concerns: [
        {
          id: randomUUID(),
          description: "The brief contradicts itself.",
          severity: "blocking",
          relatedBriefEntryIds: [],
        },
      ],
    });
    expect(
      assessProjectArchitectExpectation(withBlocking, {
        requireBlockingConcern: true,
      }).passed,
    ).toBe(true);
    const failed = assessProjectArchitectExpectation(withBlocking, {
      forbidBlockingConcerns: true,
    });
    expect(failed.passed).toBe(false);
    expect(failed.message).toMatch(/no blocking concerns/i);
  });

  it("checks concern and decision references to brief entries", () => {
    const entryId = randomUUID();
    const plan = output({
      concerns: [
        {
          id: randomUUID(),
          description: "Related concern.",
          severity: "advisory",
          relatedBriefEntryIds: [entryId],
        },
      ],
    });
    expect(
      assessProjectArchitectExpectation(plan, {
        requireConcernReferencingEntryIds: [entryId],
      }).passed,
    ).toBe(true);
    expect(
      assessProjectArchitectExpectation(plan, {
        requireConcernReferencingEntryIds: [randomUUID()],
      }).passed,
    ).toBe(false);

    const decisionEntry = plan.decisions[0]!.relatedBriefEntryIds[0]!;
    expect(
      assessProjectArchitectExpectation(plan, {
        requireDecisionCitingEntryIds: [decisionEntry],
      }).passed,
    ).toBe(true);
    const missing = assessProjectArchitectExpectation(plan, {
      requireDecisionCitingEntryIds: [randomUUID()],
    });
    expect(missing.passed).toBe(false);
    expect(missing.message).toMatch(/no architectural decision cites/i);
  });

  it("checks independent verification per criterion", () => {
    const plan = output();
    const criterionId = plan.acceptancePlan[0]!.criterionId;
    expect(
      assessProjectArchitectExpectation(plan, {
        requireIndependentVerificationForCriterionIds: [criterionId],
      }).passed,
    ).toBe(true);

    const dependent = output();
    dependent.acceptancePlan = dependent.acceptancePlan.map((mapping) => ({
      ...mapping,
      independentOfImplementation: false,
    }));
    const failed = assessProjectArchitectExpectation(dependent, {
      requireIndependentVerificationForCriterionIds: [
        dependent.acceptancePlan[0]!.criterionId,
      ],
    });
    expect(failed.passed).toBe(false);
    expect(failed.message).toMatch(/implementation-independent/i);
  });

  it("enforces minimum slices", () => {
    const plan = output();
    expect(
      assessProjectArchitectExpectation(plan, { minimumSlices: 1 }).passed,
    ).toBe(true);
    const failed = assessProjectArchitectExpectation(plan, { minimumSlices: 3 });
    expect(failed.passed).toBe(false);
    expect(failed.message).toMatch(/at least 3 implementation slice/i);
  });

  it("rejects malformed expectations", () => {
    expect(() =>
      assessProjectArchitectExpectation(output(), { minimumSlices: 0 }),
    ).toThrowError();
  });
});
