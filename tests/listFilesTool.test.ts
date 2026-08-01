import {
  mkdtemp,
  mkdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createListFilesTool } from "../src/tools/listFilesTool.js";
import { executeTool } from "../src/tools/toolExecutor.js";

const temporaryDirectories: string[] = [];

async function createRepository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "list-files-tool-"));
  temporaryDirectories.push(root);
  await Promise.all([
    mkdir(join(root, "src")),
    mkdir(join(root, ".git")),
    writeFile(join(root, "README.md"), "# Test"),
    writeFile(join(root, "package.json"), "{}"),
  ]);
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("list-files tool", () => {
  it("lists allowed entries in stable order and records evidence", async () => {
    const root = await createRepository();
    const evidence = await executeTool(
      createListFilesTool({ allowedRoot: root }),
      { path: ".", maxEntries: 10 },
    );

    expect(evidence).toMatchObject({
      toolId: "list-files",
      input: { path: ".", maxEntries: 10 },
      output: {
        entries: [
          { path: "package.json", type: "file" },
          { path: "README.md", type: "file" },
          { path: "src", type: "directory" },
        ],
        truncated: false,
      },
      failure: null,
      succeeded: true,
    });
    expect(evidence.toolCallId).toBeTruthy();
    expect(evidence.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("enforces the policy output limit", async () => {
    const root = await createRepository();
    const evidence = await executeTool(
      createListFilesTool({
        allowedRoot: root,
        maximumEntries: 2,
      }),
      { path: ".", maxEntries: 10 },
    );

    expect(evidence.output?.entries).toHaveLength(2);
    expect(evidence.output?.truncated).toBe(true);
  });

  it("records path traversal as a permission failure", async () => {
    const root = await createRepository();
    const evidence = await executeTool(
      createListFilesTool({ allowedRoot: root }),
      { path: "..", maxEntries: 10 },
    );

    expect(evidence).toMatchObject({
      output: null,
      failure: {
        category: "permission",
        message: "Requested path is outside the allowed root.",
      },
      succeeded: false,
    });
  });

  it("rejects a symbolic link that escapes the allowed root", async () => {
    const root = await createRepository();
    const outside = await mkdtemp(join(tmpdir(), "list-files-outside-"));
    temporaryDirectories.push(outside);
    await symlink(outside, join(root, "escape"));

    const evidence = await executeTool(
      createListFilesTool({ allowedRoot: root }),
      { path: "escape", maxEntries: 10 },
    );

    expect(evidence).toMatchObject({
      output: null,
      failure: {
        category: "permission",
        message: "Requested path resolves outside the allowed root.",
      },
      succeeded: false,
    });
  });

  it("records invalid input without executing the tool", async () => {
    const root = await createRepository();
    const evidence = await executeTool(
      createListFilesTool({ allowedRoot: root }),
      { path: ".", maxEntries: 0 },
    );

    expect(evidence.failure?.category).toBe("validation");
    expect(evidence.output).toBeNull();
  });
});
