import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { reconcileTestSuiteContent } from "../src/foundry/testSuiteReconciliation.js";
import { suiteContentFor, suiteFixtures } from "./testSuite.test.js";

describe("reconcileTestSuiteContent", () => {
  it("passes clean content through with null reconciliation", () => {
    const { brief, plan } = suiteFixtures();
    const output = reconcileTestSuiteContent(suiteContentFor(brief), brief, plan);
    expect(output.reconciliation).toBeNull();
  });

  it("drops dangling criterion references with recorded evidence", () => {
    const { brief, plan } = suiteFixtures();
    const content = suiteContentFor(brief);
    const ghost = randomUUID();
    content.testFiles[0]!.coveredCriterionIds = [
      brief.acceptanceCriteria[0]!.id,
      ghost,
    ];
    content.concerns.push({
      id: randomUUID(),
      description: "A concern about a ghost criterion.",
      severity: "advisory",
      relatedCriterionIds: [ghost],
    });

    const output = reconcileTestSuiteContent(content, brief, plan);
    expect(output.testFiles[0]!.coveredCriterionIds).toEqual([
      brief.acceptanceCriteria[0]!.id,
    ]);
    expect(output.concerns[0]!.relatedCriterionIds).toEqual([]);
    expect(output.reconciliation?.removedReferences).toHaveLength(2);
  });

  it("fails when a file's covered criteria all vanish", () => {
    const { brief, plan } = suiteFixtures();
    const content = suiteContentFor(brief);
    content.testFiles[0]!.coveredCriterionIds = [randomUUID()];

    expect(() =>
      reconcileTestSuiteContent(content, brief, plan),
    ).toThrowError(/covers no valid brief criteria/i);
  });

  it("does not repair coverage gaps or syntax errors", () => {
    const { brief, plan } = suiteFixtures();
    const holdoutOnly = suiteContentFor(brief);
    holdoutOnly.testFiles[0]!.visibility = "holdout";
    expect(() =>
      reconcileTestSuiteContent(holdoutOnly, brief, plan),
    ).toThrowError(/not covered by any visible test/i);

    const broken = suiteContentFor(brief);
    broken.testFiles[0]!.content = "const x = {";
    expect(() =>
      reconcileTestSuiteContent(broken, brief, plan),
    ).toThrowError(/syntax error/i);
  });
});
