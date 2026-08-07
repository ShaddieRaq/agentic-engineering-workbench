import type { IntakeTurnInput } from "../../foundry/intakeTurnInput.js";
import {
  projectIntakeBaselinePolicy,
  type ProjectIntakePolicy,
} from "./projectIntakePolicy.js";

export function buildProjectIntakePrompt(
  input: IntakeTurnInput,
  policy: ProjectIntakePolicy = projectIntakeBaselinePolicy,
): string {
  const { instructions } = policy;

  return [
    "ROLE:",
    ...instructions.roleLines,
    "",
    "BRIEF RULES:",
    ...instructions.briefRules.map((rule) => `- ${rule}`),
    "",
    "QUESTION RULES:",
    ...instructions.questionRules.map((rule) => `- ${rule}`),
    `- This is turn ${input.turnNumber}; ${input.remainingTurns} turn(s) remain after this one.`,
    "",
    "CURRENT BRIEF CONTENT:",
    JSON.stringify(input.briefContent, null, 2),
    "",
    ...(input.standingAdvisories && input.standingAdvisories.length > 0
      ? [
          "STANDING ADVISORIES — open edges recorded in prior generations of this project:",
          ...input.standingAdvisories.map((advisory) => `- ${advisory}`),
          "For EACH standing advisory: either resolve it in this brief (add or rewrite an acceptance criterion carrying the missing decision) or ask the operator ONE question that decides it. Never silently drop one.",
          "",
        ]
      : []),
    "OPERATOR ANSWERS THIS TURN:",
    input.operatorAnswers.length === 0
      ? "None. This is the opening turn; interrogate the idea summary."
      : JSON.stringify(input.operatorAnswers, null, 2),
    "",
    "TASK:",
    ...instructions.taskLines,
  ].join("\n");
}
