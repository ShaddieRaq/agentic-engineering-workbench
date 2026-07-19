import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadContextItem } from "../src/harness/contextLoader.js";

const createdDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    createdDirectories.map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );

  createdDirectories.length = 0;
});

describe("loadContextItem", () => {
  it("loads and validates context from a file", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "workbench-context-"),
    );

    createdDirectories.push(directory);

    const filePath = join(directory, "README.md");

    await writeFile(
      filePath,
      "This project is an agentic engineering workbench.\n",
      "utf8",
    );

    const contextItem = await loadContextItem("readme", filePath);

    expect(contextItem).toEqual({
      id: "readme",
      source: filePath,
      content: "This project is an agentic engineering workbench.",
    });
  });
});