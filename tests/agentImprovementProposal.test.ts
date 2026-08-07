import { describe, expect, it } from "vitest";
import { z } from "zod";
import { validateCandidatePolicyPatch } from "../src/agents/agentImprovement/agentCandidateBuilder.js";
import type { AgentImprovementEvidencePacket } from "../src/agents/agentImprovement/agentImprovementEvidence.js";
import {
  agentImprovementProposalOutputSchema,
  evaluateAgentImprovementProposal,
} from "../src/agents/agentImprovement/agentImprovementProposal.js";

const packet: AgentImprovementEvidencePacket = {
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

function proposal() {
  return agentImprovementProposalOutputSchema.parse({
    disposition: "candidate-ready",
    summary: "Clarify the evidence-citation requirement.",
    failureModes: [
      {
        title: "Incomplete grounding",
        explanation: "The observed case failed its grounding assessment.",
        confidence: "high",
        evidenceIds: ["case:documentation-health"],
      },
    ],
    rootCauseHypotheses: [
      {
        title: "Instructions are underspecified",
        explanation: "The current wording does not require every claim to cite evidence.",
        confidence: "medium",
        evidenceIds: ["case:documentation-health"],
      },
    ],
    recommendations: [
      {
        category: "instructions",
        title: "Require citations for every conclusion",
        rationale: "The failed case shows incomplete grounding.",
        proposedChange: "State that every conclusion must cite supplied evidence.",
        priority: "high",
        evidenceIds: ["case:documentation-health"],
      },
    ],
    candidatePolicyPatch: {
      changes: [
        {
          field: "instructions",
          valueJson: JSON.stringify(
            "Every conclusion must cite supplied repository evidence.",
          ),
        },
      ],
    },
    suggestedEvaluationCases: [],
    expectedEffects: [
      {
        metric: "grounding",
        direction: "improve",
        explanation: "The requirement becomes explicit.",
      },
    ],
    risks: [
      {
        risk: "The response may become overly citation-heavy.",
        mitigation: "Retain protected readability cases.",
      },
    ],
    evidenceGaps: [],
    verificationPlan: {
      successCriteria: ["The failed grounding case passes."],
      protectedRequirements: ["No protected case regresses."],
      recommendedRepetitions: 3,
    },
  });
}

describe("evaluateAgentImprovementProposal", () => {
  it("accepts a grounded patch within the declared revision surface", () => {
    expect(evaluateAgentImprovementProposal(packet, proposal())).toMatchObject({
      passed: true,
      invalidEvidenceIds: [],
    });
  });

  it("rejects invented evidence citations", () => {
    const input = proposal();
    input.recommendations[0]!.evidenceIds = ["case:not-supplied"];

    expect(evaluateAgentImprovementProposal(packet, input)).toMatchObject({
      passed: false,
      invalidEvidenceIds: ["case:not-supplied"],
    });
  });

  it("rejects candidate fields outside the revision surface", () => {
    const input = proposal();
    input.candidatePolicyPatch = {
      changes: [
        { field: "toolIds", valueJson: JSON.stringify(["arbitrary-shell"]) },
      ],
    };

    expect(evaluateAgentImprovementProposal(packet, input)).toMatchObject({
      passed: false,
    });
  });

  it("rejects a policy patch on a non-candidate disposition", () => {
    const input = proposal();
    input.disposition = "engineering-change-required";

    expect(evaluateAgentImprovementProposal(packet, input)).toMatchObject({
      passed: false,
    });
  });

  it("rejects an invalid serialized candidate value", () => {
    const input = proposal();
    input.candidatePolicyPatch!.changes[0]!.valueJson = "not-json";

    expect(evaluateAgentImprovementProposal(packet, input)).toMatchObject({
      passed: false,
      issues: [expect.stringContaining("invalid JSON")],
    });
  });

  it("fails at proposal time when the patched policy violates the subject schema", () => {
    // Reproduces the live failure: a 321-character instruction line passed
    // proposal policy and surfaced as a raw parse error only when the
    // operator clicked Run frozen comparison.
    const surfaceSchema = z
      .object({ instructions: z.array(z.string().max(300)) })
      .strict();
    const validateCandidatePolicy = (patch: {
      changes: { field: string; valueJson: string }[];
    }) =>
      validateCandidatePolicyPatch(
        { schema: surfaceSchema, baselinePolicy: { instructions: ["short"] } },
        patch,
      );

    const overlong = proposal();
    overlong.candidatePolicyPatch = {
      changes: [
        {
          field: "instructions",
          valueJson: JSON.stringify({ instructions: ["x".repeat(321)] }),
        },
      ],
    };
    // The packet's mutable field is "instructions" in this fixture? Use the
    // fixture's own field to stay inside the revision surface.
    overlong.candidatePolicyPatch.changes[0]!.field =
      packet.revisionSurface!.mutableFields[0]!;
    const failed = evaluateAgentImprovementProposal(packet, overlong, {
      validateCandidatePolicy: () => [
        "Candidate patch produces an invalid policy at instructions.0: Too big: expected string to have <=300 characters.",
      ],
    });
    expect(failed.passed).toBe(false);
    expect(failed.issues[0]).toContain("invalid policy at instructions.0");

    // And the real validator helper reports the same class of issue.
    const helperIssues = validateCandidatePolicy({
      changes: [
        {
          field: "instructions",
          valueJson: JSON.stringify(["x".repeat(321)]),
        },
      ],
    });
    expect(helperIssues[0]).toContain("invalid policy at instructions");

    // A legal patch passes through the validator untouched.
    expect(
      validateCandidatePolicy({
        changes: [
          { field: "instructions", valueJson: JSON.stringify(["fine"]) },
        ],
      }),
    ).toEqual([]);
  });

  it("generates an OpenAI-compatible schema without propertyNames", () => {
    expect(
      JSON.stringify(z.toJSONSchema(agentImprovementProposalOutputSchema)),
    ).not.toContain('"propertyNames"');
  });
});
