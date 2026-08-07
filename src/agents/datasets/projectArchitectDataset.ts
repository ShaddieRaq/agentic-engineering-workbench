import type { ProjectBrief } from "../../foundry/projectBrief.js";
import type { AgentDatasetDefinition } from "./agentDatasetDefinition.js";

const FIXED_CREATED_AT = "2026-08-05T00:00:00.000Z";

const CLEAN_CRITERIA = [
  "11111111-1111-4111-8111-111111111101",
  "11111111-1111-4111-8111-111111111102",
  "11111111-1111-4111-8111-111111111103",
];
const OFFLINE_CONSTRAINT_ID = "22222222-2222-4222-8222-222222222201";
const SYNC_GOAL_ID = "33333333-3333-4333-8333-333333333301";
const BOUNDED_CRITERIA = [
  "44444444-4444-4444-8444-444444444401",
  "44444444-4444-4444-8444-444444444402",
  "44444444-4444-4444-8444-444444444403",
  "44444444-4444-4444-8444-444444444404",
];

function baseBrief(overrides: {
  briefId: string;
  title: string;
  ideaSummary: string;
  goals?: ProjectBrief["goals"];
  constraints?: ProjectBrief["constraints"];
  acceptanceCriteria?: ProjectBrief["acceptanceCriteria"];
}): ProjectBrief {
  return {
    briefId: overrides.briefId,
    version: 1,
    title: overrides.title,
    ideaSummary: overrides.ideaSummary,
    goals: overrides.goals ?? [],
    users: [],
    constraints: overrides.constraints ?? [],
    risks: [],
    nonGoals: [],
    assumptions: [],
    acceptanceCriteria: overrides.acceptanceCriteria ?? [],
    openQuestions: [],
    previousVersionArtifactId: null,
    previousVersionDigest: null,
    createdAt: FIXED_CREATED_AT,
  };
}

const cleanBrief = baseBrief({
  briefId: "aaaaaaa1-0000-4000-8000-00000000000a",
  title: "Note Snippet CLI",
  ideaSummary:
    "A command-line tool that saves short text snippets with tags, lists " +
    "them by tag, and copies a chosen snippet to the clipboard.",
  goals: [
    {
      id: "aaaaaaa1-0000-4000-8000-00000000001a",
      text: "Save, tag, list, and copy short text snippets from the terminal.",
      source: "user-stated",
    },
  ],
  acceptanceCriteria: [
    {
      id: CLEAN_CRITERIA[0]!,
      text: "A saved snippet can be listed by any of its tags.",
      source: "user-stated",
      verification:
        "Save snippets with known tags in a fixture and assert tag-filtered listings match exactly.",
    },
    {
      id: CLEAN_CRITERIA[1]!,
      text: "Copying a snippet places its exact text on the clipboard.",
      source: "user-stated",
      verification:
        "Copy a fixture snippet and compare clipboard contents byte-for-byte.",
    },
    {
      id: CLEAN_CRITERIA[2]!,
      text: "Snippets persist across separate CLI invocations.",
      source: "user-stated",
      verification:
        "Save in one process, list in a new process, and assert the snippet is present.",
    },
  ],
});

const constraintBrief = baseBrief({
  briefId: "bbbbbbb1-0000-4000-8000-00000000000b",
  title: "Field Inspection Logger",
  ideaSummary:
    "A tool for logging equipment inspections at remote sites and producing " +
    "a summary report.",
  goals: [
    {
      id: "bbbbbbb1-0000-4000-8000-00000000001b",
      text: "Record inspections with timestamps and produce a summary report.",
      source: "user-stated",
    },
  ],
  constraints: [
    {
      id: OFFLINE_CONSTRAINT_ID,
      text: "The tool must work fully offline with no network access of any kind.",
      source: "user-stated",
    },
  ],
  acceptanceCriteria: [
    {
      id: "bbbbbbb1-0000-4000-8000-00000000002b",
      text: "Inspections recorded without connectivity are complete and correct.",
      source: "user-stated",
      verification:
        "Run the recording flow with networking disabled and verify the stored inspection data.",
    },
  ],
});

const contradictoryBrief = baseBrief({
  briefId: "ccccccc1-0000-4000-8000-00000000000c",
  title: "Site Telemetry Notebook",
  ideaSummary:
    "A notebook app for technicians that records readings during site visits.",
  goals: [
    {
      id: SYNC_GOAL_ID,
      text: "Stream every recorded reading to the team's cloud dashboard in real time as it is captured.",
      source: "user-stated",
    },
  ],
  constraints: [
    {
      id: OFFLINE_CONSTRAINT_ID,
      text: "The app must operate entirely offline and must never open a network connection.",
      source: "user-stated",
    },
  ],
  acceptanceCriteria: [
    {
      id: "ccccccc1-0000-4000-8000-00000000002c",
      text: "Readings captured during a visit are stored without loss.",
      source: "user-stated",
      verification:
        "Capture a fixture set of readings and verify all are stored with correct values.",
    },
  ],
});

const boundedBrief = baseBrief({
  briefId: "ddddddd1-0000-4000-8000-00000000000d",
  title: "Reading List Manager",
  ideaSummary:
    "A CLI that manages a personal reading list: adding books, tracking " +
    "progress, rating finished books, and exporting a yearly summary.",
  goals: [
    {
      id: "ddddddd1-0000-4000-8000-00000000001d",
      text: "Manage a reading list across adding, progress, rating, and export workflows.",
      source: "user-stated",
    },
  ],
  acceptanceCriteria: [
    {
      id: BOUNDED_CRITERIA[0]!,
      text: "A book can be added with title and author.",
      source: "user-stated",
      verification: "Add fixture books and assert the stored fields match.",
    },
    {
      id: BOUNDED_CRITERIA[1]!,
      text: "Reading progress updates persist as page numbers.",
      source: "user-stated",
      verification:
        "Update progress across invocations and assert persisted page numbers.",
    },
    {
      id: BOUNDED_CRITERIA[2]!,
      text: "A finished book can be rated from one to five.",
      source: "user-stated",
      verification:
        "Rate fixture books at the boundaries and assert stored ratings and rejection outside the range.",
    },
    {
      id: BOUNDED_CRITERIA[3]!,
      text: "A yearly summary export lists finished books with ratings.",
      source: "user-stated",
      verification:
        "Export a fixture year and compare the summary against the expected list.",
    },
  ],
});

export const projectArchitectDataset: AgentDatasetDefinition = {
  id: "project-architect-smoke",
  description:
    "Hidden-expectation architecture-judgment cases for the project-architect " +
    "agent: honest blocking concerns on contradictory briefs, no false alarms " +
    "on clean briefs, constraint traceability into decisions, independent " +
    "verification, and bounded slicing. Structural coverage is enforced at " +
    "runtime and graded by run success.",
  agentId: "project-architect",
  purpose: "regression",
  cases: [
    {
      id: "clean-brief-plans-without-alarms",
      input: { brief: cleanBrief },
      expected: {
        forbidBlockingConcerns: true,
        minimumSlices: 2,
        requireIndependentVerificationForCriterionIds: CLEAN_CRITERIA,
      },
    },
    {
      // Live defect, observed twice (habit tracker; Mac Librarian plan
      // 22969605): every acceptance mapping set to manual on a brief whose
      // criteria are plainly automatable CLI behavior, silently exempting
      // the criteria from the governed build's verification.
      id: "behavioral-criteria-map-to-automated-tests",
      input: { brief: cleanBrief },
      expected: {
        forbidBlockingConcerns: true,
        requireAutomatedMappingForCriterionIds: CLEAN_CRITERIA,
      },
    },
    {
      id: "constraint-traceability",
      input: { brief: constraintBrief },
      expected: {
        forbidBlockingConcerns: true,
        requireDecisionCitingEntryIds: [OFFLINE_CONSTRAINT_ID],
      },
    },
    {
      id: "contradictory-brief-flags-blocking",
      input: { brief: contradictoryBrief },
      expected: {
        requireBlockingConcern: true,
        requireConcernReferencingEntryIds: [OFFLINE_CONSTRAINT_ID],
      },
    },
    {
      id: "multi-feature-boundedness",
      input: { brief: boundedBrief },
      expected: {
        forbidBlockingConcerns: true,
        minimumSlices: 3,
      },
    },
  ],
};
