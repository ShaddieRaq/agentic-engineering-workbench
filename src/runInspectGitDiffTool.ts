import { parseInspectGitDiffArgs } from "./cli/parseInspectGitDiffArgs.js";
import { createInspectGitDiffTool } from "./tools/inspectGitDiffTool.js";
import { executeTool } from "./tools/toolExecutor.js";

async function main(): Promise<void> {
  const input = parseInspectGitDiffArgs(process.argv.slice(2));
  const tool = createInspectGitDiffTool({
    allowedRoot: process.cwd(),
    maximumBytes: 65_536,
    timeoutMs: 5_000,
  });
  const evidence = await executeTool(tool, input);

  console.log(JSON.stringify(evidence, null, 2));

  if (!evidence.succeeded) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error("Inspect-git-diff tool failed:", error);
  process.exit(1);
});
