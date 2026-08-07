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
    `3. OPTIONALLY, revised replacements (same path, updated content) for prior files covering the CHANGED criterion ids: ${evolution.changedCriterionIds.join(", ") || "(none)"}. Only revise a prior file when a changed criterion requires it; keep its criterion ids.`,
    `UNCHANGED criterion ids (their prior files are carried automatically — do not re-emit): ${evolution.unchangedCriterionIds.join(", ") || "(none)"}.`,
    `RETIRED criterion ids: ${evolution.retiredCriterionIds.join(", ") || "(none)"}.`,
    "A prior VISIBLE path must never become a holdout. Update interfaceContract, manualChecks, and concerns for the FULL evolved product.",
    "PRIOR APPROVED SUITE (context only — never reveal holdout content in concerns or the contract):",
    JSON.stringify(evolution.priorSuiteContent, null, 2),
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
