import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  agentModelMatrixSchema,
  type AgentModelMatrix,
} from "./agents/modelMatrix/agentModelMatrix.js";
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

async function resolveMatrixFile(
  runsDirectory: string,
  id: string | null,
): Promise<string> {
  const files = (await readdir(runsDirectory)).filter((path) =>
    /^model-matrix-.+\.json$/.test(path),
  );

  if (files.length === 0) {
    throw new Error("No model-matrix artifacts found in runs/. Run `npm run matrix` first.");
  }

  if (id !== null) {
    const match = files.find((path) => path === `model-matrix-${id}.json`);
    if (!match) throw new Error(`No model-matrix artifact for id ${id}.`);
    return join(runsDirectory, match);
  }

  // newest by mtime
  const withTimes = await Promise.all(
    files.map(async (path) => ({
      path,
      mtimeMs: (await stat(join(runsDirectory, path))).mtimeMs,
    })),
  );
  withTimes.sort((left, right) => right.mtimeMs - left.mtimeMs);
  return join(runsDirectory, withTimes[0]!.path);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const runsDirectory = join(process.cwd(), "runs");
  const id = option(args, "--id");

  const file = await resolveMatrixFile(runsDirectory, id);
  const raw = JSON.parse(await readFile(file, "utf8")) as unknown;
  const matrix: AgentModelMatrix = agentModelMatrixSchema.parse(raw);

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
