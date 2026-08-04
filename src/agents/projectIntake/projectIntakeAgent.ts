import {
  intakeTurnInputSchema,
  type IntakeTurnInput,
} from "../../foundry/intakeTurnInput.js";
import {
  intakeTurnOutputSchema,
  type IntakeTurnOutput,
} from "../../foundry/intakeTurnOutput.js";
import { defineAgent } from "../agentRegistration.js";
import { assessProjectIntakeExpectation } from "./projectIntakeExpectation.js";
import { buildProjectIntakePrompt } from "./projectIntakePrompt.js";

export const projectIntakeAgent = defineAgent<IntakeTurnInput, IntakeTurnOutput>({
  manifest: {
    id: "project-intake",
    name: "Project Intake",
    version: "0.1.0",
    status: "experimental",
    description:
      "Interviews a software idea into a decision-ready project brief through " +
      "controller-driven single-shot turns.",
    owner: "local-platform",
    tags: ["foundry", "intake"],
    defaultModel: "gpt-5.4-mini",
    components: {
      workflowIds: [],
      harnessIds: [],
      scenarioIds: [],
      datasetIds: [],
    },
    permissions: { toolIds: [] },
    verification: {
      datasetIds: ["project-intake-smoke"],
      minimumPassRate: 1,
    },
  },
  inputSchema: intakeTurnInputSchema,
  outputSchema: intakeTurnOutputSchema,
  async execute(input, services) {
    const result = await services.provider.generate({
      prompt: buildProjectIntakePrompt(input),
      outputSchema: intakeTurnOutputSchema,
    });

    if (result.refusal !== null) {
      throw new Error(`Provider refused the intake turn: ${result.refusal}`);
    }
    if (result.parsedOutput === null) {
      throw new Error(
        `Provider returned no parsable intake turn output: ${result.rawOutput}`,
      );
    }

    return result.parsedOutput;
  },
  // Blocking issues without questions are legitimate on the final budgeted
  // turn, and assess cannot see remainingTurns, so it only summarizes.
  assess(output) {
    const blockingIssues = output.openIssues.filter(
      ({ severity }) => severity === "blocking",
    ).length;

    return {
      passed: true,
      message:
        `Turn produced ${output.nextQuestions.length} question(s) and ` +
        `${blockingIssues} blocking issue(s).`,
    };
  },
  assessDatasetCase(_input, output, expected) {
    return assessProjectIntakeExpectation(output, expected);
  },
});
