import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getAgentDatasetDefinition } from "../src/agents/datasets/agentDatasetRegistry.js";
import { platformAgentRegistry } from "../src/agents/platformAgentRegistry.js";
import { runAgent } from "../src/agents/agentRunner.js";
import type { AIProvider } from "../src/providers/aiProvider.js";
import {
  getArtifactSource,
  presentArtifact,
} from "../src/presentation/artifactPresenter.js";
import { createPlatformToolRegistry } from "../src/tools/toolRegistry.js";

describe("PlaywrightFailureTriageAgent", () => {
  it("is registered with bounded tools and hidden-ground-truth cases", () => {
    const manifest = platformAgentRegistry.get(
      "playwright-failure-triage",
    ).manifest;
    const dataset = getAgentDatasetDefinition(
      "playwright-failure-triage-smoke",
    );

    expect(manifest).toMatchObject({
      version: "0.1.0",
      status: "experimental",
      permissions: {
        toolIds: ["read-file", "run-verification-command"],
      },
      verification: {
        datasetIds: ["playwright-failure-triage-smoke"],
        minimumPassRate: 1,
      },
    });
    expect(dataset.cases).toHaveLength(3);
    expect(dataset.cases.map(({ expected }) => expected)).toEqual([
      expect.objectContaining({ classification: "test-defect" }),
      expect.objectContaining({ classification: "application-defect" }),
      expect.objectContaining({ classification: "environment" }),
    ]);
    expect(dataset.cases[0]?.input).not.toHaveProperty("expected");
  });

  it("runs through the shared runner with grounded source evidence", async () => {
    const root = await mkdtemp(join(tmpdir(), "playwright-triage-agent-"));
    await mkdir(join(root, "tests"));
    await mkdir(join(root, "src"));
    await writeFile(
      join(root, "tests", "login.spec.ts"),
      "getByTestId('submit-login')",
    );
    await writeFile(
      join(root, "src", "loginForm.ts"),
      "data-testid='login-submit'",
    );
    const provider: AIProvider = {
      async generate<TOutput>() {
        return {
          rawOutput: "structured diagnosis",
          parsedOutput: {
            summary: "The login test uses a stale locator.",
            classification: "test-defect",
            confidence: "high",
            likelyRootCause: "The test ID differs from the maintained form.",
            evidence: [
              {
                claim: "The failure timed out on submit-login.",
                source: "failure-report",
                path: null,
              },
              {
                claim: "The form uses login-submit.",
                source: "repository-file",
                path: "src/loginForm.ts",
              },
            ],
            recommendedActions: [
              {
                priority: "first",
                owner: "test",
                action: "Update the locator and rerun the focused test.",
              },
            ],
            needsMoreEvidence: [],
          } as TOutput,
          refusal: null,
          provider: { model: "fake-model", usage: null },
        };
      },
    };
    const result = await runAgent(
      "playwright-failure-triage",
      {
        testTitle: "customer can sign in",
        testFile: "tests/login.spec.ts",
        status: "timed-out",
        error: { message: "Timed out on submit-login." },
        candidatePaths: ["src/loginForm.ts"],
      },
      {
        agents: platformAgentRegistry,
        tools: createPlatformToolRegistry(root),
        provider,
        workspaceRoot: root,
        workspaceId: "fixture",
      },
    );

    expect(result).toMatchObject({
      agentId: "playwright-failure-triage",
      succeeded: true,
      configuration: {
        permittedToolIds: ["read-file", "run-verification-command"],
      },
      output: {
        succeeded: true,
        classification: "test-defect",
        confidence: "high",
      },
    });
    const presentation = presentArtifact("triage-artifact", {
      kind: "agent-run",
      artifact: result,
    });
    expect(presentation).toMatchObject({
      presentationKind: "playwright-failure-triage",
      title: "Failure Triage: customer can sign in",
      overview: "The login test uses a stale locator.",
      findings: [expect.objectContaining({ category: "test-defect" })],
    });
    expect(presentation.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "classification",
          value: "test-defect",
        }),
        expect.objectContaining({ id: "confidence", value: "high" }),
      ]),
    );
    expect(
      getArtifactSource(
        { kind: "agent-run", artifact: result },
        "src/loginForm.ts",
      ),
    ).toMatchObject({
      path: "src/loginForm.ts",
      content: "data-testid='login-submit'",
    });
  });

  it("assesses classification against ground truth not shown to the model", () => {
    const registration = platformAgentRegistry.get(
      "playwright-failure-triage",
    );
    const assessment = registration.assessDatasetCase!(
      {},
      {
        triageRunId: "triage",
        succeeded: true,
        summary: "Wrong ownership.",
        classification: "application-defect",
        confidence: "high",
        needsMoreEvidence: [],
        triageEvidence: {
          parsedOutput: {
            evidence: [{ source: "failure-report", path: null }],
          },
        },
      },
      {
        classification: "test-defect",
        requiredEvidencePaths: [],
      },
    );

    expect(assessment).toEqual({
      passed: false,
      message:
        "Expected test-defect; received application-defect.",
    });
  });
});
