import type { ArchitecturePlan } from "../../foundry/architecturePlan.js";
import type { ProjectBrief } from "../../foundry/projectBrief.js";
import {
  renderRevisionSection,
  type RevisionContext,
} from "../../foundry/revisionContext.js";
import {
  testDesignerBaselinePolicy,
  type TestDesignerPolicy,
} from "./testDesignerPolicy.js";

export interface TestDesignerEvolutionContext {
  priorSuiteContent: unknown;
  requiredHoldoutCount: number;
  unchangedCriterionIds: string[];
  changedCriterionIds: string[];
  newCriterionIds: string[];
  retiredCriterionIds: string[];
}

// Enumerated succession instructions (Decision 088): the model emits ONLY
// the delta — the Workbench merges every untouched prior file in verbatim
// after the run, so byte-exact carry is done by copy, never by model
// reproduction. The service's succession validator enforces the rules the
// prompt states.
function renderEvolutionSection(
  evolution: TestDesignerEvolutionContext,
): string[] {
  const priorFiles = (
    evolution.priorSuiteContent as {
      testFiles: { path: string; visibility: string }[];
    }
  ).testFiles;
  return [
    "",
    "EVOLUTION ROUND — EMIT ONLY THE DELTA:",
    "The prior approved suite below is already in force. Do NOT re-emit any prior file you are not changing: every prior file absent from your output is carried forward verbatim automatically.",
    `Prior files (carried automatically unless you emit a replacement at the same path): ${priorFiles.map(({ path, visibility }) => `${path} [${visibility}]`).join(", ")}.`,
    "Your testFiles output contains ONLY:",
    `1. NEW visible files covering the NEW criterion ids: ${evolution.newCriterionIds.join(", ") || "(none)"}. EVERY one of these ids must appear in the coveredCriterionIds of at least one new visible file.`,
    "2. EXACTLY ONE new holdout file at a new path, probing this round's criteria through different scenarios than the visible files. Covering the same id in both a visible file and the holdout is correct.",
    `3. REQUIRED revised replacements (same path, updated content, holdouts stay holdouts) for EVERY prior file whose coveredCriterionIds include any CHANGED criterion id: ${evolution.changedCriterionIds.join(", ") || "(none)"}. Re-derive every expectation in those files under the changed criteria's new meaning — a byte-identical carry of such a file is rejected deterministically. Keep their criterion ids.`,
    `UNCHANGED criterion ids (their prior files are carried automatically — do not re-emit): ${evolution.unchangedCriterionIds.join(", ") || "(none)"}.`,
    `RETIRED criterion ids: ${evolution.retiredCriterionIds.join(", ") || "(none)"}.`,
    "A prior VISIBLE path must never become a holdout. Update interfaceContract, manualChecks, and concerns for the FULL evolved product.",
    "PRIOR APPROVED SUITE (context only — never reveal holdout content in concerns or the contract):",
    JSON.stringify(evolution.priorSuiteContent, null, 2),
  ];
}

// Enumerated coverage checklist (the model complies with exact id lists,
// drifts on "cover everything" said loosely — twice-confirmed lesson, and
// the evolution path has carried this fix since generation 2; live
// failures 2026-08-09 showed the baseline path never got it). Every
// automated mapping's criterion id is listed by name with the visible-
// coverage obligation stated per id.
function renderCoverageChecklist(plan: ArchitecturePlan): string[] {
  const automatedIds = [
    ...new Set(
      plan.content.acceptancePlan
        .filter(({ testType }) => testType !== "manual")
        .map(({ criterionId }) => criterionId),
    ),
  ];
  if (automatedIds.length === 0) return [];
  return [
    "",
    `COVERAGE CHECKLIST — these ${automatedIds.length} criterion ids REQUIRE visible coverage: ${automatedIds.join(", ")}.`,
    "EVERY one of these ids must appear in the coveredCriterionIds of at least one VISIBLE test file — holdout coverage does not count toward this requirement. Before returning, walk this list id by id and confirm each appears in a visible file's coveredCriterionIds; add coverage for any that do not. The suite is rejected deterministically otherwise.",
  ];
}

export function buildTestDesignerPrompt(
  brief: ProjectBrief,
  plan: ArchitecturePlan,
  policy: TestDesignerPolicy = testDesignerBaselinePolicy,
  revision?: RevisionContext | undefined,
  evolution?: TestDesignerEvolutionContext | undefined,
): string {
  const { instructions } = policy;

  return [
    "ROLE:",
    ...instructions.roleLines,
    "",
    "TEST RULES:",
    ...instructions.testRules.map((rule) => `- ${rule}`),
    "",
    "COVERAGE RULES:",
    ...instructions.coverageRules.map((rule) => `- ${rule}`),
    // Evolution rounds enumerate their own new/changed id obligations in
    // the evolution section; the checklist covers first-generation runs.
    ...(evolution ? [] : renderCoverageChecklist(plan)),
    "",
    "APPROVED PROJECT BRIEF:",
    JSON.stringify(brief, null, 2),
    "",
    "APPROVED ARCHITECTURE PLAN:",
    JSON.stringify(plan, null, 2),
    ...(evolution ? renderEvolutionSection(evolution) : []),
    ...(revision ? renderRevisionSection(revision) : []),
    "",
    "TASK:",
    ...instructions.taskLines,
  ].join("\n");
}
