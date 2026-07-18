import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeRun } from "../src/harness/runWriter.js";

const createdDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    createdDirectories.map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );

  createdDirectories.length = 0;
});

describe("writeRun", () => {
  it("writes the harness result to a JSON file", async () => {
    const runsDirectory = await mkdtemp(
      join(tmpdir(), "agentic-workbench-runs-"),
    );

    createdDirectories.push(runsDirectory);

    const result = {
        task: {
          id: "analyze-task",
          instruction: "Analyze this task",
        },
        output: "Harness response",
        durationMs: 25,
        completedAt: "2026-07-18T12:41:33.640Z",
      };

    const filePath = await writeRun(result, runsDirectory);
    const fileContents = await readFile(filePath, "utf8");

    expect(JSON.parse(fileContents)).toEqual(result);
  });
});