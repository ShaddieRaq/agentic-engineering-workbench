import type { ArchitecturePlan } from "../../foundry/architecturePlan.js";
import type { ProjectBrief } from "../../foundry/projectBrief.js";
import {
  testDesignerBaselinePolicy,
  type TestDesignerPolicy,
} from "./testDesignerPolicy.js";

export function buildTestDesignerPrompt(
  brief: ProjectBrief,
  plan: ArchitecturePlan,
  policy: TestDesignerPolicy = testDesignerBaselinePolicy,
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
    "",
    "TASK:",
    ...instructions.taskLines,
  ].join("\n");
}
