import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadTask } from "../src/harness/taskLoader.js";

const createdDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    createdDirectories.map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );

  createdDirectories.length = 0;
});

describe("loadTask", () => {
  it("loads and validates task instructions from a file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "workbench-task-"));
    createdDirectories.push(directory);

    const filePath = join(directory, "connection-check.md");

    await writeFile(
      filePath,
      "Reply with exactly: Connection successful.\n",
      "utf8",
    );

    const task = await loadTask("connection-check", filePath);

    expect(task).toEqual({
      id: "connection-check",
      instruction: "Reply with exactly: Connection successful.",
    });
  });
});