import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AgentRunResult } from "../src/agents/agentRunResult.js";
import { writeAgentRun } from "../src/agents/agentRunWriter.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) =>
      rm(path, { recursive: true, force: true }),
    ),
  );
});

describe("writeAgentRun", () => {
  it("persists a validated agent run artifact", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agent-run-"));
    directories.push(directory);
    const result = {
      agentRunId: "agent-run-1",
      agentId: "test-agent",
      agentVersion: "1.0.0",
      manifestDigest: "a".repeat(64),
      manifest: {
        id: "test-agent",
        name: "Test Agent",
        version: "1.0.0",
        status: "active",
        description: "Test.",
        owner: "tests",
        tags: [],
        defaultModel: "test-model",
        components: {
          workflowIds: [],
          harnessIds: [],
          scenarioIds: [],
          datasetIds: [],
        },
        permissions: { toolIds: [] },
        verification: { datasetIds: [], minimumPassRate: null },
      },
      input: {},
      configuration: { model: "test-model", permittedToolIds: [] },
      warnings: [],
      output: {},
      assessment: {
        passed: true,
        message: "Agent output satisfied its runtime contract.",
      },
      failure: null,
      succeeded: true,
      durationMs: 1,
      completedAt: "2026-08-01T12:00:00.000Z",
    } satisfies AgentRunResult;

    const path = await writeAgentRun(result, directory);

    expect(JSON.parse(await readFile(path, "utf8"))).toEqual(result);
  });
});
