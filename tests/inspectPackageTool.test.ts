import {
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createInspectPackageTool } from "../src/tools/inspectPackageTool.js";
import { executeTool } from "../src/tools/toolExecutor.js";

const temporaryDirectories: string[] = [];

async function createRepository(
  packageContent: string,
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "inspect-package-tool-"));
  temporaryDirectories.push(root);
  await writeFile(join(root, "package.json"), packageContent);
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("inspect-package tool", () => {
  it("returns only validated metadata in stable order", async () => {
    const root = await createRepository(
      JSON.stringify({
        name: "test-project",
        version: "1.2.3",
        type: "module",
        private: true,
        secretCustomField: "not exposed",
        scripts: { test: "vitest", build: "tsc" },
        dependencies: { zod: "4", openai: "6" },
        devDependencies: { vitest: "4", typescript: "7" },
      }),
    );
    const evidence = await executeTool(
      createInspectPackageTool({ allowedRoot: root }),
      { path: "package.json", maxBytes: 65_536 },
    );

    expect(evidence).toMatchObject({
      toolId: "inspect-package",
      output: {
        path: "package.json",
        name: "test-project",
        version: "1.2.3",
        moduleType: "module",
        scripts: { build: "tsc", test: "vitest" },
        dependencies: { openai: "6", zod: "4" },
        devDependencies: { typescript: "7", vitest: "4" },
      },
      failure: null,
      succeeded: true,
    });
    expect(evidence.output).not.toHaveProperty("private");
    expect(evidence.output).not.toHaveProperty("secretCustomField");
  });

  it("records malformed package JSON as an execution failure", async () => {
    const root = await createRepository("not-json");
    const evidence = await executeTool(
      createInspectPackageTool({ allowedRoot: root }),
      { path: "package.json", maxBytes: 65_536 },
    );

    expect(evidence.failure?.category).toBe("execution");
    expect(evidence.output).toBeNull();
  });

  it("rejects a non-package metadata target", async () => {
    const root = await createRepository("{}");
    const evidence = await executeTool(
      createInspectPackageTool({ allowedRoot: root }),
      { path: "README.md", maxBytes: 65_536 },
    );

    expect(evidence.failure?.category).toBe("validation");
  });

  it("inherits traversal protection from read-file", async () => {
    const root = await createRepository("{}");
    const evidence = await executeTool(
      createInspectPackageTool({ allowedRoot: root }),
      { path: "../package.json", maxBytes: 65_536 },
    );

    expect(evidence.failure?.category).toBe("permission");
  });

  it("inherits the application byte limit", async () => {
    const root = await createRepository(
      JSON.stringify({ name: "larger-than-limit" }),
    );
    const evidence = await executeTool(
      createInspectPackageTool({
        allowedRoot: root,
        maximumBytes: 10,
      }),
      { path: "package.json", maxBytes: 65_536 },
    );

    expect(evidence.failure?.category).toBe("permission");
  });
});
