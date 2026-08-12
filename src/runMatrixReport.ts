import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadModelMatrix } from "./agents/modelMatrix/modelMatrixArtifacts.js";
import { renderModelMatrixMarkdown } from "./agents/modelMatrix/agentModelMatrixReport.js";

function option(args: string[], name: string): string | null {
  const index = args.indexOf(name);
  if (index === -1) return null;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${name}.`);
  }
  return value;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const runsDirectory = join(process.cwd(), "runs");
  const id = option(args, "--id");

  const matrix = await loadModelMatrix(runsDirectory, id);

  const markdown = renderModelMatrixMarkdown(matrix);
  const outPath =
    option(args, "--out") ??
    join(runsDirectory, `model-matrix-report-${matrix.matrixId}.md`);
  await writeFile(outPath, markdown, "utf8");

  console.log(markdown);
  console.log(`\nReport saved: ${outPath}`);
}

main().catch((error: unknown) => {
  console.error("Matrix report failed:", error);
  process.exit(1);
});
