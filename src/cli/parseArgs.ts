export interface CliArgs {
    rolePath: string;
    taskPath: string;
    contextPaths: string[];
    harnessId: string;
}

export function parseArgs(args: string[]): CliArgs {
    const roleIndex = args.indexOf("--role");
    const taskIndex = args.indexOf("--task");
    const harnessIdIndex = args.indexOf("--harness");

    const rolePath = args[roleIndex + 1];
    const taskPath = args[taskIndex + 1];
    const harnessId =
        harnessIdIndex === -1
            ? "technical-coach"
            : args[harnessIdIndex + 1] ?? "technical-coach";

    if (roleIndex === -1 || !rolePath) {
        throw new Error("Missing required --role argument");
    }

    if (taskIndex === -1 || !taskPath) {
        throw new Error("Missing required --task argument");
    }
    const contextPaths = args
        .map((value, index) =>
            value === "--context" ? args[index + 1] : undefined,
        )
        .filter((value): value is string => Boolean(value));
    return {
        rolePath,
        taskPath,
        contextPaths,
        harnessId,
    };
}