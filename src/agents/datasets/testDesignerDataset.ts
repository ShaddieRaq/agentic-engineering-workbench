import type { ArchitecturePlan } from "../../foundry/architecturePlan.js";
import type { ProjectBrief } from "../../foundry/projectBrief.js";
import type { AgentDatasetDefinition } from "./agentDatasetDefinition.js";

// Hidden-expectation cases for the test designer, built from the two
// recorded live defects on the Mac Librarian chain: a suite whose files
// audited the brief document instead of exercising the product (suite
// 0de1fe65: zero CLI spawns, assertions on brief JSON), and a suite with
// no holdout file. The fixture chain is a small CLI in the same domain as
// the architect dataset so the two agents' regressions stay comparable.

const FIXED_CREATED_AT = "2026-08-07T00:00:00.000Z";
const FIXED_DIGEST = "a".repeat(64);

const BRIEF_ID = "eeeeeee1-0000-4000-8000-00000000000e";
const CRITERIA = [
  "eeeeeee1-0000-4000-8000-00000000010e",
  "eeeeeee1-0000-4000-8000-00000000020e",
  "eeeeeee1-0000-4000-8000-00000000030e",
];
const COMPONENT_ID = "eeeeeee1-0000-4000-8000-00000000040e";
const SLICE_IDS = [
  "eeeeeee1-0000-4000-8000-00000000050e",
  "eeeeeee1-0000-4000-8000-00000000060e",
];

const brief: ProjectBrief = {
  briefId: BRIEF_ID,
  version: 1,
  title: "Note Snippet CLI",
  ideaSummary:
    "A command-line tool that saves short text snippets with tags, lists " +
    "them by tag, and copies a chosen snippet to the clipboard.",
  goals: [],
  users: [],
  constraints: [],
  risks: [],
  nonGoals: [],
  assumptions: [],
  acceptanceCriteria: [
    {
      id: CRITERIA[0]!,
      text: "Saving a snippet with tags stores it and exits with code 0.",
      source: "user-stated",
      verification:
        "A tester runs the save command with a snippet and tags, then " +
        "confirms exit code 0 and that the snippet appears in a " +
        "subsequent list.",
    },
    {
      id: CRITERIA[1]!,
      text: "Listing by tag prints only snippets carrying that tag.",
      source: "user-stated",
      verification:
        "A tester saves snippets with distinct tags, runs list with one " +
        "tag, and confirms only matching snippets are printed.",
    },
    {
      id: CRITERIA[2]!,
      text: "Deleting a snippet by id removes it from later listings.",
      source: "user-stated",
      verification:
        "A tester deletes a saved snippet by id and confirms it no " +
        "longer appears in any listing and the exit code is 0.",
    },
  ],
  openQuestions: [],
  previousVersionArtifactId: null,
  previousVersionDigest: null,
  createdAt: FIXED_CREATED_AT,
};

// Typed via satisfies so the JSON-valued dataset input accepts it: the
// ArchitecturePlan type's optional revision-lineage fields are incompatible
// with the strict JSON index signature when declared as the named type.
const plan = {
  planId: "eeeeeee1-0000-4000-8000-00000000070e",
  briefId: BRIEF_ID,
  briefVersion: 1,
  briefArtifactId: "brief-artifact-fixture",
  briefDigest: FIXED_DIGEST,
  agentRunArtifactId: null,
  content: {
    overview:
      "A single-process CLI with a JSON storage file; commands save, " +
      "list, and delete operate on it and print human-readable output.",
    components: [
      {
        id: COMPONENT_ID,
        name: "Snippet CLI",
        responsibility:
          "Parses commands, stores snippets in a JSON file, and prints " +
          "listings filtered by tag.",
        dependsOnComponentIds: [],
      },
    ],
    decisions: [],
    acceptancePlan: CRITERIA.map((criterionId) => ({
      criterionId,
      testType: "integration" as const,
      verificationApproach:
        "Spawn the CLI as a subprocess against a temp storage file and " +
        "assert on stdout and exit codes.",
      independentOfImplementation: true,
    })),
    implementationSlices: [
      {
        id: SLICE_IDS[0]!,
        title: "Save and list snippets",
        delivers: "Working save and tag-filtered list commands.",
        dependsOnSliceIds: [],
        verifiedByCriterionIds: [CRITERIA[0]!, CRITERIA[1]!],
      },
      {
        id: SLICE_IDS[1]!,
        title: "Delete snippets",
        delivers: "Deletion by id reflected in listings.",
        dependsOnSliceIds: [SLICE_IDS[0]!],
        verifiedByCriterionIds: [CRITERIA[2]!],
      },
    ],
    concerns: [],
  },
  reconciliation: null,
  createdAt: FIXED_CREATED_AT,
} satisfies ArchitecturePlan;

export const testDesignerDataset: AgentDatasetDefinition = {
  id: "test-designer-smoke",
  description:
    "Hidden-expectation suite-quality cases for the test designer, " +
    "encoding live-observed failure modes: document-auditing tests that " +
    "never spawn the product, and suites shipped without a holdout file.",
  agentId: "test-designer",
  purpose: "regression",
  cases: [
    {
      id: "suite-exercises-the-product-with-a-holdout",
      input: { brief, plan },
      expected: {
        requireProductExercise: true,
        forbidArtifactReads: true,
        requireHoldoutCount: 1,
        requireVisibleCoverageForCriterionIds: CRITERIA,
      },
    },
  ],
};
