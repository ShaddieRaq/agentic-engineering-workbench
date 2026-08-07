import { z } from "zod";
import type { TestSuiteOutput } from "../../foundry/testSuite.js";
import type { AgentOutputAssessment } from "../agentRegistration.js";

// Hidden expectations for the test designer, encoding its two recorded
// live defects (Mac Librarian suites 0de1fe65 and a3173672→e264cf13):
// a suite whose files read the brief/plan documents instead of exercising
// the product, and a suite shipped without any holdout file.
export const testDesignerExpectationSchema = z
  .object({
    // Every generated test file must exercise the product by spawning a
    // subprocess; a file with no spawn call cannot be testing behavior.
    requireProductExercise: z.boolean().default(false),
    // No test file may read chain documents (brief/plan artifacts) —
    // document-auditing tests pass without any product code existing.
    forbidArtifactReads: z.boolean().default(false),
    // Exact number of holdout files the suite must withhold.
    requireHoldoutCount: z.number().int().min(0).nullable().default(null),
    // Each listed criterion must be covered by at least one VISIBLE file.
    requireVisibleCoverageForCriterionIds: z.array(z.uuid()).default([]),
  })
  .strict();

export type TestDesignerExpectation = z.infer<
  typeof testDesignerExpectationSchema
>;

const SPAWN_PATTERNS = [/\bspawnSync?\s*\(/, /\bexecFileSync?\s*\(/];

const ARTIFACT_READ_PATTERNS = [
  /briefs\//i,
  /approved[-_]?brief/i,
  /architecture[-_]?plan/i,
  /\bBRIEF\.md\b/,
  /\bbrief\.json\b/i,
  /\bplan\.json\b/i,
];

export function assessTestDesignerExpectation(
  output: TestSuiteOutput,
  rawExpected: unknown,
): AgentOutputAssessment {
  const expected = testDesignerExpectationSchema.parse(rawExpected);
  const failures: string[] = [];

  if (expected.requireProductExercise) {
    for (const file of output.testFiles) {
      if (!SPAWN_PATTERNS.some((pattern) => pattern.test(file.content))) {
        failures.push(
          `Test file ${file.path} never spawns the product under test; ` +
            "every acceptance test must exercise the product through a " +
            "subprocess, not assert on data structures or documents.",
        );
      }
    }
  }

  if (expected.forbidArtifactReads) {
    for (const file of output.testFiles) {
      const match = ARTIFACT_READ_PATTERNS.find((pattern) =>
        pattern.test(file.content),
      );
      if (match) {
        failures.push(
          `Test file ${file.path} references chain documents (${String(match)}); ` +
            "tests must verify product behavior, never what the brief or " +
            "plan documents say.",
        );
      }
    }
  }

  if (expected.requireHoldoutCount !== null) {
    const holdouts = output.testFiles.filter(
      ({ visibility }) => visibility === "holdout",
    ).length;
    if (holdouts !== expected.requireHoldoutCount) {
      failures.push(
        `Expected exactly ${expected.requireHoldoutCount} holdout file(s) ` +
          `but found ${holdouts}.`,
      );
    }
  }

  for (const criterionId of expected.requireVisibleCoverageForCriterionIds) {
    const covered = output.testFiles.some(
      (file) =>
        file.visibility === "visible" &&
        file.coveredCriterionIds.includes(criterionId),
    );
    if (!covered) {
      failures.push(
        `Criterion ${criterionId} is not covered by any visible test file.`,
      );
    }
  }

  return {
    passed: failures.length === 0,
    message:
      failures.length === 0
        ? "Suite output satisfied all hidden test-design expectations."
        : failures.join(" "),
  };
}
