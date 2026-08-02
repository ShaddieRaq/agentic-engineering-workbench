import { describe, expect, it } from "vitest";
import { verifyAgentDataset } from "../src/agents/agentVerification.js";
import { platformAgentRegistry } from "../src/agents/platformAgentRegistry.js";

describe("verifyAgentDataset", () => {
  it("applies the manifest reliability threshold to every case", () => {
    const manifest = platformAgentRegistry.get("repository-assistant").manifest;
    const result = verifyAgentDataset(manifest, {
      datasetRunId: "dataset-run",
      datasetId: "repository-assistant-smoke",
      agentId: "repository-assistant",
      agentVersion: "1.0.0",
      runs: [],
      caseSummaries: [
        {
          datasetCaseId: "passing",
          totalRuns: 1,
          passedRuns: 1,
          failedRuns: 0,
          passRate: 1,
        },
        {
          datasetCaseId: "failing",
          totalRuns: 1,
          passedRuns: 0,
          failedRuns: 1,
          passRate: 0,
        },
      ],
      completedAt: "2026-08-01T12:00:00.000Z",
    });

    expect(result).toMatchObject({
      minimumPassRate: 1,
      passed: false,
      failedCaseIds: ["failing"],
    });
  });

  it("rejects evidence produced by another agent version", () => {
    const manifest = platformAgentRegistry.get("repository-assistant").manifest;

    expect(() =>
      verifyAgentDataset(manifest, {
        datasetRunId: "dataset-run",
        datasetId: "repository-assistant-smoke",
        agentId: "repository-assistant",
        agentVersion: "0.9.0",
        runs: [],
        caseSummaries: [],
        completedAt: "2026-08-01T12:00:00.000Z",
      }),
    ).toThrow("belongs to agent version 0.9.0");
  });
});
