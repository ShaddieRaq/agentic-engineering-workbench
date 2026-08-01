export interface InspectPackageCliArgs {
  path: string;
  maxBytes: number;
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

export function parseInspectPackageArgs(
  args: string[],
): InspectPackageCliArgs {
  const maxBytes = optionalValue(args, "--max-bytes");

  return {
    path: optionalValue(args, "--path") ?? "package.json",
    maxBytes: maxBytes === undefined ? 65_536 : Number(maxBytes),
  };
}
