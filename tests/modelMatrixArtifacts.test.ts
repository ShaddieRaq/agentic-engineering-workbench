import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveModelMatrixFile } from "../src/agents/modelMatrix/modelMatrixArtifacts.js";

const UUID = "60dfaf8f-53ac-4e26-993a-1b2fbe021090";

describe("resolveModelMatrixFile", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "model-matrix-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("ignores derived triage/report files when resolving the newest matrix", async () => {
    await writeFile(join(dir, `model-matrix-${UUID}.json`), "{}");
    // Written LATER, so it is the newest file — but it must not be mistaken
    // for a matrix artifact (regression: the old regex matched it).
    await writeFile(join(dir, `model-matrix-triage-${UUID}.json`), "{}");

    const resolved = await resolveModelMatrixFile(dir, null);
    expect(resolved).toBe(join(dir, `model-matrix-${UUID}.json`));
  });

  it("throws when only derived files exist (no real matrix artifact)", async () => {
    await writeFile(join(dir, `model-matrix-triage-${UUID}.json`), "{}");
    await expect(resolveModelMatrixFile(dir, null)).rejects.toThrow(
      /No model-matrix artifacts/,
    );
  });
});
