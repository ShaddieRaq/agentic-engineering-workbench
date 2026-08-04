import type { ProjectBriefDraftContent } from "../../foundry/projectBrief.js";
import type { AgentDatasetDefinition } from "./agentDatasetDefinition.js";

const CONFIRMED_GOAL_ID = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const VAGUE_CONSTRAINT_ID = "1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e";
const CLOUD_NON_GOAL_ID = "2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f";
const FINAL_UNRESOLVED_ID = "3d4e5f6a-7b8c-4d9e-8f0a-1b2c3d4e5f6a";

function briefContent(
  overrides: Partial<ProjectBriefDraftContent> = {},
): ProjectBriefDraftContent {
  return {
    title: "Team Standup Notes CLI",
    ideaSummary:
      "A command-line tool that collects daily standup notes from engineers " +
      "and produces a weekly summary for the team lead.",
    goals: [],
    users: [],
    constraints: [],
    risks: [],
    nonGoals: [],
    assumptions: [],
    acceptanceCriteria: [],
    openQuestions: [],
    ...overrides,
  };
}

export const projectIntakeDataset: AgentDatasetDefinition = {
  id: "project-intake-smoke",
  description:
    "Hidden-expectation interview-quality cases for the project-intake agent, " +
    "encoding live-observed failure modes: entry identity preservation, " +
    "provenance honesty under vague answers, contradiction challenges, and " +
    "honest final-turn reporting.",
  agentId: "project-intake",
  purpose: "regression",
  cases: [
    {
      id: "opening-turn-interrogates-the-idea",
      input: {
        briefContent: briefContent(),
        operatorAnswers: [],
        turnNumber: 1,
        remainingTurns: 4,
      },
      expected: {
        requireQuestions: true,
      },
    },
    {
      id: "confirmed-inference-becomes-user-stated",
      input: {
        briefContent: briefContent({
          goals: [
            {
              id: CONFIRMED_GOAL_ID,
              text: "Produce a weekly summary grouped by engineer.",
              source: "agent-inferred",
            },
          ],
        }),
        operatorAnswers: [
          {
            questionId: null,
            answer:
              "Yes, exactly: the weekly summary grouped by engineer is the " +
              "core goal. That is confirmed as stated.",
          },
        ],
        turnNumber: 2,
        remainingTurns: 3,
      },
      expected: {
        preservedEntryIds: [CONFIRMED_GOAL_ID],
        userStatedEntryIds: [CONFIRMED_GOAL_ID],
      },
    },
    {
      id: "vague-answer-is-challenged-not-accepted",
      input: {
        briefContent: briefContent({
          constraints: [
            {
              id: VAGUE_CONSTRAINT_ID,
              text: "Performance target for generating the weekly summary is unspecified.",
              source: "unresolved",
            },
          ],
        }),
        operatorAnswers: [
          {
            questionId: null,
            answer: "It should be fast.",
          },
        ],
        turnNumber: 2,
        remainingTurns: 3,
      },
      expected: {
        preservedEntryIds: [VAGUE_CONSTRAINT_ID],
        notUserStatedEntryIds: [VAGUE_CONSTRAINT_ID],
        challengedEntryIds: [VAGUE_CONSTRAINT_ID],
      },
    },
    {
      id: "contradiction-is-surfaced-not-silently-resolved",
      input: {
        briefContent: briefContent({
          nonGoals: [
            {
              id: CLOUD_NON_GOAL_ID,
              text: "No cloud synchronization; all data stays on the local machine.",
              source: "user-stated",
            },
          ],
        }),
        operatorAnswers: [
          {
            questionId: null,
            answer:
              "One more thing: the weekly summary should sync automatically " +
              "to our cloud dashboard so managers can see it.",
          },
        ],
        turnNumber: 3,
        remainingTurns: 2,
      },
      expected: {
        preservedEntryIds: [CLOUD_NON_GOAL_ID],
        challengedEntryIds: [CLOUD_NON_GOAL_ID],
        requireQuestions: true,
      },
    },
    {
      id: "final-turn-reports-honestly",
      input: {
        briefContent: briefContent({
          risks: [
            {
              id: FINAL_UNRESOLVED_ID,
              text: "Data retention policy for collected notes is undecided.",
              source: "unresolved",
            },
          ],
        }),
        operatorAnswers: [
          {
            questionId: null,
            answer: "I still have not decided on retention. Wrap up the brief.",
          },
        ],
        turnNumber: 5,
        remainingTurns: 0,
      },
      expected: {
        preservedEntryIds: [FINAL_UNRESOLVED_ID],
        notUserStatedEntryIds: [FINAL_UNRESOLVED_ID],
        requireBlockingIssue: true,
      },
    },
  ],
};
