import { describe, expect, it } from "vitest";
import { createProcessSuiteVacuityCheck } from "../src/foundry/suiteVacuityCheck.js";

const PLACEBO = `import { describe, it, expect } from 'vitest';
describe('placebo', () => {
  it('asserts a tautology', () => {
    expect(true).toBe(true);
  });
});
`;

const REAL = `import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
describe('real', () => {
  it('spawns the product CLI and requires success', () => {
    const run = spawnSync('node', ['dist/cli.js', 'list'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });
    expect(run.status).toBe(0);
  });
});
`;

describe("null-implementation gate (process check)", () => {
  it("flags files that pass in an empty project and clears files that demand reality", async () => {
    // The workbench root supplies the vitest binary; the stub project the
    // files run in is empty.
    const check = createProcessSuiteVacuityCheck(process.cwd());
    const vacuous = await check([
      { path: "acceptance-tests/placebo.test.ts", content: PLACEBO },
      { path: "acceptance-tests/real.test.ts", content: REAL },
    ]);
    expect(vacuous).toEqual(["acceptance-tests/placebo.test.ts"]);
  }, 120_000);
});
