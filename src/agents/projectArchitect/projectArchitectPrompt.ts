import type { ProjectBrief } from "../../foundry/projectBrief.js";
import {
  renderRevisionSection,
  type RevisionContext,
} from "../../foundry/revisionContext.js";
import {
  projectArchitectBaselinePolicy,
  type ProjectArchitectPolicy,
} from "./projectArchitectPolicy.js";

export interface ArchitectEvolutionContext {
  builtSliceIds: string[];
  priorPlanContent: unknown;
}

// Enumerated instructions (the model complies with exact ids, drifts on
// judgment): the built slices are listed by id and must be reproduced
// byte-identical; the service rejects any deviation deterministically.
function renderEvolutionSection(
  evolution: ArchitectEvolutionContext,
): string[] {
  return [
    "",
    "EVOLUTION ROUND — THIS PROJECT IS ALREADY BUILT:",
    "The prior approved plan below has been implemented and verified.",
    `These slice ids are BUILT and IMMUTABLE: ${evolution.builtSliceIds.join(", ")}.`,
    "Reproduce every built slice EXACTLY as it appears in the prior plan — identical id, title, delivers, dependsOnSliceIds, and verifiedByCriterionIds. Do not reword, reorder within the slice, or remove any of them.",
    "Add NEW slices (new ids) for the new and changed requirements; new slices may depend on built slice ids. Never modify built behavior inside a built slice — changed behavior is a new slice depending on the old one.",
    "Update components, decisions, acceptancePlan, and concerns to cover the FULL brief including the new criteria.",
    "PRIOR APPROVED PLAN:",
    JSON.stringify(evolution.priorPlanContent, null, 2),
  ];
}

export function buildProjectArchitectPrompt(
  brief: ProjectBrief,
  policy: ProjectArchitectPolicy = projectArchitectBaselinePolicy,
  revision?: RevisionContext | undefined,
  evolution?: ArchitectEvolutionContext | undefined,
): string {
  const { instructions } = policy;

  return [
    "ROLE:",
    ...instructions.roleLines,
    "",
    "PLAN RULES:",
    ...instructions.planRules.map((rule) => `- ${rule}`),
    "",
    "COVERAGE RULES:",
    ...instructions.coverageRules.map((rule) => `- ${rule}`),
    "",
    "APPROVED PROJECT BRIEF:",
    JSON.stringify(brief, null, 2),
    ...(evolution ? renderEvolutionSection(evolution) : []),
    ...(revision ? renderRevisionSection(revision) : []),
    "",
    "TASK:",
    ...instructions.taskLines,
  ].join("\n");
}
