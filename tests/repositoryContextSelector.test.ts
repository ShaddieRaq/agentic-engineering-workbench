import { describe, expect, it } from "vitest";
import type { ListFilesOutput } from "../src/tools/listFilesTool.js";
import type { ToolCallEvidence } from "../src/tools/toolExecutor.js";
import { selectRepositoryContext } from "../src/workflows/repositoryContextSelector.js";

function fileEvidence(
  output: ListFilesOutput | null,
  succeeded = true,
): ToolCallEvidence<ListFilesOutput> {
  return {
    toolCallId: "files-1",
    toolId: "list-files",
    input: { path: ".", maxEntries: 50 },
    output,
    failure: succeeded
      ? null
      : { category: "execution", message: "Listing failed." },
    durationMs: 1,
    completedAt: "2026-08-01T12:00:00.000Z",
    succeeded,
  };
}

describe("selectRepositoryContext", () => {
  it("selects only observed orientation files with rationale", () => {
    const selection = selectRepositoryContext(
      fileEvidence({
        entries: [
          { path: "src", type: "directory" },
          { path: "README.md", type: "file" },
          { path: "package.json", type: "file" },
          { path: "AGENTS.md", type: "file" },
          { path: "unrelated.txt", type: "file" },
        ],
        truncated: false,
      }),
    );

    expect(selection).toEqual({
      selectionId: "repository-orientation",
      sourceToolCallId: "files-1",
      candidates: [
        {
          path: "AGENTS.md",
          priority: 1,
          rationale: "Repository-specific agent instructions.",
        },
        {
          path: "README.md",
          priority: 3,
          rationale: "Project purpose and operator-facing usage.",
        },
        {
          path: "package.json",
          priority: 4,
          rationale: "Runtime dependencies and executable project commands.",
        },
      ],
      complete: true,
    });
  });

  it("marks selection incomplete when the listing was truncated", () => {
    const selection = selectRepositoryContext(
      fileEvidence({
        entries: [{ path: "README.md", type: "file" }],
        truncated: true,
      }),
    );

    expect(selection.complete).toBe(false);
    expect(selection.candidates).toHaveLength(1);
  });

  it("returns no invented candidates after listing failure", () => {
    const selection = selectRepositoryContext(fileEvidence(null, false));

    expect(selection.candidates).toEqual([]);
    expect(selection.complete).toBe(false);
  });
});
