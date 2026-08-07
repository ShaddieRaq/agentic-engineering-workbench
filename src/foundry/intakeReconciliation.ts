import { randomUUID } from "node:crypto";
import { findSelfReferentialCriteria } from "./criteriaQuality.js";
import {
  intakeTurnOutputSchema,
  type IntakeReconciliation,
  type IntakeTurnModelOutput,
  type IntakeTurnOutput,
} from "./intakeTurnOutput.js";

const draftSections = [
  "goals",
  "users",
  "constraints",
  "risks",
  "nonGoals",
  "assumptions",
  "acceptanceCriteria",
] as const;

export function reconcileIntakeTurnOutput(
  model: IntakeTurnModelOutput,
): IntakeTurnOutput {
  const draft = structuredClone(model.updatedBriefDraft);
  const remintedEntries: IntakeReconciliation["remintedEntries"] = [];
  const removedReferences: IntakeReconciliation["removedReferences"] = [];
  const droppedQuestionIds: IntakeReconciliation["droppedQuestionIds"] = [];

  // First occurrence of an id keeps it; later occurrences are re-minted so the
  // original entry retains its identity and inbound references stay valid.
  const seenIds = new Set<string>();
  for (const section of draftSections) {
    for (const entry of draft[section]) {
      if (seenIds.has(entry.id)) {
        const mintedId = randomUUID();
        remintedEntries.push({ originalId: entry.id, mintedId, section });
        entry.id = mintedId;
      }
      seenIds.add(entry.id);
    }
  }
  for (const question of draft.openQuestions) {
    if (seenIds.has(question.id)) {
      const mintedId = randomUUID();
      remintedEntries.push({
        originalId: question.id,
        mintedId,
        section: "openQuestions",
      });
      question.id = mintedId;
    }
    seenIds.add(question.id);
  }

  const entryIds = new Set<string>();
  for (const section of draftSections) {
    for (const entry of draft[section]) entryIds.add(entry.id);
  }

  for (const question of draft.openQuestions) {
    question.relatedEntryIds = question.relatedEntryIds.filter((relatedId) => {
      if (entryIds.has(relatedId)) return true;
      removedReferences.push({
        context: "openQuestions",
        ownerId: question.id,
        removedId: relatedId,
      });
      return false;
    });
  }

  const nextQuestions = model.nextQuestions
    .map((question) => ({
      ...question,
      targetEntryIds: question.targetEntryIds.filter((targetId) => {
        if (entryIds.has(targetId)) return true;
        removedReferences.push({
          context: "nextQuestions",
          ownerId: question.id,
          removedId: targetId,
        });
        return false;
      }),
    }))
    .filter((question) => {
      if (question.intent === "elicit-new" || question.targetEntryIds.length > 0) {
        return true;
      }
      droppedQuestionIds.push(question.id);
      return false;
    });

  const openIssues = model.openIssues.map((issue) => ({
    ...issue,
    relatedEntryIds: issue.relatedEntryIds.filter((relatedId) => {
      if (entryIds.has(relatedId)) return true;
      removedReferences.push({
        context: "openIssues",
        ownerId: issue.id,
        removedId: relatedId,
      });
      return false;
    }),
  }));

  // Runtime backstop for the self-referential-criteria defect (Mac
  // Librarian brief b1c76b2a v8): criteria about the DOCUMENT survive to
  // approval unless something blocks. A deterministic blocking issue keeps
  // the interview from reaching ready-for-decision until the criteria are
  // rewritten. Prior issues do not reach the model's next prompt, so the
  // description doubles as the instruction the operator relays; the
  // approval gate itself is untouched — the operator retains override.
  const flaggedCriteria = findSelfReferentialCriteria(draft.acceptanceCriteria);
  if (flaggedCriteria.length > 0 && openIssues.length < 50) {
    const flaggedIds = [...new Set(flaggedCriteria.map(({ entryId }) => entryId))];
    openIssues.push({
      id: randomUUID(),
      description:
        "[Workbench check] Self-referential acceptance criteria detected: " +
        flaggedIds.join(", ") +
        ". These verify what the brief says instead of what the product " +
        "does. Rewrite each listed criterion in place (same id) to " +
        "describe observable product behavior, with a verification a " +
        "tester performs by exercising the product — never by reading " +
        "the brief.",
      severity: "blocking",
      relatedEntryIds: flaggedIds,
    });
  }

  const repaired =
    remintedEntries.length > 0 ||
    removedReferences.length > 0 ||
    droppedQuestionIds.length > 0;

  return intakeTurnOutputSchema.parse({
    updatedBriefDraft: draft,
    nextQuestions,
    openIssues,
    reconciliation: repaired
      ? { remintedEntries, removedReferences, droppedQuestionIds }
      : null,
  });
}
