import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { RepositoryAssistantWorkflowResult } from "../src/workflows/repositoryAssistantWorkflow.js";
import { writeRepositoryAssistantRun } from "../src/workflows/repositoryAssistantWriter.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("writeRepositoryAssistantRun", () => {
  it("persists the complete multi-step workflow trace", async () => {
    const directory = await mkdtemp(join(tmpdir(), "assistant-runs-"));
    temporaryDirectories.push(directory);
    const result = {
      workflowRunId: "workflow-1",
      workflowId: "repository-assistant",
      state: { inspection: null, analysis: null, review: null },
      stateVersion: 0,
      steps: [],
      status: "failed",
      stopReason: "Inspection failed.",
      succeeded: false,
      durationMs: 1,
      completedAt: "2026-08-01T12:00:00.000Z",
    } satisfies RepositoryAssistantWorkflowResult;

    const path = await writeRepositoryAssistantRun(result, directory);
    const persisted = JSON.parse(await readFile(path, "utf8"));

    expect(path).toContain("assistant-run-workflow-1.json");
    expect(persisted).toEqual(result);
  });
});
