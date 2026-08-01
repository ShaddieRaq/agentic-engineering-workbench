import {
  mkdtemp,
  mkdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createSearchTextTool } from "../src/tools/searchTextTool.js";
import { executeTool } from "../src/tools/toolExecutor.js";

const temporaryDirectories: string[] = [];

async function createRepository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "search-text-tool-"));
  temporaryDirectories.push(root);
  await Promise.all([
    mkdir(join(root, "src")),
    mkdir(join(root, ".git")),
  ]);
  await Promise.all([
    writeFile(
      join(root, "README.md"),
      "Agentic harness overview\nNo match here\n",
    ),
    writeFile(
      join(root, "src", "agent.ts"),
      "export const harness = 'agentic harness';\n",
    ),
    writeFile(join(root, ".env"), "AGENTIC_SECRET=hidden\n"),
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

describe("search-text tool", () => {
  it("returns deterministic literal matches with evidence", async () => {
    const root = await createRepository();
    const evidence = await executeTool(
      createSearchTextTool({ allowedRoot: root }),
      {
        query: "agentic harness",
        path: ".",
        caseSensitive: false,
        maxMatches: 10,
      },
    );

    expect(evidence).toMatchObject({
      toolId: "search-text",
      output: {
        matches: [
          {
            path: "README.md",
            line: 1,
            column: 1,
            preview: "Agentic harness overview",
          },
          {
            path: "src/agent.ts",
            line: 1,
            column: 25,
            preview: "export const harness = 'agentic harness';",
          },
        ],
        truncated: false,
      },
      failure: null,
      succeeded: true,
    });
  });

  it("enforces the application match limit", async () => {
    const root = await createRepository();
    const evidence = await executeTool(
      createSearchTextTool({
        allowedRoot: root,
        maximumMatches: 1,
      }),
      {
        query: "agentic harness",
        path: ".",
        caseSensitive: false,
        maxMatches: 10,
      },
    );

    expect(evidence.output?.matches).toHaveLength(1);
    expect(evidence.output?.truncated).toBe(true);
  });

  it("does not search denied or binary files", async () => {
    const root = await createRepository();
    const evidence = await executeTool(
      createSearchTextTool({ allowedRoot: root }),
      {
        query: "hidden",
        path: ".",
        caseSensitive: false,
        maxMatches: 10,
      },
    );

    expect(evidence.output?.matches).toEqual([]);
  });

  it("denies traversal outside the allowed root", async () => {
    const root = await createRepository();
    const evidence = await executeTool(
      createSearchTextTool({ allowedRoot: root }),
      {
        query: "secret",
        path: "..",
        caseSensitive: false,
        maxMatches: 10,
      },
    );

    expect(evidence.failure?.category).toBe("permission");
    expect(evidence.output).toBeNull();
  });
});
