import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createFileInventoryTool } from "../src/tools/fileInventoryTool.js";
import { executeTool } from "../src/tools/toolExecutor.js";

describe("file-inventory", () => {
  it("returns bounded deterministic files while excluding denied paths and symlinks", async () => {
    const root = await mkdtemp(join(tmpdir(), "file-inventory-"));
    await mkdir(join(root, "docs"));
    await mkdir(join(root, ".git"));
    await writeFile(join(root, "README.md"), "readme");
    await writeFile(join(root, "docs", "guide.md"), "guide");
    await writeFile(join(root, "docs", "note.txt"), "note");
    await writeFile(join(root, ".git", "secret.md"), "secret");
    await symlink(join(root, "docs"), join(root, "linked-docs"));

    const evidence = await executeTool(createFileInventoryTool({ allowedRoot: root }), {
      path: ".",
      extensions: [".md"],
      maxFiles: 10,
      maxDepth: 5,
    });

    expect(evidence.succeeded).toBe(true);
    expect(evidence.output?.entries.map(({ path }) => path)).toEqual([
      "docs/guide.md",
      "README.md",
    ]);
    expect(evidence.output?.truncated).toBe(false);
  });

  it("reports truncation when the requested file limit is reached", async () => {
    const root = await mkdtemp(join(tmpdir(), "file-inventory-limit-"));
    await writeFile(join(root, "a.md"), "a");
    await writeFile(join(root, "b.md"), "b");
    const result = await executeTool(createFileInventoryTool({ allowedRoot: root }), {
      path: ".",
      extensions: [],
      maxFiles: 1,
      maxDepth: 2,
    });
    expect(result.output).toMatchObject({ truncated: true });
    expect(result.output?.entries).toHaveLength(1);
  });
});
