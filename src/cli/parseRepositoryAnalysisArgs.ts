export interface RepositoryAnalysisCliArgs {
  model: string;
  instruction?: string;
}

function optionalValue(
  args: string[],
  option: string,
): string | undefined {
  const index = args.indexOf(option);

  if (index === -1) return undefined;

  const value = args[index + 1];

  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${option}`);
  }

  return value;
}

export function parseRepositoryAnalysisArgs(
  args: string[],
): RepositoryAnalysisCliArgs {
  const instruction = optionalValue(args, "--instruction");

  return {
    model: optionalValue(args, "--model") ?? "gpt-5.4-mini",
    ...(instruction === undefined ? {} : { instruction }),
  };
}
