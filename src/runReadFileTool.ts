import { parseReadFileArgs } from "./cli/parseReadFileArgs.js";
import { createReadFileTool } from "./tools/readFileTool.js";
import { executeTool } from "./tools/toolExecutor.js";

async function main(): Promise<void> {
  const input = parseReadFileArgs(process.argv.slice(2));
  const tool = createReadFileTool({
    allowedRoot: process.cwd(),
    maximumBytes: 65_536,
  });
  const evidence = await executeTool(tool, input);

  console.log(JSON.stringify(evidence, null, 2));

  if (!evidence.succeeded) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error("Read-file tool failed:", error);
  process.exit(1);
});
