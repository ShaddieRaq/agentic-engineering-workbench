import { parseInspectPackageArgs } from "./cli/parseInspectPackageArgs.js";
import { createInspectPackageTool } from "./tools/inspectPackageTool.js";
import { executeTool } from "./tools/toolExecutor.js";

async function main(): Promise<void> {
  const input = parseInspectPackageArgs(process.argv.slice(2));
  const tool = createInspectPackageTool({
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
  console.error("Inspect-package tool failed:", error);
  process.exit(1);
});
