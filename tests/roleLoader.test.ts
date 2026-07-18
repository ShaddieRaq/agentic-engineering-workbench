import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadRole } from "../src/harness/roleLoader.js";

const createdDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    createdDirectories.map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );

  createdDirectories.length = 0;
});

describe("loadRole", () => {
  it("loads and validates role instructions from a file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "workbench-role-"));
    createdDirectories.push(directory);

    const filePath = join(directory, "technical-coach.md");

    await writeFile(
      filePath,
      "Explain concepts clearly and practically.\n",
      "utf8",
    );

    const role = await loadRole("technical-coach", filePath);

    expect(role).toEqual({
      id: "technical-coach",
      instructions: "Explain concepts clearly and practically.",
    });
  });
});