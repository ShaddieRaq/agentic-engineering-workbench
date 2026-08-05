import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { ProjectBrief } from "../src/foundry/projectBrief.js";
import {
  testFileSchema,
  testSuiteContentSchema,
  testSuiteSchema,
  validateTestSuite,
  type TestSuiteContentShape,
} from "../src/foundry/testSuite.js";
import { briefWithCriteria } from "./architecturePlan.test.js";
import { architecturePlanFixture } from "./capabilityPlan.test.js";

export function suiteFixtures() {
  const plan = architecturePlanFixture();
  // architecturePlanFixture builds its own brief internally; rebuild one whose
  // criteria match the plan's acceptance mappings for validation tests.
  const brief: ProjectBrief = {
    ...briefWithCriteria(),
    acceptanceCriteria: plan.content.acceptancePlan.map((mapping, index) => ({
      id: mapping.criterionId,
      text: `Criterion ${index + 1}.`,
      source: "user-stated" as const,
      verification: "Check it.",
    })),
  };
  return { brief, plan };
}

export function validTestFileContent(): string {
  return [
    'import { describe, expect, it } from "vitest";',
    "",
    'describe("acceptance", () => {',
    '  it("meets the criterion", () => {',
    "    expect(1 + 1).toBe(2);",
    "  });",
    "});",
    "",
  ].join("\n");
}

export function suiteContentFor(
  brief: ProjectBrief,
): TestSuiteContentShape {
  return {
    interfaceContract:
      "CLI invoked as `node cli.js <command>`; exit code 0 on success.",
    testFiles: brief.acceptanceCriteria.map((criterion, index) => ({
      path: `acceptance-tests/criterion-${index + 1}.test.ts`,
      content: validTestFileContent(),
      visibility: "visible" as const,
      coveredCriterionIds: [criterion.id],
      testType: "integration" as const,
    })),
    manualChecks: [],
    concerns: [],
  };
}

describe("testFileSchema", () => {
  it("enforces path discipline", () => {
    const base = {
      content: validTestFileContent(),
      visibility: "visible" as const,
      coveredCriterionIds: [randomUUID()],
      testType: "integration" as const,
    };

    expect(() =>
      testFileSchema.parse({ ...base, path: "acceptance-tests/a.test.ts" }),
    ).not.toThrow();
    expect(() =>
      testFileSchema.parse({ ...base, path: "src/a.test.ts" }),
    ).toThrowError(/acceptance-tests/);
    expect(() =>
      testFileSchema.parse({ ...base, path: "acceptance-tests/a.ts" }),
    ).toThrowError(/\.test\.ts/);
    expect(() =>
      testFileSchema.parse({
        ...base,
        path: "acceptance-tests/../escape.test.ts",
      }),
    ).toThrowError();
  });
});

describe("validateTestSuite", () => {
  it("passes a fully covered, parsable suite", () => {
    const { brief, plan } = suiteFixtures();
    const result = validateTestSuite(suiteContentFor(brief), brief, plan);
    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("fails when an automated mapping is covered only by holdout tests", () => {
    const { brief, plan } = suiteFixtures();
    const content = suiteContentFor(brief);
    content.testFiles[0]!.visibility = "holdout";

    const result = validateTestSuite(content, brief, plan);
    expect(result.passed).toBe(false);
    expect(result.failures.join(" ")).toMatch(/not covered by any visible test/i);
  });

  it("fails on syntax errors with diagnostics", () => {
    const { brief, plan } = suiteFixtures();
    const content = suiteContentFor(brief);
    content.testFiles[0]!.content = 'describe("broken", () => {';

    const result = validateTestSuite(content, brief, plan);
    expect(result.passed).toBe(false);
    expect(result.failures.join(" ")).toMatch(/syntax error/i);
  });

  it("fails manual mappings without manual checks and unknown criteria", () => {
    const { brief, plan } = suiteFixtures();
    plan.content.acceptancePlan[0]!.testType = "manual";
    const content = suiteContentFor(brief);

    const result = validateTestSuite(content, brief, plan);
    expect(result.failures.join(" ")).toMatch(/no manual check/i);

    const unknown = suiteContentFor(brief);
    unknown.testFiles[0]!.coveredCriterionIds = [randomUUID()];
    expect(
      validateTestSuite(unknown, brief, plan).failures.join(" "),
    ).toMatch(/unknown criterion/i);
  });
});

describe("testSuiteContentSchema and testSuiteSchema", () => {
  it("rejects duplicate paths and pins lineage", () => {
    const { brief } = suiteFixtures();
    const content = suiteContentFor(brief);
    content.testFiles.push({ ...content.testFiles[0]! });
    expect(() => testSuiteContentSchema.parse(content)).toThrowError(
      /duplicate test file path/i,
    );

    const suite = testSuiteSchema.parse({
      testSuiteId: randomUUID(),
      capabilityPlanId: randomUUID(),
      capabilityPlanDigest: "a".repeat(64),
      planId: randomUUID(),
      briefId: brief.briefId,
      briefVersion: 1,
      agentRunArtifactId: "agent-run-1",
      content: suiteContentFor(brief),
      reconciliation: null,
      createdAt: "2026-08-05T00:00:00.000Z",
    });
    expect(suite.briefId).toBe(brief.briefId);
  });
});
