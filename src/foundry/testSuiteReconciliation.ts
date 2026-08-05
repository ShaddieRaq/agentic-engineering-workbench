import type { ArchitecturePlan } from "./architecturePlan.js";
import type { ProjectBrief } from "./projectBrief.js";
import {
  testSuiteOutputSchema,
  validateTestSuite,
  type TestSuiteContentShape,
  type TestSuiteOutput,
  type TestSuiteReconciliation,
} from "./testSuite.js";

// Drops dangling criterion references with recorded evidence. Does NOT repair
// paths, syntax errors, or coverage gaps: those fail loudly. A test file whose
// covered criteria all vanish is meaningless and also fails loudly.
export function reconcileTestSuiteContent(
  model: TestSuiteContentShape,
  brief: ProjectBrief,
  plan: ArchitecturePlan,
): TestSuiteOutput {
  const content = structuredClone(model);
  const removedReferences: TestSuiteReconciliation["removedReferences"] = [];
  const criterionIds = new Set(brief.acceptanceCriteria.map(({ id }) => id));

  for (const file of content.testFiles) {
    const kept = file.coveredCriterionIds.filter((criterionId) => {
      if (criterionIds.has(criterionId)) return true;
      removedReferences.push({
        context: "testFiles",
        ownerPathOrId: file.path,
        removedId: criterionId,
      });
      return false;
    });
    if (kept.length === 0) {
      throw new Error(
        `Test file ${file.path} covers no valid brief criteria after reconciliation.`,
      );
    }
    file.coveredCriterionIds = kept;
  }

  for (const concern of content.concerns) {
    concern.relatedCriterionIds = concern.relatedCriterionIds.filter(
      (criterionId) => {
        if (criterionIds.has(criterionId)) return true;
        removedReferences.push({
          context: "concerns",
          ownerPathOrId: concern.id,
          removedId: criterionId,
        });
        return false;
      },
    );
  }

  const validation = validateTestSuite(content, brief, plan);
  if (!validation.passed) {
    throw new Error(
      `Test suite does not satisfy the acceptance plan: ${validation.failures.join(" ")}`,
    );
  }

  return testSuiteOutputSchema.parse({
    ...content,
    reconciliation:
      removedReferences.length > 0 ? { removedReferences } : null,
  });
}
