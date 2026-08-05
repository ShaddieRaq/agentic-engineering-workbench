import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { reconcileCapabilityPlanContent } from "../src/foundry/capabilityReconciliation.js";
import {
  architecturePlanFixture,
  capabilityContentFor,
  catalogFixture,
} from "./capabilityPlan.test.js";

describe("reconcileCapabilityPlanContent", () => {
  it("passes clean content through with null reconciliation", () => {
    const plan = architecturePlanFixture();
    const output = reconcileCapabilityPlanContent(
      capabilityContentFor(plan),
      plan,
      catalogFixture(),
    );
    expect(output.reconciliation).toBeNull();
    expect(output.needs).toHaveLength(2);
  });

  it("drops dangling slice references and empty needs with evidence", () => {
    const plan = architecturePlanFixture();
    const content = capabilityContentFor(plan);
    const ghostSlice = randomUUID();
    content.needs[1]!.relatedSliceIds = [ghostSlice];

    const output = reconcileCapabilityPlanContent(content, plan, catalogFixture());
    expect(output.needs).toHaveLength(1);
    expect(output.reconciliation?.droppedNeedIds).toEqual([content.needs[1]!.id]);
    expect(output.reconciliation?.removedReferences).toContainEqual({
      context: "needs",
      ownerId: content.needs[1]!.id,
      removedId: ghostSlice,
    });
  });

  it("does not repair unknown catalog ids", () => {
    const plan = architecturePlanFixture();
    const content = capabilityContentFor(plan);
    content.needs[1]!.capabilityId = "ghost-tool";

    expect(() =>
      reconcileCapabilityPlanContent(content, plan, catalogFixture()),
    ).toThrowError(/unknown tool/i);
  });

  it("does not repair uncovered slices", () => {
    const plan = architecturePlanFixture();
    const content = capabilityContentFor(plan);
    const ghostSlice = randomUUID();
    for (const need of content.needs) {
      need.relatedSliceIds = [ghostSlice];
    }

    expect(() =>
      reconcileCapabilityPlanContent(content, plan, catalogFixture()),
    ).toThrowError(/not covered/i);
  });
});
