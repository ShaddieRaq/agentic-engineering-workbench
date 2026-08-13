import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveModelComparisonFile } from "../src/agents/modelComparison/modelComparisonArtifacts.js";

const UUID = "60dfaf8f-53ac-4e26-993a-1b2fbe021090";

describe("resolveModelComparisonFile", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "model-comparison-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("ignores derived triage/report files when resolving the newest modelComparison", async () => {
    await writeFile(join(dir, `model-comparison-${UUID}.json`), "{}");
    // Written LATER, so it is the newest file — but it must not be mistaken
    // for a modelComparison artifact (regression: the old regex matched it).
    await writeFile(join(dir, `model-comparison-triage-${UUID}.json`), "{}");

    const resolved = await resolveModelComparisonFile(dir, null);
    expect(resolved).toBe(join(dir, `model-comparison-${UUID}.json`));
  });

  it("throws when only derived files exist (no real modelComparison artifact)", async () => {
    await writeFile(join(dir, `model-comparison-triage-${UUID}.json`), "{}");
    await expect(resolveModelComparisonFile(dir, null)).rejects.toThrow(
      /No model-comparison artifacts/,
    );
  });
});
