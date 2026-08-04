import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { intakeTurnOutputSchema } from "../src/foundry/intakeTurnOutput.js";
import {
  briefContentOf,
  createInitialProjectBrief,
  type BriefEntry,
} from "../src/foundry/projectBrief.js";

function entry(overrides: Partial<BriefEntry> = {}): BriefEntry {
  return {
    id: randomUUID(),
    text: "Example entry",
    source: "agent-inferred",
    ...overrides,
  };
}

function draftWithGoal() {
  const goal = entry();
  const draft = briefContentOf(
    createInitialProjectBrief({
      title: "Recipe planner",
      ideaSummary: "Plan weekly meals from pantry contents.",
      goals: [goal],
    }),
  );
  return { draft, goal };
}

describe("intakeTurnOutputSchema", () => {
  it("accepts a valid turn output", () => {
    const { draft, goal } = draftWithGoal();
    const turn = intakeTurnOutputSchema.parse({
      updatedBriefDraft: draft,
      nextQuestions: [
        {
          id: randomUUID(),
          question: "Did I capture this goal correctly?",
          targetEntryIds: [goal.id],
          intent: "confirm-inferred",
        },
        {
          id: randomUUID(),
          question: "Who else uses the planner?",
          targetEntryIds: [],
          intent: "elicit-new",
        },
      ],
      openIssues: [
        {
          id: randomUUID(),
          description: "No acceptance criteria yet.",
          severity: "blocking",
          relatedEntryIds: [],
        },
      ],
    });

    expect(turn.nextQuestions).toHaveLength(2);
  });

  it("rejects a full versioned brief as the updated draft", () => {
    const { draft } = draftWithGoal();
    const fullBrief = createInitialProjectBrief({
      title: draft.title,
      ideaSummary: draft.ideaSummary,
    });

    expect(() =>
      intakeTurnOutputSchema.parse({
        updatedBriefDraft: fullBrief,
        nextQuestions: [],
        openIssues: [],
      }),
    ).toThrowError();
  });

  it("rejects a question that targets an unknown entry", () => {
    const { draft } = draftWithGoal();

    expect(() =>
      intakeTurnOutputSchema.parse({
        updatedBriefDraft: draft,
        nextQuestions: [
          {
            id: randomUUID(),
            question: "About that entry?",
            targetEntryIds: [randomUUID()],
            intent: "confirm-inferred",
          },
        ],
        openIssues: [],
      }),
    ).toThrowError(/unknown brief entry/i);
  });

  it("rejects a confirm-inferred question without targets", () => {
    const { draft } = draftWithGoal();

    expect(() =>
      intakeTurnOutputSchema.parse({
        updatedBriefDraft: draft,
        nextQuestions: [
          {
            id: randomUUID(),
            question: "Confirm what exactly?",
            targetEntryIds: [],
            intent: "confirm-inferred",
          },
        ],
        openIssues: [],
      }),
    ).toThrowError(/must target at least one brief entry/i);
  });

  it("rejects more than ten questions in one turn", () => {
    const { draft, goal } = draftWithGoal();
    const questions = Array.from({ length: 11 }, () => ({
      id: randomUUID(),
      question: "One of too many questions?",
      targetEntryIds: [goal.id],
      intent: "confirm-inferred" as const,
    }));

    expect(() =>
      intakeTurnOutputSchema.parse({
        updatedBriefDraft: draft,
        nextQuestions: questions,
        openIssues: [],
      }),
    ).toThrowError();
  });

  it("rejects an open issue that references an unknown entry", () => {
    const { draft } = draftWithGoal();

    expect(() =>
      intakeTurnOutputSchema.parse({
        updatedBriefDraft: draft,
        nextQuestions: [],
        openIssues: [
          {
            id: randomUUID(),
            description: "Issue about a ghost entry.",
            severity: "advisory",
            relatedEntryIds: [randomUUID()],
          },
        ],
      }),
    ).toThrowError(/unknown brief entry/i);
  });
});
