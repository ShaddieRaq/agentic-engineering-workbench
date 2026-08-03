import {
  agentImprovementAnalysisResultSchema,
  type AgentImprovementAnalysisResult,
} from "../../src/agents/agentImprovement/agentImprovementAnalysis.js";
import type {
  AgentImprovementEvidencePacket,
} from "../../src/agents/agentImprovement/agentImprovementEvidence.js";
import {
  agentImprovementProposalOutputSchema,
  evaluateAgentImprovementProposal,
} from "../../src/agents/agentImprovement/agentImprovementProposal.js";
import { digestJsonEvidence } from "../../src/agents/agentEvidenceDigest.js";
import {
  documentationAuditorAgent,
} from "../../src/agents/documentationAuditor/documentationAuditorAgent.js";
import {
  documentationAuditorBaselinePolicy,
} from "../../src/agents/documentationAuditor/documentationAuditorPolicy.js";

export function createCandidateReadyImprovementAnalysis(
  options: {
    analysisRunId?: string;
    workspaceId?: string;
  } = {},
): AgentImprovementAnalysisResult {
  const revisionSurface = documentationAuditorAgent.revisionSurface!;
  const packet: AgentImprovementEvidencePacket = {
    packetId: "candidate-workflow-packet",
    subject: {
      agentId: documentationAuditorAgent.manifest.id,
      agentVersion: documentationAuditorAgent.manifest.version,
      manifestDigest: digestJsonEvidence(documentationAuditorAgent.manifest),
      description: documentationAuditorAgent.manifest.description,
      workflowIds: documentationAuditorAgent.manifest.components.workflowIds,
      toolIds: documentationAuditorAgent.manifest.permissions.toolIds,
      datasetIds:
        documentationAuditorAgent.manifest.verification.datasetIds,
    },
    objective: {
      target: "grounding",
      description: "Improve evidence citation completeness.",
      constraints: ["Do not add tools."],
    },
    sourceExperimentIds: ["source-evaluation"],
    execution: {
      workspaceId: options.workspaceId ?? "workbench",
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
      mutableFields: [...revisionSurface.mutableFields],
      baselinePolicy: structuredClone(revisionSurface.baselinePolicy),
    },
  };
  const proposal = agentImprovementProposalOutputSchema.parse({
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
        valueJson: JSON.stringify({
          ...documentationAuditorBaselinePolicy.instructions,
          roleLines: [
            ...documentationAuditorBaselinePolicy.instructions.roleLines,
            "Cite supplied evidence for every conclusion.",
          ],
        }),
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
      mitigation: "Retain the released verification dataset.",
    }],
    evidenceGaps: [],
    verificationPlan: {
      successCriteria: ["The grounding case passes repeatedly."],
      protectedRequirements: ["No protected case regresses."],
      recommendedRepetitions: 1,
    },
  });
  const policyEvaluation = evaluateAgentImprovementProposal(packet, proposal);

  return agentImprovementAnalysisResultSchema.parse({
    analysisRunId:
      options.analysisRunId ??
      "00000000-0000-4000-8000-000000000040",
    packet,
    prompt: "Saved test prompt.",
    rawOutput: JSON.stringify(proposal),
    parsedOutput: proposal,
    refusal: null,
    provider: { model: "test-model", usage: null },
    executionFailure: null,
    policyEvaluation,
    succeeded: policyEvaluation.passed,
    durationMs: 1,
    completedAt: "2026-08-03T23:00:00.000Z",
  });
}
