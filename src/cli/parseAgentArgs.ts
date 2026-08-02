export type AgentCliArgs =
  | { command: "list" }
  | { command: "validate" }
  | { command: "inventory" }
  | { command: "describe"; agentId: string }
  | {
      command: "run";
      agentId: string;
      inputPath: string | null;
      model: string | null;
    }
  | {
      command: "test";
      agentId: string;
      repetitions: number;
      concurrency: number;
      model: string | null;
    };

function positional(args: string[], index: number, label: string): string {
  const value = args[index];

  if (!value || value.startsWith("--")) {
    throw new Error(`Missing required ${label}.`);
  }

  return value;
}

function option(args: string[], name: string): string | null {
  const index = args.indexOf(name);

  if (index === -1) return null;

  const value = args[index + 1];

  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${name}.`);
  }

  return value;
}

export function parseAgentArgs(args: string[]): AgentCliArgs {
  const command = args[0];

  if (
    command === "list" ||
    command === "validate" ||
    command === "inventory"
  ) {
    return { command };
  }

  if (command === "describe") {
    return { command, agentId: positional(args, 1, "agent ID") };
  }

  if (command === "run") {
    return {
      command,
      agentId: positional(args, 1, "agent ID"),
      inputPath: option(args, "--input"),
      model: option(args, "--model"),
    };
  }

  if (command === "test") {
    const repetitions = Number(option(args, "--repetitions") ?? 1);
    const concurrency = Number(option(args, "--concurrency") ?? 1);

    if (!Number.isInteger(repetitions) || repetitions < 1) {
      throw new Error("--repetitions must be a positive integer.");
    }

    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new Error("--concurrency must be a positive integer.");
    }

    return {
      command,
      agentId: positional(args, 1, "agent ID"),
      repetitions,
      concurrency,
      model: option(args, "--model"),
    };
  }

  throw new Error(
    "Expected one of: list, describe <agent-id>, inventory, validate, run <agent-id>, test <agent-id>.",
  );
}
