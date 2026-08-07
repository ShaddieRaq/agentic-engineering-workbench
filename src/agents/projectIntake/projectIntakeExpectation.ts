import { z } from "zod";
import { findSelfReferentialCriteria } from "../../foundry/criteriaQuality.js";
import type { IntakeTurnOutput } from "../../foundry/intakeTurnOutput.js";
import type {
  BriefEntry,
  ProjectBriefDraftContent,
} from "../../foundry/projectBrief.js";
import type { AgentOutputAssessment } from "../agentRegistration.js";

export const projectIntakeExpectationSchema = z
  .object({
    preservedEntryIds: z.array(z.uuid()).default([]),
    userStatedEntryIds: z.array(z.uuid()).default([]),
    notUserStatedEntryIds: z.array(z.uuid()).default([]),
    challengedEntryIds: z.array(z.uuid()).default([]),
    requireQuestions: z.boolean().default(false),
    requireBlockingIssue: z.boolean().default(false),
    // Live failure mode (Mac Librarian interview, 2026-08-06): the agent
    // circled for five turns re-asking answered topics. When the operator
    // declares answers final, the turn must ask nothing further and must
    // clean the answered questions out of the brief.
    forbidQuestions: z.boolean().default(false),
    removedOpenQuestionIds: z.array(z.uuid()).default([]),
    // Live failure mode (Mac Librarian brief b1c76b2a v8): acceptance
    // criteria written ABOUT the brief ("the brief states X", verify by
    // reading the brief) instead of about the product, which degraded
    // every downstream stage. Criteria must describe observable product
    // behavior. requireAcceptanceCriteria guards the vacuous escape of
    // returning no criteria at all.
    forbidSelfReferentialCriteria: z.boolean().default(false),
    requireAcceptanceCriteria: z.boolean().default(false),
  })
  .strict();

export type ProjectIntakeExpectation = z.infer<
  typeof projectIntakeExpectationSchema
>;

function collectEntries(draft: ProjectBriefDraftContent): Map<string, BriefEntry> {
  const entries = new Map<string, BriefEntry>();
  for (const section of [
    draft.goals,
    draft.users,
    draft.constraints,
    draft.risks,
    draft.nonGoals,
    draft.assumptions,
    draft.acceptanceCriteria,
  ]) {
    for (const entry of section) entries.set(entry.id, entry);
  }
  return entries;
}

function isChallenged(output: IntakeTurnOutput, entryId: string): boolean {
  const entry = collectEntries(output.updatedBriefDraft).get(entryId);
  if (entry?.source === "unresolved") return true;
  if (
    output.nextQuestions.some(({ targetEntryIds }) =>
      targetEntryIds.includes(entryId),
    )
  ) {
    return true;
  }
  if (
    output.openIssues.some(({ relatedEntryIds }) =>
      relatedEntryIds.includes(entryId),
    )
  ) {
    return true;
  }
  return output.updatedBriefDraft.openQuestions.some(({ relatedEntryIds }) =>
    relatedEntryIds.includes(entryId),
  );
}

export function assessProjectIntakeExpectation(
  output: IntakeTurnOutput,
  rawExpected: unknown,
): AgentOutputAssessment {
  const expected = projectIntakeExpectationSchema.parse(rawExpected);
  const entries = collectEntries(output.updatedBriefDraft);
  const failures: string[] = [];

  for (const entryId of expected.preservedEntryIds) {
    if (!entries.has(entryId)) {
      failures.push(`Entry ${entryId} was dropped from the brief draft.`);
    }
  }

  for (const entryId of expected.userStatedEntryIds) {
    const entry = entries.get(entryId);
    if (!entry) {
      failures.push(`Entry ${entryId} expected user-stated but is missing.`);
    } else if (entry.source !== "user-stated") {
      failures.push(
        `Entry ${entryId} expected user-stated but is ${entry.source}.`,
      );
    }
  }

  for (const entryId of expected.notUserStatedEntryIds) {
    const entry = entries.get(entryId);
    if (entry && entry.source === "user-stated") {
      failures.push(
        `Entry ${entryId} was marked user-stated without operator confirmation.`,
      );
    }
  }

  for (const entryId of expected.challengedEntryIds) {
    if (!isChallenged(output, entryId)) {
      failures.push(
        `Entry ${entryId} was accepted without a challenge (no unresolved ` +
          "source, targeting question, related issue, or open question).",
      );
    }
  }

  if (expected.requireQuestions && output.nextQuestions.length === 0) {
    failures.push("Expected at least one interview question.");
  }

  if (
    expected.requireBlockingIssue &&
    !output.openIssues.some(({ severity }) => severity === "blocking")
  ) {
    failures.push("Expected at least one blocking open issue.");
  }

  if (
    expected.requireAcceptanceCriteria &&
    output.updatedBriefDraft.acceptanceCriteria.length === 0
  ) {
    failures.push("Expected at least one acceptance criterion in the brief draft.");
  }

  if (expected.forbidSelfReferentialCriteria) {
    // Enumerated, precise messages: these become the improvement analyst's
    // only evidence of WHY a trial failed.
    for (const violation of findSelfReferentialCriteria(
      output.updatedBriefDraft.acceptanceCriteria,
    )) {
      failures.push(
        `Criterion ${violation.entryId} ${violation.field} is self-referential ` +
          `("${violation.matchedText}"): acceptance criteria must describe ` +
          "observable product behavior a tester can exercise, never what " +
          "the brief itself states.",
      );
    }
  }

  if (expected.forbidQuestions && output.nextQuestions.length > 0) {
    failures.push(
      `Asked ${output.nextQuestions.length} question(s) after the operator ` +
        "declared the answers final.",
    );
  }

  for (const questionId of expected.removedOpenQuestionIds) {
    if (
      output.updatedBriefDraft.openQuestions.some(({ id }) => id === questionId)
    ) {
      failures.push(
        `Open question ${questionId} was answered by the operator but ` +
          "remains in the brief draft.",
      );
    }
  }

  return {
    passed: failures.length === 0,
    message:
      failures.length === 0
        ? "Turn output satisfied all hidden interview expectations."
        : failures.join(" "),
  };
}
