import { describe, expect, it } from "vitest";
import { agentImprovementEvidencePacketSchema } from "../src/agents/agentImprovement/agentImprovementEvidence.js";

function packet() {
  return {
    packetId: "packet-1",
    subject: {
      agentId: "documentation-auditor",
      agentVersion: "1.0.0",
      manifestDigest: "a".repeat(64),
      description: "Audits repository documentation.",
      workflowIds: ["documentation-audit"],
      toolIds: ["file-inventory", "read-file"],
      datasetIds: ["documentation-auditor-smoke"],
    },
    objective: {
      target: "grounding",
      description: "Improve evidence citation completeness.",
      constraints: ["Do not add tools."],
    },
    sourceExperimentIds: ["experiment-1"],
    execution: {
      workspaceId: "default",
      model: "test-model",
      repetitions: 1,
      concurrency: 1,
    },
    aggregate: {
      totalCases: 1,
      passedCases: 0,
      failedCases: 1,
      totalRuns: 1,
      passedRuns: 0,
      failedRuns: 1,
      passRate: 0,
    },
    evidenceItems: [
      {
        id: "case:documentation-health",
        kind: "case-outcome",
        datasetId: "documentation-auditor-smoke",
        datasetCaseId: "documentation-health",
        agentRunId: null,
        summary: "The case failed its grounding assessment.",
        details: { passRate: 0 },
      },
    ],
    excludedEvidence: [],
    revisionSurface: {
      mutableFields: ["instructions"],
      baselinePolicy: { instructions: "Cite supplied repository evidence." },
    },
  };
}

describe("agentImprovementEvidencePacketSchema", () => {
  it("accepts bounded evidence for any registered agent", () => {
    expect(agentImprovementEvidencePacketSchema.parse(packet())).toMatchObject({
      packetId: "packet-1",
      subject: { agentId: "documentation-auditor" },
    });
  });

  it("rejects duplicate evidence identities", () => {
    const input = packet();
    input.evidenceItems.push({ ...input.evidenceItems[0]! });

    expect(agentImprovementEvidencePacketSchema.safeParse(input).success).toBe(false);
  });

  it("rejects inconsistent aggregate evidence", () => {
    const input = packet();
    input.aggregate.passedRuns = 1;

    expect(agentImprovementEvidencePacketSchema.safeParse(input).success).toBe(false);
  });

  it("rejects baseline fields outside the declared revision surface", () => {
    const input = packet();
    (input.revisionSurface!.baselinePolicy as Record<string, unknown>).toolIds = [
      "arbitrary-shell",
    ];

    expect(agentImprovementEvidencePacketSchema.safeParse(input).success).toBe(false);
  });
});
