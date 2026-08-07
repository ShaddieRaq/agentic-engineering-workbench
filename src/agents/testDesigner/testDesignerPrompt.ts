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

// Enumerated succession instructions (Decision 088): exact criterion ids
// and an exact holdout count — the service rejects deviations
// deterministically, so the prompt states the rules the validator enforces.
function renderEvolutionSection(
  evolution: TestDesignerEvolutionContext,
): string[] {
  return [
    "",
    "EVOLUTION ROUND — THIS SUITE SUPERSEDES AN APPROVED SUITE:",
    `UNCHANGED criterion ids: ${evolution.unchangedCriterionIds.join(", ") || "(none)"}. Every prior file covering ONLY these ids must be reproduced byte-identical: same path, same content, same coveredCriterionIds, same testType.`,
    `CHANGED criterion ids: ${evolution.changedCriterionIds.join(", ") || "(none)"}. Prior files covering these may be revised IN PLACE at the same path; keep the criterion ids.`,
    `NEW criterion ids: ${evolution.newCriterionIds.join(", ") || "(none)"}. EVERY one of these ids must appear in the coveredCriterionIds of at least one NEW file whose visibility is "visible". Carried files cover only their original criteria; the new holdout adds hidden coverage on top and NEVER substitutes for visible coverage.`,
    `RETIRED criterion ids: ${evolution.retiredCriterionIds.join(", ") || "(none)"}. Files covering only retired criteria are omitted.`,
    "A prior holdout file stays a holdout unless deliberately promoted to visible; a prior VISIBLE path must never become a holdout.",
    "Covering the same criterion id in BOTH a visible file and the holdout is correct and expected — the holdout probes the same criteria through different scenarios. A criterion covered only by the holdout FAILS validation.",
    `The suite must contain EXACTLY ${evolution.requiredHoldoutCount} holdout file(s): every retained prior holdout plus exactly one NEW holdout for this round.`,
    "PRIOR APPROVED SUITE (including holdout content — never reveal holdout content in concerns or the contract):",
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
