import { describe, expect, it } from "vitest";
import type { RepositoryContextAssembly } from "../src/workflows/repositoryContextLoader.js";
import { repositoryAnalysisOutputSchema } from "../src/workflows/repositoryAnalysisOutput.js";
import { buildRepositoryAnalysisRequest } from "../src/workflows/repositoryAnalysisRequest.js";

function assembly(): RepositoryContextAssembly {
  return {
    maximumBytes: 100,
    totalBytes: 18,
    items: [
      {
        id: "repository:README.md",
        source: "README.md",
        toolCallId: "read-1",
        sizeBytes: 18,
        priority: 1,
        rationale: "Project overview.",
      },
    ],
    reads: [
      {
        candidate: {
          path: "README.md",
          priority: 1,
          rationale: "Project overview.",
        },
        evidence: {
          toolCallId: "read-1",
          toolId: "read-file",
          input: { path: "README.md", maxBytes: 100 },
          output: {
            path: "README.md",
            content: "Repository readme.",
            sizeBytes: 18,
          },
          failure: null,
          durationMs: 1,
          completedAt: "2026-08-01T12:00:00.000Z",
          succeeded: true,
        },
      },
    ],
    rejectedCandidates: [],
    complete: true,
  };
}

describe("buildRepositoryAnalysisRequest", () => {
  it("builds a provider-neutral structured request from linked evidence", () => {
    const request = buildRepositoryAnalysisRequest(
      assembly(),
      "Explain this repository.",
    );

    expect(request.outputSchema).toBe(repositoryAnalysisOutputSchema);
    expect(request.prompt).toContain("Context completeness: complete");
    expect(request.prompt).toContain("Source: README.md");
    expect(request.prompt).toContain("Selection rationale: Project overview.");
    expect(request.prompt).toContain("Repository readme.");
    expect(request.prompt).toContain("TASK:\nExplain this repository.");
  });

  it("rejects a context item with broken evidence linkage", () => {
    const brokenAssembly = assembly();
    brokenAssembly.items[0] = {
      ...brokenAssembly.items[0]!,
      toolCallId: "missing-read",
    };

    expect(() => buildRepositoryAnalysisRequest(brokenAssembly)).toThrow(
      "does not reference matching successful read evidence",
    );
  });
});
