import { z } from "zod";
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

  return {
    passed: failures.length === 0,
    message:
      failures.length === 0
        ? "Turn output satisfied all hidden interview expectations."
        : failures.join(" "),
  };
}
