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
import { createReadFileTool } from "../src/tools/readFileTool.js";
import { executeTool } from "../src/tools/toolExecutor.js";

const temporaryDirectories: string[] = [];

async function createRepository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "read-file-tool-"));
  temporaryDirectories.push(root);
  await mkdir(join(root, "src"));
  await Promise.all([
    writeFile(join(root, "src", "example.ts"), "export const value = 1;\n"),
    writeFile(join(root, ".env"), "SECRET=hidden\n"),
    writeFile(join(root, "binary.bin"), Buffer.from([0, 1, 2, 3])),
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

describe("read-file tool", () => {
  it("reads bounded UTF-8 content and records evidence", async () => {
    const root = await createRepository();
    const evidence = await executeTool(
      createReadFileTool({ allowedRoot: root }),
      { path: "src/example.ts", maxBytes: 100 },
    );

    expect(evidence).toMatchObject({
      toolId: "read-file",
      output: {
        path: "src/example.ts",
        content: "export const value = 1;\n",
        sizeBytes: 24,
      },
      failure: null,
      succeeded: true,
    });
  });

  it("denies sensitive paths", async () => {
    const root = await createRepository();
    const evidence = await executeTool(
      createReadFileTool({ allowedRoot: root }),
      { path: ".env", maxBytes: 100 },
    );

    expect(evidence.failure).toEqual({
      category: "permission",
      message: "Requested path is denied by tool policy.",
    });
  });

  it("denies traversal outside the allowed root", async () => {
    const root = await createRepository();
    const evidence = await executeTool(
      createReadFileTool({ allowedRoot: root }),
      { path: "../outside.txt", maxBytes: 100 },
    );

    expect(evidence.failure?.category).toBe("permission");
    expect(evidence.output).toBeNull();
  });

  it("denies symbolic links that escape the allowed root", async () => {
    const root = await createRepository();
    const outside = await mkdtemp(join(tmpdir(), "read-file-outside-"));
    temporaryDirectories.push(outside);
    const outsideFile = join(outside, "secret.txt");
    await writeFile(outsideFile, "secret");
    await symlink(outsideFile, join(root, "escape.txt"));

    const evidence = await executeTool(
      createReadFileTool({ allowedRoot: root }),
      { path: "escape.txt", maxBytes: 100 },
    );

    expect(evidence.failure).toEqual({
      category: "permission",
      message: "Requested path resolves outside the allowed root.",
    });
  });

  it("enforces the application byte limit", async () => {
    const root = await createRepository();
    const evidence = await executeTool(
      createReadFileTool({
        allowedRoot: root,
        maximumBytes: 10,
      }),
      { path: "src/example.ts", maxBytes: 100 },
    );

    expect(evidence.failure).toEqual({
      category: "permission",
      message: "Requested file exceeds the 10-byte limit.",
    });
  });

  it("rejects binary content", async () => {
    const root = await createRepository();
    const evidence = await executeTool(
      createReadFileTool({ allowedRoot: root }),
      { path: "binary.bin", maxBytes: 100 },
    );

    expect(evidence.failure).toEqual({
      category: "permission",
      message: "Requested file appears to contain binary content.",
    });
  });
});
