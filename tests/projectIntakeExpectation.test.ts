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
      forbidQuestions: false,
      removedOpenQuestionIds: [],
      forbidSelfReferentialCriteria: false,
      requireAcceptanceCriteria: false,
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

  it("enforces closure when the operator declares answers final", () => {
    const staleQuestionId = randomUUID();

    // Asking anything after "final" fails.
    const asked = assessProjectIntakeExpectation(
      output(
        {},
        {
          nextQuestions: [
            {
              id: randomUUID(),
              question: "But which exact channels?",
              targetEntryIds: [],
              intent: "confirm-inferred",
            },
          ],
        },
      ),
      { forbidQuestions: true },
    );
    expect(asked.passed).toBe(false);
    expect(asked.message).toMatch(/after the operator declared the answers final/);

    // Leaving an answered open question in the draft fails.
    const stale = assessProjectIntakeExpectation(
      output({
        openQuestions: [
          {
            id: staleQuestionId,
            question: "Which channels are in scope?",
            relatedEntryIds: [],
          },
        ],
      }),
      { removedOpenQuestionIds: [staleQuestionId] },
    );
    expect(stale.passed).toBe(false);
    expect(stale.message).toMatch(/remains in the brief draft/);

    // A clean closing turn passes both.
    const closed = assessProjectIntakeExpectation(output(), {
      forbidQuestions: true,
      removedOpenQuestionIds: [staleQuestionId],
    });
    expect(closed.passed).toBe(true);
  });

  it("enforces behavioral acceptance criteria", () => {
    // No criteria at all fails the presence requirement.
    const empty = assessProjectIntakeExpectation(output(), {
      requireAcceptanceCriteria: true,
    });
    expect(empty.passed).toBe(false);
    expect(empty.message).toMatch(/at least one acceptance criterion/);

    // Self-referential criteria fail with the entry id and matched text
    // enumerated (the message is the improvement analyst's evidence).
    const docCriterion = {
      id: randomUUID(),
      text: "The brief states that the tool collects notes from the engineering channel.",
      source: "agent-inferred" as const,
      verification: "An independent tester can read the brief and confirm the scope.",
    };
    const selfReferential = assessProjectIntakeExpectation(
      output({ acceptanceCriteria: [docCriterion] }),
      { forbidSelfReferentialCriteria: true, requireAcceptanceCriteria: true },
    );
    expect(selfReferential.passed).toBe(false);
    expect(selfReferential.message).toContain(docCriterion.id);
    expect(selfReferential.message).toMatch(/observable product behavior/);

    // Behavioral criteria pass both checks.
    const behavioral = assessProjectIntakeExpectation(
      output({
        acceptanceCriteria: [
          {
            id: randomUUID(),
            text: "The tool collects notes only from the engineering channel.",
            source: "user-stated" as const,
            verification:
              "A tester runs the tool and confirms only engineering-channel messages are collected.",
          },
        ],
      }),
      { forbidSelfReferentialCriteria: true, requireAcceptanceCriteria: true },
    );
    expect(behavioral.passed).toBe(true);
  });

  it("rejects malformed expectations", () => {
    expect(() =>
      assessProjectIntakeExpectation(output(), { preservedEntryIds: ["not-a-uuid"] }),
    ).toThrowError();
  });
});
