import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  assessTestDesignerExpectation,
  testDesignerExpectationSchema,
} from "../src/agents/testDesigner/testDesignerExpectation.js";
import type { TestSuiteOutput } from "../src/foundry/testSuite.js";

const SPAWNING_CONTENT = [
  "import { describe, it, expect } from 'vitest';",
  "import { spawnSync } from 'node:child_process';",
  "describe('save', () => {",
  "  it('exits 0', () => {",
  "    const run = spawnSync('node', ['./dist/cli.js', 'save', 'x']);",
  "    expect(run.status).toBe(0);",
  "  });",
  "});",
].join("\n");

const DOCUMENT_AUDIT_CONTENT = [
  "import { describe, it, expect } from 'vitest';",
  "import { readFileSync } from 'node:fs';",
  "const brief = JSON.parse(readFileSync('briefs/approved-brief.json', 'utf8'));",
  "describe('brief', () => {",
  "  it('states the scope', () => { expect(brief.title).toBe('X'); });",
  "});",
].join("\n");

function file(
  overrides: Partial<TestSuiteOutput["testFiles"][number]> = {},
): TestSuiteOutput["testFiles"][number] {
  return {
    path: `acceptance-tests/${randomUUID().slice(0, 8)}.test.ts`,
    content: SPAWNING_CONTENT,
    visibility: "visible",
    coveredCriterionIds: [randomUUID()],
    testType: "integration",
    ...overrides,
  };
}

function output(
  testFiles: TestSuiteOutput["testFiles"],
): TestSuiteOutput {
  return {
    interfaceContract: "node ./dist/cli.js save|list|delete; exit 0 on success.",
    testFiles,
    manualChecks: [],
    concerns: [],
    reconciliation: null,
  };
}

describe("assessTestDesignerExpectation", () => {
  it("applies defaults and rejects unknown keys", () => {
    expect(testDesignerExpectationSchema.parse({})).toEqual({
      requireProductExercise: false,
      forbidArtifactReads: false,
      requireHoldoutCount: null,
      requireVisibleCoverageForCriterionIds: [],
    });
    expect(() =>
      testDesignerExpectationSchema.parse({ surprise: true }),
    ).toThrowError();
  });

  it("fails files that never spawn the product (live defect: suite 0de1fe65)", () => {
    const audit = file({ content: DOCUMENT_AUDIT_CONTENT });
    const result = assessTestDesignerExpectation(output([audit]), {
      requireProductExercise: true,
      forbidArtifactReads: true,
    });
    expect(result.passed).toBe(false);
    expect(result.message).toMatch(/never spawns the product/);
    expect(result.message).toMatch(/references chain documents/);
  });

  it("enforces the exact holdout count and visible coverage", () => {
    const criterionId = randomUUID();
    const visible = file({ coveredCriterionIds: [criterionId] });
    const noHoldout = assessTestDesignerExpectation(output([visible]), {
      requireHoldoutCount: 1,
    });
    expect(noHoldout.passed).toBe(false);
    expect(noHoldout.message).toMatch(/exactly 1 holdout/);

    const holdoutOnly = file({
      visibility: "holdout",
      coveredCriterionIds: [criterionId],
    });
    const uncovered = assessTestDesignerExpectation(output([holdoutOnly]), {
      requireVisibleCoverageForCriterionIds: [criterionId],
    });
    expect(uncovered.passed).toBe(false);
    expect(uncovered.message).toMatch(/not covered by any visible/);

    const good = assessTestDesignerExpectation(output([visible, holdoutOnly]), {
      requireProductExercise: true,
      forbidArtifactReads: true,
      requireHoldoutCount: 1,
      requireVisibleCoverageForCriterionIds: [criterionId],
    });
    expect(good.passed).toBe(true);
  });
});
