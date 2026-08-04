import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  assessProjectIntakeExpectation,
  projectIntakeExpectationSchema,
} from "../src/agents/projectIntake/projectIntakeExpectation.js";
import type { IntakeTurnOutput } from "../src/foundry/intakeTurnOutput.js";
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

function output(
  draft: Partial<ProjectBriefDraftContent> = {},
  turn: Partial<Pick<IntakeTurnOutput, "nextQuestions" | "openIssues">> = {},
): IntakeTurnOutput {
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
    reconciliation: null,
    ...turn,
  };
}

describe("projectIntakeExpectationSchema", () => {
  it("applies defaults and rejects unknown keys", () => {
    expect(projectIntakeExpectationSchema.parse({})).toEqual({
      preservedEntryIds: [],
      userStatedEntryIds: [],
      notUserStatedEntryIds: [],
      challengedEntryIds: [],
      requireQuestions: false,
      requireBlockingIssue: false,
    });
    expect(() =>
      projectIntakeExpectationSchema.parse({ surprise: true }),
    ).toThrowError();
  });
});

describe("assessProjectIntakeExpectation", () => {
  it("fails when a preserved entry was dropped", () => {
    const missingId = randomUUID();
    const result = assessProjectIntakeExpectation(output(), {
      preservedEntryIds: [missingId],
    });
    expect(result.passed).toBe(false);
    expect(result.message).toContain("dropped");
  });

  it("checks user-stated conversion", () => {
    const goal = entry({ source: "user-stated" });
    expect(
      assessProjectIntakeExpectation(output({ goals: [goal] }), {
        userStatedEntryIds: [goal.id],
      }).passed,
    ).toBe(true);

    const inferred = entry({ source: "agent-inferred" });
    const failed = assessProjectIntakeExpectation(output({ goals: [inferred] }), {
      userStatedEntryIds: [inferred.id],
    });
    expect(failed.passed).toBe(false);
    expect(failed.message).toContain("expected user-stated");
  });

  it("flags unconfirmed user-stated promotions", () => {
    const constraint = entry({ source: "user-stated" });
    const failed = assessProjectIntakeExpectation(
      output({ constraints: [constraint] }),
      { notUserStatedEntryIds: [constraint.id] },
    );
    expect(failed.passed).toBe(false);
    expect(failed.message).toContain("without operator confirmation");

    const honest = entry({ source: "unresolved" });
    expect(
      assessProjectIntakeExpectation(output({ constraints: [honest] }), {
        notUserStatedEntryIds: [honest.id],
      }).passed,
    ).toBe(true);
  });

  it("accepts any challenge form for challenged entries", () => {
    const viaSource = entry({ source: "unresolved" });
    expect(
      assessProjectIntakeExpectation(output({ risks: [viaSource] }), {
        challengedEntryIds: [viaSource.id],
      }).passed,
    ).toBe(true);

    const viaQuestion = entry({ source: "agent-inferred" });
    expect(
      assessProjectIntakeExpectation(
        output(
          { risks: [viaQuestion] },
          {
            nextQuestions: [
              {
                id: randomUUID(),
                question: "Is this risk acceptable?",
                targetEntryIds: [viaQuestion.id],
                intent: "confirm-inferred",
              },
            ],
          },
        ),
        { challengedEntryIds: [viaQuestion.id] },
      ).passed,
    ).toBe(true);

    const viaIssue = entry({ source: "agent-inferred" });
    expect(
      assessProjectIntakeExpectation(
        output(
          { risks: [viaIssue] },
          {
            openIssues: [
              {
                id: randomUUID(),
                description: "This risk conflicts with a stated non-goal.",
                severity: "blocking",
                relatedEntryIds: [viaIssue.id],
              },
            ],
          },
        ),
        { challengedEntryIds: [viaIssue.id] },
      ).passed,
    ).toBe(true);

    const viaOpenQuestion = entry({ source: "agent-inferred" });
    expect(
      assessProjectIntakeExpectation(
        output({
          risks: [viaOpenQuestion],
          openQuestions: [
            {
              id: randomUUID(),
              question: "How should this risk be mitigated?",
              relatedEntryIds: [viaOpenQuestion.id],
            },
          ],
        }),
        { challengedEntryIds: [viaOpenQuestion.id] },
      ).passed,
    ).toBe(true);

    const accepted = entry({ source: "user-stated" });
    const failed = assessProjectIntakeExpectation(output({ risks: [accepted] }), {
      challengedEntryIds: [accepted.id],
    });
    expect(failed.passed).toBe(false);
    expect(failed.message).toContain("accepted without a challenge");
  });

  it("enforces question and blocking-issue requirements", () => {
    expect(
      assessProjectIntakeExpectation(output(), { requireQuestions: true }).passed,
    ).toBe(false);
    expect(
      assessProjectIntakeExpectation(output(), { requireBlockingIssue: true })
        .passed,
    ).toBe(false);

    const satisfied = assessProjectIntakeExpectation(
      output(
        {},
        {
          nextQuestions: [
            {
              id: randomUUID(),
              question: "Who are the users?",
              targetEntryIds: [],
              intent: "elicit-new",
            },
          ],
          openIssues: [
            {
              id: randomUUID(),
              description: "Users are unknown.",
              severity: "blocking",
              relatedEntryIds: [],
            },
          ],
        },
      ),
      { requireQuestions: true, requireBlockingIssue: true },
    );
    expect(satisfied.passed).toBe(true);
  });

  it("rejects malformed expectations", () => {
    expect(() =>
      assessProjectIntakeExpectation(output(), { preservedEntryIds: ["not-a-uuid"] }),
    ).toThrowError();
  });
});
