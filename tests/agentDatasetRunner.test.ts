import { z } from "zod";
import { describe, expect, it, vi } from "vitest";
import { AgentRegistry } from "../src/agents/agentRegistry.js";
import { defineAgent } from "../src/agents/agentRegistration.js";
import type { AgentRunResult } from "../src/agents/agentRunResult.js";
import { agentDatasetDefinitionSchema } from "../src/agents/datasets/agentDatasetDefinition.js";
import {
  agentDatasetRunResultSchema,
  runAgentDataset,
} from "../src/agents/datasets/agentDatasetRunner.js";

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
  purpose: "regression",
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
    expect(result.datasetPurpose).toBe("regression");
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

  it("uses hidden case expectations instead of runtime success for reliability", async () => {
    const expectedRegistration = defineAgent({
      manifest: {
        ...registration.manifest,
        id: "expected-agent",
        name: "Expected Agent",
      },
      inputSchema: z.object({}).strict(),
      outputSchema: z.object({ classification: z.string() }).strict(),
      async execute() {
        return { classification: "application-defect" };
      },
      assessDatasetCase(_input, output, expected) {
        const parsed = z.object({ classification: z.string() }).parse(expected);
        return {
          passed: output.classification === parsed.classification,
          message: "Classification must match hidden ground truth.",
        };
      },
    });
    const expectedDataset = agentDatasetDefinitionSchema.parse({
      id: "expected-dataset",
      description: "Expected result.",
      agentId: "expected-agent",
      purpose: "protected",
      cases: [{
        id: "case",
        input: {},
        expected: { classification: "test-defect" },
      }],
    });
    const agentRun: AgentRunResult = {
      ...run(true),
      agentId: "expected-agent",
      manifest: expectedRegistration.manifest,
      output: { classification: "application-defect" },
    };
    const result = await runAgentDataset(
      expectedDataset,
      new AgentRegistry([expectedRegistration]),
      async () => agentRun,
    );

    expect(result.runs[0]).toMatchObject({
      expectation: { classification: "test-defect" },
      caseAssessment: {
        passed: false,
        message: "Classification must match hidden ground truth.",
      },
      agentRun: { succeeded: true },
    });
    expect(result.caseSummaries[0]).toMatchObject({
      passedRuns: 0,
      failedRuns: 1,
      passRate: 0,
    });
  });

  it("rejects expected cases before execution when the agent has no case assessor", async () => {
    const execute = vi.fn(async () => run(true));
    const expectedDataset = agentDatasetDefinitionSchema.parse({
      id: "invalid-expected-dataset",
      description: "Missing policy.",
      agentId: "test-agent",
      purpose: "development",
      cases: [{ id: "case", input: {}, expected: { answer: true } }],
    });

    await expect(
      runAgentDataset(
        expectedDataset,
        new AgentRegistry([registration]),
        execute,
      ),
    ).rejects.toThrow("does not define dataset-case assessment");
    expect(execute).not.toHaveBeenCalled();
  });

  it("loads historical run evidence as regression purpose", async () => {
    const result = await runAgentDataset(
      dataset,
      new AgentRegistry([registration]),
      async () => run(true),
    );
    const historical = { ...result };
    delete historical.datasetPurpose;

    expect(
      agentDatasetRunResultSchema.parse(historical).datasetPurpose,
    ).toBe("regression");
  });
});
