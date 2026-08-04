import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { reconcileIntakeTurnOutput } from "../src/foundry/intakeReconciliation.js";
import type { IntakeTurnModelOutput } from "../src/foundry/intakeTurnOutput.js";
import type {
  BriefEntry,
  ProjectBriefDraftContent,
} from "../src/foundry/projectBrief.js";

function entry(overrides: Partial<BriefEntry> = {}): BriefEntry {
  return {
    id: randomUUID(),
    text: "Example entry",
    source: "agent-inferred",
    ...overrides,
  };
}

function modelOutput(
  draft: Partial<ProjectBriefDraftContent> = {},
  turn: Partial<Pick<IntakeTurnModelOutput, "nextQuestions" | "openIssues">> = {},
): IntakeTurnModelOutput {
  return {
    updatedBriefDraft: {
      title: "Example",
      ideaSummary: "An example idea.",
      goals: [],
      users: [],
      constraints: [],
      risks: [],
      nonGoals: [],
      assumptions: [],
      acceptanceCriteria: [],
      openQuestions: [],
      ...draft,
    },
    nextQuestions: [],
    openIssues: [],
    ...turn,
  };
}

describe("reconcileIntakeTurnOutput", () => {
  it("passes clean output through untouched with null reconciliation", () => {
    const goal = entry();
    const output = reconcileIntakeTurnOutput(
      modelOutput(
        { goals: [goal] },
        {
          nextQuestions: [
            {
              id: randomUUID(),
              question: "Is this goal right?",
              targetEntryIds: [goal.id],
              intent: "confirm-inferred",
            },
          ],
        },
      ),
    );

    expect(output.reconciliation).toBeNull();
    expect(output.updatedBriefDraft.goals[0]).toEqual(goal);
    expect(output.nextQuestions).toHaveLength(1);
  });

  it("re-mints later duplicate ids while the first occurrence keeps its identity", () => {
    const original = entry({ source: "user-stated" });
    const output = reconcileIntakeTurnOutput(
      modelOutput({
        nonGoals: [original],
        goals: [{ id: original.id, text: "Copied entry", source: "agent-inferred" }],
      }),
    );

    // goals section is walked before nonGoals, so the goals copy keeps the id.
    expect(output.updatedBriefDraft.goals[0]!.id).toBe(original.id);
    expect(output.updatedBriefDraft.nonGoals[0]!.id).not.toBe(original.id);
    expect(output.reconciliation?.remintedEntries).toEqual([
      {
        originalId: original.id,
        mintedId: output.updatedBriefDraft.nonGoals[0]!.id,
        section: "nonGoals",
      },
    ]);
  });

  it("keeps references valid when a referenced id was duplicated", () => {
    const original = entry();
    const output = reconcileIntakeTurnOutput(
      modelOutput(
        {
          goals: [original],
          risks: [{ id: original.id, text: "Duplicate risk", source: "unresolved" }],
        },
        {
          nextQuestions: [
            {
              id: randomUUID(),
              question: "About the original goal?",
              targetEntryIds: [original.id],
              intent: "confirm-inferred",
            },
          ],
        },
      ),
    );

    expect(output.nextQuestions[0]!.targetEntryIds).toEqual([original.id]);
    expect(output.reconciliation?.removedReferences).toEqual([]);
  });

  it("re-mints duplicate open question ids", () => {
    const goal = entry();
    const output = reconcileIntakeTurnOutput(
      modelOutput({
        goals: [goal],
        openQuestions: [
          { id: goal.id, question: "Shares the goal id?", relatedEntryIds: [goal.id] },
        ],
      }),
    );

    expect(output.updatedBriefDraft.openQuestions[0]!.id).not.toBe(goal.id);
    expect(output.reconciliation?.remintedEntries[0]).toMatchObject({
      originalId: goal.id,
      section: "openQuestions",
    });
  });

  it("filters dangling references and records each removal", () => {
    const goal = entry();
    const ghostId = randomUUID();
    const questionId = randomUUID();
    const issueId = randomUUID();
    const openQuestionId = randomUUID();

    const output = reconcileIntakeTurnOutput(
      modelOutput(
        {
          goals: [goal],
          openQuestions: [
            {
              id: openQuestionId,
              question: "Related to a ghost?",
              relatedEntryIds: [goal.id, ghostId],
            },
          ],
        },
        {
          nextQuestions: [
            {
              id: questionId,
              question: "Targets a ghost too?",
              targetEntryIds: [goal.id, ghostId],
              intent: "confirm-inferred",
            },
          ],
          openIssues: [
            {
              id: issueId,
              description: "Issue citing a ghost.",
              severity: "advisory",
              relatedEntryIds: [ghostId],
            },
          ],
        },
      ),
    );

    expect(output.updatedBriefDraft.openQuestions[0]!.relatedEntryIds).toEqual([
      goal.id,
    ]);
    expect(output.nextQuestions[0]!.targetEntryIds).toEqual([goal.id]);
    expect(output.openIssues[0]!.relatedEntryIds).toEqual([]);
    expect(output.reconciliation?.removedReferences).toEqual(
      expect.arrayContaining([
        { context: "openQuestions", ownerId: openQuestionId, removedId: ghostId },
        { context: "nextQuestions", ownerId: questionId, removedId: ghostId },
        { context: "openIssues", ownerId: issueId, removedId: ghostId },
      ]),
    );
  });

  it("drops targeted questions that lose all targets but keeps elicit-new", () => {
    const ghostId = randomUUID();
    const droppedId = randomUUID();
    const keptId = randomUUID();

    const output = reconcileIntakeTurnOutput(
      modelOutput(
        {},
        {
          nextQuestions: [
            {
              id: droppedId,
              question: "Confirm a ghost entry?",
              targetEntryIds: [ghostId],
              intent: "confirm-inferred",
            },
            {
              id: keptId,
              question: "Anything else to add?",
              targetEntryIds: [],
              intent: "elicit-new",
            },
          ],
        },
      ),
    );

    expect(output.nextQuestions.map(({ id }) => id)).toEqual([keptId]);
    expect(output.reconciliation?.droppedQuestionIds).toEqual([droppedId]);
  });

  it("still throws when the output is irreparable", () => {
    const bad = modelOutput();
    bad.updatedBriefDraft.title = "";

    expect(() => reconcileIntakeTurnOutput(bad)).toThrowError();
  });
});
