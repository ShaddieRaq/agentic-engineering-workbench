import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { digestJsonEvidence } from "../src/agents/agentEvidenceDigest.js";
import { projectIntakeBaselinePolicy } from "../src/agents/projectIntake/projectIntakePolicy.js";
import { createProjectIntakeExport } from "../src/foundry/agentExport.js";
import {
  exportFeedbackRecordSchema,
  importExportFeedback,
} from "../src/foundry/exportFeedback.js";
import {
  agentPromotionDecisionSchema,
  type AgentPromotionDecision,
} from "../src/agents/evaluations/agentPromotionDecision.js";

function approvedDecision(): AgentPromotionDecision {
  const policyDigest = digestJsonEvidence(projectIntakeBaselinePolicy);
  const candidateId = randomUUID();
  return agentPromotionDecisionSchema.parse({
    decisionId: randomUUID(),
    decision: "approve",
    candidateEvaluationArtifactId: "candidate-evaluation-1",
    proposalArtifactId: "proposal-1",
    subject: {
      agentId: "project-intake",
      agentVersion: "0.3.0",
      manifestDigest: "a".repeat(64),
    },
    candidate: {
      subjectAgentId: "project-intake",
      baseVersion: "0.3.0",
      candidateId,
      proposalId: "proposal-1",
      baselinePolicyDigest: "b".repeat(64),
      effectivePolicyDigest: policyDigest,
    },
    planId: randomUUID(),
    planDigest: "c".repeat(64),
    gatesPassed: true,
    operatorId: "operator-1",
    rationale: "All gates passed.",
    releaseTask: {
      kind: "source-controlled-agent-release",
      subjectAgentId: "project-intake",
      baseVersion: "0.3.0",
      candidateId,
      proposalId: "proposal-1",
      effectivePolicyDigest: policyDigest,
      requiredActions: ["Apply the approved policy."],
    },
    decidedAt: new Date().toISOString(),
  });
}

function provenance() {
  return createProjectIntakeExport({ decision: approvedDecision() });
}

function bundleFor(manifest: ReturnType<typeof provenance>) {
  return {
    exportIdentity: {
      agentId: manifest.subject.agentId,
      agentVersion: manifest.subject.agentVersion,
      policyDigest: manifest.subject.policyDigest,
      exportId: manifest.exportId,
    },
    sessionDate: "2026-08-04",
    turnCount: 1,
    finalBriefVersion: 1,
    finalBrief: {
      title: "Example",
      ideaSummary: "An example idea.",
      goals: [],
      users: [],
      constraints: [],
      risks: [],
      nonGoals: [],
      assumptions: [],
      acceptanceCriteria: [],
      openQuestions: [],
    },
    issuesObserved: ["The turn schema was missing from the package."],
    observations: ["Session ended after one turn."],
  };
}

describe("importExportFeedback", () => {
  it("imports a bundle whose identity matches the export provenance", () => {
    const manifest = provenance();
    const record = importExportFeedback({
      bundle: bundleFor(manifest),
      provenance: manifest,
    });

    expect(exportFeedbackRecordSchema.parse(record)).toEqual(record);
    expect(record.exportId).toBe(manifest.exportId);
    expect(record.provenanceVerified).toBe(true);
    expect(record.bundle.issuesObserved).toHaveLength(1);
  });

  it("rejects an export id mismatch", () => {
    const manifest = provenance();
    const bundle = bundleFor(manifest);
    bundle.exportIdentity.exportId = randomUUID();

    expect(() =>
      importExportFeedback({ bundle, provenance: manifest }),
    ).toThrowError(/does not match provenance export/i);
  });

  it("rejects a policy digest mismatch", () => {
    const manifest = provenance();
    const bundle = bundleFor(manifest);
    bundle.exportIdentity.policyDigest = "d".repeat(64);

    expect(() =>
      importExportFeedback({ bundle, provenance: manifest }),
    ).toThrowError(/policy digest/i);
  });

  it("rejects a malformed final brief", () => {
    const manifest = provenance();
    const bundle = bundleFor(manifest) as Record<string, unknown>;
    bundle["finalBrief"] = { title: "Missing everything" };

    expect(() =>
      importExportFeedback({ bundle, provenance: manifest }),
    ).toThrowError();
  });

  it("rejects empty issue strings", () => {
    const manifest = provenance();
    const bundle = bundleFor(manifest);
    bundle.issuesObserved = [""];

    expect(() =>
      importExportFeedback({ bundle, provenance: manifest }),
    ).toThrowError();
  });
});
