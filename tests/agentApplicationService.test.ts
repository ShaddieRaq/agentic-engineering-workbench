import { describe, expect, it } from "vitest";
import { createConsoleTestService } from "./helpers/consoleTestService.js";
import {
  createPassingCandidateComparison,
  withFailedPromotionGates,
} from "./helpers/candidateComparisonFixture.js";
import {
  createCandidateReadyImprovementAnalysis,
  createToolCapabilityImprovementAnalysis,
} from "./helpers/improvementProposalFixture.js";

describe("AgentApplicationService", () => {
  it("shares catalog description and persisted execution across entry points", async () => {
    const { service } = await createConsoleTestService();

    const description = service.describeAgent("console-test-agent");
    const result = await service.run({
      agentId: "console-test-agent",
      input: { instruction: "Explain the platform." },
    });

    expect(description.inputSchema).toMatchObject({ type: "object" });
    expect(result.run.output).toEqual({ answer: "Explain the platform." });
    expect((await service.artifacts.load(result.artifactId)).kind).toBe("agent-run");
  });

  it("describes registered tool contracts and consumers", async () => {
    const { service } = await createConsoleTestService();
    expect(service.listTools()).toEqual([]);
    expect(() => service.describeTool("unknown-tool")).toThrow("Unknown tool");
  });

  it("records an immutable promotion decision against a saved candidate comparison", async () => {
    const { service } = await createConsoleTestService();
    const comparison = await createPassingCandidateComparison();
    await service.artifacts.saveAgentCandidateEvaluation(comparison);

    const approved = await service.recordPromotionDecision({
      candidateEvaluationId: comparison.candidateEvaluationId,
      decision: "approve",
      operatorId: "operator-1",
      rationale: "Approve the bounded citation improvement.",
    });

    expect(approved).toMatchObject({
      decision: {
        decision: "approve",
        candidateEvaluationArtifactId: comparison.candidateEvaluationId,
        gatesPassed: true,
        releaseTask: { kind: "source-controlled-agent-release" },
      },
    });
    expect(
      (await service.artifacts.load(approved.artifactId)).kind,
    ).toBe("agent-promotion-decision");
    await expect(
      service.recordPromotionDecision({
        candidateEvaluationId: comparison.candidateEvaluationId,
        decision: "reject",
        operatorId: "operator-1",
        rationale: "Reject with mismatched lineage.",
        proposalArtifactId: "different-proposal",
      }),
    ).rejects.toThrow(
      "Improvement proposal does not match the candidate comparison lineage",
    );

    const failed = withFailedPromotionGates(comparison);
    failed.candidateEvaluationId = "00000000-0000-4000-8000-000000000021";
    await service.artifacts.saveAgentCandidateEvaluation(failed);
    await expect(
      service.recordPromotionDecision({
        candidateEvaluationId: failed.candidateEvaluationId,
        decision: "approve",
        operatorId: "operator-1",
        rationale: "Should be refused.",
      }),
    ).rejects.toThrow("cannot be approved");
  });

  it("evaluates a saved candidate-ready proposal under frozen conditions", async () => {
    const { service } = await createConsoleTestService(true, {
      includeCandidateWorkflow: true,
    });
    const proposal = createCandidateReadyImprovementAnalysis();
    const proposalReference =
      await service.artifacts.saveAgentImprovementProposal(proposal);

    const result = await service.evaluateImprovementProposal(
      proposalReference.id,
    );

    expect(result.evaluation).toMatchObject({
      plan: {
        subject: {
          agentId: "documentation-auditor",
          agentVersion: "1.0.0",
        },
        candidate: { proposalId: proposalReference.id },
        workspaceId: proposal.packet.execution.workspaceId,
        model: proposal.packet.execution.model,
        execution: {
          repetitions: proposal.packet.execution.repetitions,
          concurrency: proposal.packet.execution.concurrency,
        },
      },
    });
    expect(result.datasetRunArtifactIds).toHaveLength(2);
    expect(
      (await service.artifacts.load(result.artifactId)).kind,
    ).toBe("agent-candidate-evaluation");
  });

  it("rejects a candidate proposal for a stale registered manifest", async () => {
    const { service } = await createConsoleTestService(true, {
      includeCandidateWorkflow: true,
    });
    const proposal = createCandidateReadyImprovementAnalysis({
      analysisRunId: "00000000-0000-4000-8000-000000000041",
    });
    proposal.packet.subject.manifestDigest = "c".repeat(64);
    const proposalReference =
      await service.artifacts.saveAgentImprovementProposal(proposal);

    await expect(
      service.evaluateImprovementProposal(proposalReference.id),
    ).rejects.toThrow(
      "Registered subject manifest does not match the improvement proposal",
    );
  });

  it("creates a read-only Tool Builder run with exact proposal lineage", async () => {
    const { service } = await createConsoleTestService(true, {
      includeToolBuilder: true,
    });
    const proposal = createToolCapabilityImprovementAnalysis();
    const proposalReference =
      await service.artifacts.saveAgentImprovementProposal(proposal);

    const result = await service.handoffImprovementToToolBuilder({
      proposalArtifactId: proposalReference.id,
      recommendationIndex: 0,
    });

    expect(result.run).toMatchObject({
      agentId: "tool-builder",
      configuration: {
        model: "gpt-5.4-mini",
        workspaceId: "workbench",
        permittedToolIds: [],
      },
      input: {
        allowSideEffects: false,
        sourceImprovement: {
          artifactId: proposalReference.id,
          recommendationIndex: 0,
        },
      },
    });
    expect(JSON.stringify(result.run.input)).toContain(
      "case:documentation-health",
    );
    expect((await service.artifacts.load(result.artifactId)).kind).toBe(
      "agent-run",
    );
  });

  it("rejects ineligible Tool Builder handoffs", async () => {
    const { service } = await createConsoleTestService(true, {
      includeToolBuilder: true,
    });
    const proposal = createToolCapabilityImprovementAnalysis();
    const proposalReference =
      await service.artifacts.saveAgentImprovementProposal(proposal);

    await expect(
      service.handoffImprovementToToolBuilder({
        proposalArtifactId: proposalReference.id,
        recommendationIndex: 4,
      }),
    ).rejects.toThrow("recommendation index is out of range");

    const wrongDisposition = createCandidateReadyImprovementAnalysis({
      analysisRunId: "00000000-0000-4000-8000-000000000051",
    });
    const wrongDispositionReference =
      await service.artifacts.saveAgentImprovementProposal(wrongDisposition);
    await expect(
      service.handoffImprovementToToolBuilder({
        proposalArtifactId: wrongDispositionReference.id,
        recommendationIndex: 0,
      }),
    ).rejects.toThrow("engineering-change-required");

    const wrongCategory = createToolCapabilityImprovementAnalysis({
      analysisRunId: "00000000-0000-4000-8000-000000000052",
    });
    wrongCategory.parsedOutput!.recommendations[0]!.category =
      "implementation";
    const wrongCategoryReference =
      await service.artifacts.saveAgentImprovementProposal(wrongCategory);
    await expect(
      service.handoffImprovementToToolBuilder({
        proposalArtifactId: wrongCategoryReference.id,
        recommendationIndex: 0,
      }),
    ).rejects.toThrow("tool-capability recommendation");

    const failedPolicy = createToolCapabilityImprovementAnalysis({
      analysisRunId: "00000000-0000-4000-8000-000000000053",
    });
    failedPolicy.succeeded = false;
    failedPolicy.policyEvaluation = {
      passed: false,
      citedEvidenceIds: [],
      invalidEvidenceIds: ["missing"],
      issues: ["Missing evidence."],
      message: "Proposal policy failed.",
    };
    const failedPolicyReference =
      await service.artifacts.saveAgentImprovementProposal(failedPolicy);
    await expect(
      service.handoffImprovementToToolBuilder({
        proposalArtifactId: failedPolicyReference.id,
        recommendationIndex: 0,
      }),
    ).rejects.toThrow("successful, policy-valid");
  });
});
