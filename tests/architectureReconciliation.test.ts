import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { reconcileArchitecturePlanContent } from "../src/foundry/architectureReconciliation.js";
import { briefWithCriteria, planContentFor } from "./architecturePlan.test.js";

describe("reconcileArchitecturePlanContent", () => {
  it("passes clean content through with null reconciliation", () => {
    const brief = briefWithCriteria();
    const output = reconcileArchitecturePlanContent(planContentFor(brief), brief);

    expect(output.reconciliation).toBeNull();
    expect(output.acceptancePlan).toHaveLength(2);
  });

  it("drops dangling brief-entry references with recorded evidence", () => {
    const brief = briefWithCriteria();
    const content = planContentFor(brief);
    const ghostId = randomUUID();
    content.decisions[0]!.relatedBriefEntryIds = [
      brief.goals[0]!.id,
      ghostId,
    ];

    const output = reconcileArchitecturePlanContent(content, brief);
    expect(output.decisions[0]!.relatedBriefEntryIds).toEqual([
      brief.goals[0]!.id,
    ]);
    expect(output.reconciliation?.removedReferences).toEqual([
      {
        context: "decisions",
        ownerId: content.decisions[0]!.id,
        removedId: ghostId,
      },
    ]);
  });

  it("drops dangling internal dependencies", () => {
    const brief = briefWithCriteria();
    const content = planContentFor(brief);
    const ghostId = randomUUID();
    content.components[0]!.dependsOnComponentIds = [ghostId];
    content.implementationSlices[0]!.dependsOnSliceIds = [ghostId];

    const output = reconcileArchitecturePlanContent(content, brief);
    expect(output.components[0]!.dependsOnComponentIds).toEqual([]);
    expect(output.implementationSlices[0]!.dependsOnSliceIds).toEqual([]);
    expect(output.reconciliation?.removedReferences).toHaveLength(2);
  });

  it("does not repair coverage gaps", () => {
    const brief = briefWithCriteria();
    const content = planContentFor(brief);
    content.acceptancePlan = content.acceptancePlan.slice(0, 1);

    expect(() =>
      reconcileArchitecturePlanContent(content, brief),
    ).toThrowError(/not covered/i);
  });

  it("does not repair unknown criterion references", () => {
    const brief = briefWithCriteria();
    const content = planContentFor(brief);
    content.acceptancePlan[0]!.criterionId = randomUUID();

    expect(() =>
      reconcileArchitecturePlanContent(content, brief),
    ).toThrowError(/unknown brief criterion/i);
  });
});
