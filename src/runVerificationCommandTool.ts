import { parseVerificationCommandArgs } from "./cli/parseVerificationCommandArgs.js";
import { executeTool } from "./tools/toolExecutor.js";
import { createVerificationCommandTool } from "./tools/verificationCommandTool.js";

async function main(): Promise<void> {
  const input = parseVerificationCommandArgs(process.argv.slice(2));
  const tool = createVerificationCommandTool({
    allowedRoot: process.cwd(),
    timeoutMs: 120_000,
    maximumOutputBytes: 131_072,
  });
  const evidence = await executeTool(tool, input);

  console.log(JSON.stringify(evidence, null, 2));

  if (!evidence.succeeded || evidence.output?.passed !== true) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error("Verification command tool failed:", error);
  process.exit(1);
});
