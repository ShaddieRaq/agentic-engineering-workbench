import { parseSearchTextArgs } from "./cli/parseSearchTextArgs.js";
import { createSearchTextTool } from "./tools/searchTextTool.js";
import { executeTool } from "./tools/toolExecutor.js";

async function main(): Promise<void> {
  const input = parseSearchTextArgs(process.argv.slice(2));
  const tool = createSearchTextTool({
    allowedRoot: process.cwd(),
    maximumMatches: 100,
    maximumFiles: 1_000,
    maximumFileBytes: 262_144,
    maximumOutputBytes: 65_536,
    timeoutMs: 2_000,
  });
  const evidence = await executeTool(tool, input);

  console.log(JSON.stringify(evidence, null, 2));

  if (!evidence.succeeded) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error("Search-text tool failed:", error);
  process.exit(1);
});
