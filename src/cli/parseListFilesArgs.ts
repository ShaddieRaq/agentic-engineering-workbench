export interface ListFilesCliArgs {
  path: string;
  maxEntries: number;
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

export function parseListFilesArgs(
  args: string[],
): ListFilesCliArgs {
  const maxEntries = optionalValue(args, "--max-entries");

  return {
    path: optionalValue(args, "--path") ?? ".",
    maxEntries: maxEntries === undefined ? 50 : Number(maxEntries),
  };
}
