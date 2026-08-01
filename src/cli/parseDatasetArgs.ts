import {
  parseExecutionOptions,
  type ResolvedExecutionOptions,
} from "../orchestration/executionPolicy.js";

export interface DatasetCliArgs extends ResolvedExecutionOptions {
  datasetId: string;
  rolePath: string;
  harnessId: string;
}

function readRequiredOption(
  args: string[],
  option: string,
): string {
  const index = args.indexOf(option);
  const value = index === -1 ? undefined : args[index + 1];

  if (!value || value.startsWith("--")) {
    throw new Error(`Missing required ${option} argument`);
  }

  return value;
}

function readOptionalOption(
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

export function parseDatasetArgs(args: string[]): DatasetCliArgs {
  const datasetId = readRequiredOption(args, "--dataset");
  const rolePath = readRequiredOption(args, "--role");
  const harnessId =
    readOptionalOption(args, "--harness") ?? "technical-coach";
  const repetitionsValue = readOptionalOption(
    args,
    "--repetitions",
  );
  const concurrencyValue = readOptionalOption(
    args,
    "--concurrency",
  );
  const executionOptions = parseExecutionOptions({
    ...(repetitionsValue
      ? { repetitions: Number(repetitionsValue) }
      : {}),
    ...(concurrencyValue
      ? { concurrency: Number(concurrencyValue) }
      : {}),
  });

  return {
    datasetId,
    rolePath,
    harnessId,
    ...executionOptions,
  };
}
