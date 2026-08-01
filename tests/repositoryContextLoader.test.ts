import { describe, expect, it } from "vitest";
import {
  readFileInputSchema,
  readFileOutputSchema,
} from "../src/tools/readFileTool.js";
import type { ToolDefinition } from "../src/tools/toolDefinition.js";
import { loadRepositoryContext } from "../src/workflows/repositoryContextLoader.js";
import type { RepositoryContextSelection } from "../src/workflows/repositoryContextSelector.js";

function selection(paths: string[]): RepositoryContextSelection {
  return {
    selectionId: "repository-orientation",
    sourceToolCallId: "files-1",
    changeToolCallId: "changes-1",
    candidates: paths.map((path, index) => ({
      path,
      priority: index + 1,
      rationale: `Read ${path}.`,
    })),
    complete: true,
  };
}

function readTool(
  contents: Record<string, string>,
  failingPath?: string,
): ToolDefinition<
  { path: string; maxBytes: number },
  { path: string; content: string; sizeBytes: number }
> {
  return {
    id: "read-file",
    description: "Test reader.",
    inputSchema: readFileInputSchema,
    outputSchema: readFileOutputSchema,
    async execute(input) {
      if (input.path === failingPath) {
        throw new Error(`Cannot read ${input.path}.`);
      }

      const content = contents[input.path] ?? "";

      return {
        path: input.path,
        content,
        sizeBytes: Buffer.byteLength(content),
      };
    },
  };
}

describe("loadRepositoryContext", () => {
  it("loads selected files in priority order under one budget", async () => {
    const result = await loadRepositoryContext(
      selection(["first.md", "second.md"]),
      readTool({ "first.md": "one", "second.md": "two" }),
      10,
    );

    expect(result.items.map(({ source }) => source)).toEqual([
      "first.md",
      "second.md",
    ]);
    expect(result.totalBytes).toBe(6);
    expect(result.reads).toHaveLength(2);
    expect(result.items[0]?.toolCallId).toBe(
      result.reads[0]?.evidence.toolCallId,
    );
    expect(result.items[0]).not.toHaveProperty("content");
    expect(result.rejectedCandidates).toEqual([]);
    expect(result.complete).toBe(true);
  });

  it("records candidates excluded after the aggregate budget is exhausted", async () => {
    const result = await loadRepositoryContext(
      selection(["first.md", "second.md"]),
      readTool({ "first.md": "12345", "second.md": "unused" }),
      5,
    );

    expect(result.items.map(({ source }) => source)).toEqual(["first.md"]);
    expect(result.reads).toHaveLength(1);
    expect(result.rejectedCandidates).toMatchObject([
      {
        candidate: { path: "second.md" },
        reason: "budget-exhausted",
        failure: null,
      },
    ]);
    expect(result.complete).toBe(false);
  });

  it("classifies a readable file larger than the remaining budget as excluded", async () => {
    const result = await loadRepositoryContext(
      selection(["first.md", "second.md"]),
      readTool({ "first.md": "1234", "second.md": "5678" }),
      6,
    );

    expect(result.items.map(({ source }) => source)).toEqual(["first.md"]);
    expect(result.reads).toHaveLength(2);
    expect(result.rejectedCandidates).toMatchObject([
      {
        candidate: { path: "second.md" },
        reason: "budget-exhausted",
        failure: null,
      },
    ]);
  });

  it("preserves failed read evidence and continues with later candidates", async () => {
    const result = await loadRepositoryContext(
      selection(["first.md", "second.md"]),
      readTool({ "second.md": "available" }, "first.md"),
      20,
    );

    expect(result.items.map(({ source }) => source)).toEqual(["second.md"]);
    expect(result.reads).toHaveLength(2);
    expect(result.rejectedCandidates[0]).toMatchObject({
      candidate: { path: "first.md" },
      reason: "read-failed",
      failure: {
        category: "execution",
        message: "Cannot read first.md.",
      },
    });
    expect(result.complete).toBe(false);
  });
});
