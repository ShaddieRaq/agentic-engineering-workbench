export interface ReadFileCliArgs {
  path: string;
  maxBytes: number;
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

export function parseReadFileArgs(args: string[]): ReadFileCliArgs {
  const maxBytes = optionalValue(args, "--max-bytes");

  return {
    path: requiredValue(args, "--path"),
    maxBytes: maxBytes === undefined ? 32_768 : Number(maxBytes),
  };
}
