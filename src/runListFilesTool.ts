import { parseListFilesArgs } from "./cli/parseListFilesArgs.js";
import { createListFilesTool } from "./tools/listFilesTool.js";
import { executeTool } from "./tools/toolExecutor.js";

async function main(): Promise<void> {
  const input = parseListFilesArgs(process.argv.slice(2));
  const tool = createListFilesTool({
    allowedRoot: process.cwd(),
    maximumEntries: 100,
  });
  const evidence = await executeTool(tool, input);

  console.log(JSON.stringify(evidence, null, 2));

  if (!evidence.succeeded) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error("List-files tool failed:", error);
  process.exit(1);
});
