import { describe, expect, it } from "vitest";
import { createConsoleTestService } from "./helpers/consoleTestService.js";
import {
  createPassingCandidateComparison,
  withFailedPromotionGates,
} from "./helpers/candidateComparisonFixture.js";

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
});
