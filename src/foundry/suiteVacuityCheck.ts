import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

// Null-implementation gate (2026-08-09, the placebo-suite incident): a
// test suite's defining property is that it FAILS when the software is
// wrong. Every syntax and coverage gate measures form; this one measures
// power. Each test file runs against a stub project containing nothing
// but the suite itself — a file that passes there verifies nothing and
// the suite is rejected by name. This closes the entire vacuous-test
// class (expect(true), tautologies, doc-reading) for any model, because
// it stops trusting what tests say and measures what they do.

export type SuiteVacuityCheck = (
  files: { path: string; content: string }[],
) => Promise<string[]>;

export function createProcessSuiteVacuityCheck(
  workbenchRoot: string,
): SuiteVacuityCheck {
  const vitestBinary = join(
    resolve(workbenchRoot),
    "node_modules",
    ".bin",
    "vitest",
  );
  return async (files) => {
    const stub = await mkdtemp(join(tmpdir(), "suite-vacuity-"));
    try {
      for (const file of files) {
        const target = join(stub, file.path);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, file.content, "utf8");
      }
      const vacuousFiles: string[] = [];
      for (const file of files) {
        const run = spawnSync(vitestBinary, ["run", "--root", stub, file.path], {
          encoding: "utf8",
          timeout: 120_000,
        });
        // Exit 0 in an empty project = the file cannot distinguish the
        // product's absence from its presence. Any non-zero exit
        // (assertion failures, spawn errors, even runner crashes) means
        // the file demands something reality must supply.
        if (run.status === 0) vacuousFiles.push(file.path);
      }
      return vacuousFiles;
    } finally {
      await rm(stub, { recursive: true, force: true });
    }
  };
}
