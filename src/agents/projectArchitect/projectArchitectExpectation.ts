import { z } from "zod";
import type { ArchitectPlanOutput } from "../../foundry/architecturePlan.js";
import type { AgentOutputAssessment } from "../agentRegistration.js";

export const projectArchitectExpectationSchema = z
  .object({
    requireBlockingConcern: z.boolean().default(false),
    forbidBlockingConcerns: z.boolean().default(false),
    requireConcernReferencingEntryIds: z.array(z.uuid()).default([]),
    requireDecisionCitingEntryIds: z.array(z.uuid()).default([]),
    requireIndependentVerificationForCriterionIds: z.array(z.uuid()).default([]),
    minimumSlices: z.number().int().min(1).nullable().default(null),
    // Live defect, observed twice (habit tracker; Mac Librarian plan
    // 22969605): behavioral criteria mapped to manual testing, which
    // silently exempts them from the governed build. Listed criteria must
    // be mapped, and none of their mappings may be manual.
    requireAutomatedMappingForCriterionIds: z.array(z.uuid()).default([]),
  })
  .strict();

export type ProjectArchitectExpectation = z.infer<
  typeof projectArchitectExpectationSchema
>;

export function assessProjectArchitectExpectation(
  output: ArchitectPlanOutput,
  rawExpected: unknown,
): AgentOutputAssessment {
  const expected = projectArchitectExpectationSchema.parse(rawExpected);
  const failures: string[] = [];

  const blockingConcerns = output.concerns.filter(
    ({ severity }) => severity === "blocking",
  );
  if (expected.requireBlockingConcern && blockingConcerns.length === 0) {
    failures.push("Expected at least one blocking concern.");
  }
  if (expected.forbidBlockingConcerns && blockingConcerns.length > 0) {
    failures.push(
      `Expected no blocking concerns but found ${blockingConcerns.length}.`,
    );
  }

  for (const entryId of expected.requireConcernReferencingEntryIds) {
    const referenced = output.concerns.some(({ relatedBriefEntryIds }) =>
      relatedBriefEntryIds.includes(entryId),
    );
    if (!referenced) {
      failures.push(`No concern references brief entry ${entryId}.`);
    }
  }

  for (const entryId of expected.requireDecisionCitingEntryIds) {
    const cited = output.decisions.some(({ relatedBriefEntryIds }) =>
      relatedBriefEntryIds.includes(entryId),
    );
    if (!cited) {
      failures.push(`No architectural decision cites brief entry ${entryId}.`);
    }
  }

  for (const criterionId of expected.requireIndependentVerificationForCriterionIds) {
    const mappings = output.acceptancePlan.filter(
      (mapping) => mapping.criterionId === criterionId,
    );
    if (mappings.length === 0) {
      failures.push(`Criterion ${criterionId} has no acceptance mapping.`);
    } else if (!mappings.some(({ independentOfImplementation }) => independentOfImplementation)) {
      failures.push(
        `Criterion ${criterionId} has no implementation-independent verification.`,
      );
    }
  }

  for (const criterionId of expected.requireAutomatedMappingForCriterionIds) {
    const mappings = output.acceptancePlan.filter(
      (mapping) => mapping.criterionId === criterionId,
    );
    if (mappings.length === 0) {
      failures.push(`Criterion ${criterionId} has no acceptance mapping.`);
      continue;
    }
    for (const mapping of mappings) {
      if (mapping.testType === "manual") {
        failures.push(
          `Criterion ${criterionId} is mapped to manual testing; its ` +
            "verification describes behavior an automated test can " +
            "exercise, so the mapping must be unit, integration, or " +
            "end-to-end.",
        );
      }
    }
  }

  if (
    expected.minimumSlices !== null &&
    output.implementationSlices.length < expected.minimumSlices
  ) {
    failures.push(
      `Expected at least ${expected.minimumSlices} implementation slice(s) ` +
        `but found ${output.implementationSlices.length}.`,
    );
  }

  return {
    passed: failures.length === 0,
    message:
      failures.length === 0
        ? "Plan satisfied all hidden architecture expectations."
        : failures.join(" "),
  };
}
