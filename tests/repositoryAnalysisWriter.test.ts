import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { RepositoryAnalysisRunResult } from "../src/workflows/repositoryAnalysisRunner.js";
import { writeRepositoryAnalysis } from "../src/workflows/repositoryAnalysisWriter.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("writeRepositoryAnalysis", () => {
  it("persists the complete repository-analysis result", async () => {
    const directory = await mkdtemp(join(tmpdir(), "analysis-runs-"));
    temporaryDirectories.push(directory);
    const result = {
      analysisRunId: "analysis-1",
      inspection: {
        workflowRunId: "workflow-1",
        workflowId: "repository-inspection",
        steps: [],
        contextSelection: {
          selectionId: "repository-orientation",
          sourceToolCallId: "files-1",
          changeToolCallId: "changes-1",
          candidates: [],
          complete: true,
        },
        contextAssembly: {
          maximumBytes: 100,
          totalBytes: 0,
          items: [],
          reads: [],
          rejectedCandidates: [],
          complete: true,
        },
        succeeded: true,
        durationMs: 1,
        completedAt: "2026-08-01T12:00:00.000Z",
      },
      request: {
        prompt: "Analyze the repository.",
        outputContractId: "repository-analysis-v1",
      },
      rawOutput: "{}",
      parsedOutput: null,
      refusal: null,
      provider: { model: "test-model", usage: null },
      executionFailure: null,
      evaluations: [],
      succeeded: false,
      durationMs: 2,
      completedAt: "2026-08-01T12:00:01.000Z",
    } satisfies RepositoryAnalysisRunResult;

    const filePath = await writeRepositoryAnalysis(result, directory);
    const persisted = JSON.parse(await readFile(filePath, "utf8"));

    expect(filePath).toContain("analysis-run-analysis-1.json");
    expect(persisted).toEqual(result);
  });
});
