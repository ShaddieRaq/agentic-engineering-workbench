import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  loadEvaluationFailures,
  loadModelMatrix,
} from "./agents/modelMatrix/modelMatrixArtifacts.js";
import {
  renderModelMatrixTriageMarkdown,
  triageModelMatrix,
} from "./agents/modelMatrix/agentModelMatrixTriage.js";

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
  const failures = await loadEvaluationFailures(runsDirectory, matrix);
  const triage = triageModelMatrix(matrix, failures);

  const markdown = renderModelMatrixTriageMarkdown(triage);
  const jsonPath = join(
    runsDirectory,
    `model-matrix-triage-${triage.matrixId}.json`,
  );
  const mdPath =
    option(args, "--out") ??
    join(runsDirectory, `model-matrix-triage-${triage.matrixId}.md`);

  await writeFile(jsonPath, JSON.stringify(triage, null, 2), "utf8");
  await writeFile(mdPath, markdown, "utf8");

  console.log(markdown);
  console.log(`\nTriage evidence saved: ${jsonPath}`);
  console.log(`Triage report saved: ${mdPath}`);
}

main().catch((error: unknown) => {
  console.error("Matrix triage failed:", error);
  process.exit(1);
});
