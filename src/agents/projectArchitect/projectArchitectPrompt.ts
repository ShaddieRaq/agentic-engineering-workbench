import type { ProjectBrief } from "../../foundry/projectBrief.js";
import {
  projectArchitectBaselinePolicy,
  type ProjectArchitectPolicy,
} from "./projectArchitectPolicy.js";

export function buildProjectArchitectPrompt(
  brief: ProjectBrief,
  policy: ProjectArchitectPolicy = projectArchitectBaselinePolicy,
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
    "",
    "TASK:",
    ...instructions.taskLines,
  ].join("\n");
}
