export interface InspectGitDiffCliArgs {
  mode: "working-tree" | "staged";
  contextLines: number;
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

export function parseInspectGitDiffArgs(
  args: string[],
): InspectGitDiffCliArgs {
  const mode = optionalValue(args, "--mode") ?? "working-tree";
  const contextLines = optionalValue(args, "--context-lines");
  const maxBytes = optionalValue(args, "--max-bytes");

  if (mode !== "working-tree" && mode !== "staged") {
    throw new Error("--mode must be working-tree or staged");
  }

  return {
    mode,
    contextLines: contextLines === undefined ? 3 : Number(contextLines),
    maxBytes: maxBytes === undefined ? 65_536 : Number(maxBytes),
  };
}
