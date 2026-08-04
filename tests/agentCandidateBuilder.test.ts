import { describe, expect, it } from "vitest";
import {
  buildAgentCandidate,
} from "../src/agents/agentImprovement/agentCandidateBuilder.js";
import type { AgentImprovementEvidencePacket } from "../src/agents/agentImprovement/agentImprovementEvidence.js";
import {
  agentImprovementProposalOutputSchema,
} from "../src/agents/agentImprovement/agentImprovementProposal.js";
import { documentationAuditorAgent } from "../src/agents/documentationAuditor/documentationAuditorAgent.js";
import type { DocumentationAuditorPolicy } from "../src/agents/documentationAuditor/documentationAuditorPolicy.js";

function packet(): AgentImprovementEvidencePacket {
  const surface = documentationAuditorAgent.revisionSurface!;
  return {
    packetId: "packet-1",
    subject: {
      agentId: documentationAuditorAgent.manifest.id,
      agentVersion: documentationAuditorAgent.manifest.version,
      manifestDigest: "a".repeat(64),
      description: documentationAuditorAgent.manifest.description,
      workflowIds: documentationAuditorAgent.manifest.components.workflowIds,
      toolIds: documentationAuditorAgent.manifest.permissions.toolIds,
      datasetIds: documentationAuditorAgent.manifest.verification.datasetIds,
    },
    objective: {
      target: "grounding",
      description: "Improve evidence citation completeness.",
      constraints: ["Do not add tools."],
    },
    sourceExperimentIds: ["experiment-1"],
    execution: {
      workspaceId: "workbench",
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
    evidenceItems: [{
      id: "case:documentation-health",
      kind: "case-outcome",
      datasetId: "documentation-auditor-smoke",
      datasetCaseId: "documentation-health",
      agentRunId: null,
      summary: "The case failed grounding assessment.",
      details: { passRate: 0 },
    }],
    excludedEvidence: [],
    revisionSurface: {
      mutableFields: [...surface.mutableFields],
      baselinePolicy: structuredClone(surface.baselinePolicy),
    },
  };
}

function proposal(instructions: DocumentationAuditorPolicy["instructions"]) {
  return agentImprovementProposalOutputSchema.parse({
    disposition: "candidate-ready",
    summary: "Clarify the evidence-citation requirement.",
    failureModes: [{
      title: "Incomplete grounding",
      explanation: "The case failed grounding assessment.",
      confidence: "high",
      evidenceIds: ["case:documentation-health"],
    }],
    rootCauseHypotheses: [{
      title: "Instructions are underspecified",
      explanation: "The role does not require citations for every conclusion.",
      confidence: "medium",
      evidenceIds: ["case:documentation-health"],
    }],
    recommendations: [{
      category: "instructions",
      title: "Require citations for every conclusion",
      rationale: "The failed case shows incomplete grounding.",
      proposedChange: "Strengthen the bounded role instructions.",
      priority: "high",
      evidenceIds: ["case:documentation-health"],
    }],
    candidatePolicyPatch: {
      changes: [{
        field: "instructions",
        valueJson: JSON.stringify(instructions),
      }],
    },
    suggestedEvaluationCases: [],
    expectedEffects: [{
      metric: "grounding",
      direction: "improve",
      explanation: "The requirement becomes explicit.",
    }],
    risks: [{
      risk: "The output may become overly citation-heavy.",
      mitigation: "Retain protected readability cases.",
    }],
    evidenceGaps: [],
    verificationPlan: {
      successCriteria: ["The grounding case passes repeatedly."],
      protectedRequirements: ["No protected case regresses."],
      recommendedRepetitions: 3,
    },
  });
}

describe("buildAgentCandidate", () => {
  it("merges a validated patch into an identified in-memory candidate", () => {
    const changedInstructions = {
      roleLines: [
        "You are a repository documentation auditor.",
        "Every conclusion must cite supplied repository evidence.",
      ],
      defaultTaskInstruction: "Audit documentation with exact citations.",
    };

    const candidate = buildAgentCandidate({
      registration: documentationAuditorAgent,
      packet: packet(),
      proposal: proposal(changedInstructions),
      proposalId: "proposal-1",
      candidateId: "00000000-0000-4000-8000-000000000001",
    });

    expect(candidate.evidence).toMatchObject({
      identity: {
        subjectAgentId: "documentation-auditor",
        baseVersion: "1.1.1",
        candidateId: "00000000-0000-4000-8000-000000000001",
        proposalId: "proposal-1",
      },
      changedFields: ["instructions"],
      effectivePolicy: { instructions: changedInstructions },
    });
    expect(candidate.evidence.identity.baselinePolicyDigest).toMatch(
      /^[a-f0-9]{64}$/,
    );
    expect(candidate.evidence.identity.effectivePolicyDigest).not.toBe(
      candidate.evidence.identity.baselinePolicyDigest,
    );
    expect(candidate.registration.manifest).toEqual(
      documentationAuditorAgent.manifest,
    );
    expect(candidate.registration.assess).toBe(
      documentationAuditorAgent.assess,
    );
    expect(candidate.registration.assessDatasetCase).toBe(
      documentationAuditorAgent.assessDatasetCase,
    );
    expect(candidate.registration.inputSchema.parse({})).toMatchObject({
      instruction: "Audit documentation with exact citations.",
    });

    const repeated = buildAgentCandidate({
      registration: documentationAuditorAgent,
      packet: packet(),
      proposal: proposal(changedInstructions),
      proposalId: "proposal-1",
      candidateId: "00000000-0000-4000-8000-000000000002",
    });
    expect(repeated.evidence.identity.effectivePolicyDigest).toBe(
      candidate.evidence.identity.effectivePolicyDigest,
    );
  });

  it("rejects stale, invalid, and no-op policy patches", () => {
    const baseline = documentationAuditorAgent.revisionSurface!
      .baselinePolicy as DocumentationAuditorPolicy;
    const stalePacket = packet();
    stalePacket.revisionSurface!.baselinePolicy = {
      ...stalePacket.revisionSurface!.baselinePolicy,
      instructions: {
        roleLines: ["Stale instructions."],
        defaultTaskInstruction: "Stale task.",
      },
    };

    expect(() =>
      buildAgentCandidate({
        registration: documentationAuditorAgent,
        packet: stalePacket,
        proposal: proposal(baseline.instructions),
        proposalId: "proposal-1",
      }),
    ).toThrow("does not match the analyzed evidence");

    expect(() =>
      buildAgentCandidate({
        registration: documentationAuditorAgent,
        packet: packet(),
        proposal: proposal({
          roleLines: [],
          defaultTaskInstruction: "Invalid candidate.",
        }),
        proposalId: "proposal-1",
      }),
    ).toThrow();

    expect(() =>
      buildAgentCandidate({
        registration: documentationAuditorAgent,
        packet: packet(),
        proposal: proposal(baseline.instructions),
        proposalId: "proposal-1",
      }),
    ).toThrow("does not change effective policy");
  });
});
