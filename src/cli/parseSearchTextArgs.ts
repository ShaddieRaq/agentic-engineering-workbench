export interface SearchTextCliArgs {
  query: string;
  path: string;
  caseSensitive: boolean;
  maxMatches: number;
}

function requiredValue(args: string[], option: string): string {
  const index = args.indexOf(option);
  const value = index === -1 ? undefined : args[index + 1];

  if (!value || value.startsWith("--")) {
    throw new Error(`Missing required ${option} argument`);
  }

  return value;
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

export function parseSearchTextArgs(
  args: string[],
): SearchTextCliArgs {
  const maxMatches = optionalValue(args, "--max-matches");

  return {
    query: requiredValue(args, "--query"),
    path: optionalValue(args, "--path") ?? ".",
    caseSensitive: args.includes("--case-sensitive"),
    maxMatches:
      maxMatches === undefined ? 50 : Number(maxMatches),
  };
}
