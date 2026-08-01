import { parseExecutionOptions } from "../orchestration/executionPolicy.js";
import {
  scenarioDatasetExperimentDefinitionSchema,
  type ScenarioDatasetExperimentDefinition,
} from "../experiments/scenarioDatasetExperimentDefinition.js";

function requiredOption(args: string[], option: string): string {
  const index = args.indexOf(option);
  const value = index === -1 ? undefined : args[index + 1];

  if (!value || value.startsWith("--")) {
    throw new Error(`Missing required ${option} argument`);
  }

  return value;
}

function optionalOption(
  args: string[],
  option: string,
): string | undefined {
  const index = args.indexOf(option);

  if (index === -1) {
    return undefined;
  }

  const value = args[index + 1];

  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${option}`);
  }

  return value;
}

export function parseExperimentArgs(
  args: string[],
): ScenarioDatasetExperimentDefinition {
  const repetitions = optionalOption(args, "--repetitions");
  const concurrency = optionalOption(args, "--concurrency");
  const execution = parseExecutionOptions({
    ...(repetitions
      ? { repetitions: Number(repetitions) }
      : {}),
    ...(concurrency ? { concurrency: Number(concurrency) } : {}),
  });

  return scenarioDatasetExperimentDefinitionSchema.parse({
    id: optionalOption(args, "--experiment") ?? "role-comparison",
    datasetId: requiredOption(args, "--dataset"),
    harnessId:
      optionalOption(args, "--harness") ?? "technical-coach",
    baseline: {
      id: "baseline",
      rolePath: requiredOption(args, "--baseline-role"),
    },
    candidate: {
      id: "candidate",
      rolePath: requiredOption(args, "--candidate-role"),
    },
    execution,
  });
}
