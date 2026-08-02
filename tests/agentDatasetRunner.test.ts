import { z } from "zod";
import { describe, expect, it, vi } from "vitest";
import { AgentRegistry } from "../src/agents/agentRegistry.js";
import { defineAgent } from "../src/agents/agentRegistration.js";
import type { AgentRunResult } from "../src/agents/agentRunResult.js";
import { agentDatasetDefinitionSchema } from "../src/agents/datasets/agentDatasetDefinition.js";
import { runAgentDataset } from "../src/agents/datasets/agentDatasetRunner.js";

const registration = defineAgent({
  manifest: {
    id: "test-agent",
    name: "Test Agent",
    version: "2.0.0",
    status: "active",
    description: "Test.",
    owner: "tests",
    tags: [],
    defaultModel: "test",
    components: {
      workflowIds: [],
      harnessIds: [],
      scenarioIds: [],
      datasetIds: [],
    },
    permissions: { toolIds: [] },
    verification: { datasetIds: [], minimumPassRate: 0.5 },
  },
  inputSchema: z.object({}).strict(),
  outputSchema: z.object({}).strict(),
  async execute() {
    return {};
  },
});

const dataset = agentDatasetDefinitionSchema.parse({
  id: "test-dataset",
  description: "Test.",
  agentId: "test-agent",
  cases: [
    { id: "first", input: {} },
    { id: "second", input: {} },
  ],
});

function run(succeeded: boolean): AgentRunResult {
  return {
    agentRunId: crypto.randomUUID(),
    agentId: "test-agent",
    agentVersion: "2.0.0",
    manifestDigest: "a".repeat(64),
    manifest: registration.manifest,
    input: {},
    configuration: { model: "test", permittedToolIds: [] },
    warnings: [],
    output: {},
    assessment: { passed: succeeded, message: "Test." },
    failure: succeeded
      ? null
      : { stage: "evaluation", category: "evaluation", message: "Failed." },
    succeeded,
    durationMs: 1,
    completedAt: "2026-08-01T12:00:00.000Z",
  };
}

describe("runAgentDataset", () => {
  it("repeats cases, preserves order, and derives reliability", async () => {
    const execute = vi.fn(async (_agentId: string) => run(true));
    const result = await runAgentDataset(
      dataset,
      new AgentRegistry([registration]),
      execute,
      { repetitions: 2, concurrency: 2 },
    );

    expect(execute).toHaveBeenCalledTimes(4);
    expect(result.agentVersion).toBe("2.0.0");
    expect(result.runs.map(({ datasetCaseId }) => datasetCaseId)).toEqual([
      "first",
      "first",
      "second",
      "second",
    ]);
    expect(result.caseSummaries).toEqual([
      {
        datasetCaseId: "first",
        totalRuns: 2,
        passedRuns: 2,
        failedRuns: 0,
        passRate: 1,
      },
      {
        datasetCaseId: "second",
        totalRuns: 2,
        passedRuns: 2,
        failedRuns: 0,
        passRate: 1,
      },
    ]);
  });
});
