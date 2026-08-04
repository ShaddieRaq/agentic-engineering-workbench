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
    "OPERATOR ANSWERS THIS TURN:",
    input.operatorAnswers.length === 0
      ? "None. This is the opening turn; interrogate the idea summary."
      : JSON.stringify(input.operatorAnswers, null, 2),
    "",
    "TASK:",
    ...instructions.taskLines,
  ].join("\n");
}
