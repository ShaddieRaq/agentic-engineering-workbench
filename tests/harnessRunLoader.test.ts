import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  loadHarnessRun,
  loadHarnessRuns,
} from "../src/reporting/harnessRunLoader.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

const validRun = {
  runId: "run-1",
  harnessId: "basic-reliability",
  scenarioId: null,
  role: { id: "role", instructions: "Be useful." },
  task: { id: "task", instruction: "Do work." },
  context: [],
  prompt: "Do work.",
  output: "Completed output.",
  parsedOutput: null,
  refusal: null,
  provider: null,
  executionFailure: null,
  evaluations: [],
  durationMs: 1,
  completedAt: "2026-08-01T12:00:00.000Z",
  passed: true,
};

describe("loadHarnessRun", () => {
  it("loads and validates a bounded persisted run", async () => {
    const root = await mkdtemp(join(tmpdir(), "run-loader-"));
    temporaryDirectories.push(root);
    await writeFile(join(root, "run.json"), JSON.stringify(validRun));

    await expect(
      loadHarnessRun("run.json", { allowedRoot: root }),
    ).resolves.toEqual(validRun);
  });

  it("rejects invalid run JSON", async () => {
    const root = await mkdtemp(join(tmpdir(), "run-loader-"));
    temporaryDirectories.push(root);
    await writeFile(join(root, "invalid.json"), JSON.stringify({ runId: "x" }));

    await expect(
      loadHarnessRun("invalid.json", { allowedRoot: root }),
    ).rejects.toThrow();
  });

  it("rejects symbolic-link escape from the allowed root", async () => {
    const parent = await mkdtemp(join(tmpdir(), "run-loader-"));
    temporaryDirectories.push(parent);
    const root = join(parent, "runs");
    await mkdir(root);
    const outside = join(parent, "outside.json");
    await writeFile(outside, JSON.stringify(validRun));
    await symlink(outside, join(root, "linked.json"));

    await expect(
      loadHarnessRun("linked.json", { allowedRoot: root }),
    ).rejects.toThrow("inside the allowed root");
  });

  it("rejects artifacts larger than the configured limit", async () => {
    const root = await mkdtemp(join(tmpdir(), "run-loader-"));
    temporaryDirectories.push(root);
    await writeFile(join(root, "run.json"), JSON.stringify(validRun));

    await expect(
      loadHarnessRun("run.json", { allowedRoot: root, maximumBytes: 10 }),
    ).rejects.toThrow("10-byte limit");
  });

  it("collects compatible runs and preserves rejected artifact evidence", async () => {
    const root = await mkdtemp(join(tmpdir(), "run-loader-"));
    temporaryDirectories.push(root);
    await writeFile(join(root, "valid.json"), JSON.stringify(validRun));
    await writeFile(join(root, "legacy.json"), JSON.stringify({ runId: "old" }));

    const collection = await loadHarnessRuns(
      ["legacy.json", "valid.json"],
      { allowedRoot: root },
    );

    expect(collection.runs).toEqual([validRun]);
    expect(collection.acceptedPaths).toEqual(["valid.json"]);
    expect(collection.rejectedArtifacts).toHaveLength(1);
    expect(collection.rejectedArtifacts[0]).toMatchObject({
      path: "legacy.json",
    });
    expect(collection.rejectedArtifacts[0]?.reason).toContain("harnessId");
  });
});
