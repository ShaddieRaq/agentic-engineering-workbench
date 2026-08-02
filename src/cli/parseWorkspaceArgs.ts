export type WorkspaceCliArgs =
  | { command: "list" }
  | { command: "add"; id: string; rootPath: string; name: string | null }
  | { command: "remove"; id: string };

function required(args: string[], index: number, label: string): string {
  const value = args[index];
  if (!value || value.startsWith("--")) throw new Error(`Missing required ${label}.`);
  return value;
}

function option(args: string[], name: string): string | null {
  const index = args.indexOf(name);
  if (index === -1) return null;
  return required(args, index + 1, `${name} value`);
}

function requiredOption(args: string[], name: string): string {
  const value = option(args, name);
  if (value === null) throw new Error(`Missing required ${name} value.`);
  return value;
}

export function parseWorkspaceArgs(args: string[]): WorkspaceCliArgs {
  if (args[0] === "list") return { command: "list" };
  if (args[0] === "add") {
    return {
      command: "add",
      rootPath: required(args, 1, "workspace path"),
      id: requiredOption(args, "--id"),
      name: option(args, "--name"),
    };
  }
  if (args[0] === "remove") return { command: "remove", id: required(args, 1, "workspace ID") };
  throw new Error("Expected one of: list, add <path> --id <id>, remove <id>.");
}
