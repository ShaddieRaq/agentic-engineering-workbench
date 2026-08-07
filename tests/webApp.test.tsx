// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppRoutes } from "../web/src/App.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("agent workbench web interface", () => {
  it("submits string-array fields from the guided form as arrays", async () => {
    const agent = {
      id: "tool-builder", name: "Tool Builder", version: "0.1.0",
      status: "experimental", description: "Builds tool proposals.", owner: "local-platform",
      tags: ["tools"], defaultModel: "gpt-5.4-mini",
      components: { workflowIds: ["tool-proposal"], harnessIds: [], scenarioIds: [], datasetIds: [] },
      permissions: { toolIds: [] },
      verification: { datasetIds: ["tool-builder-smoke"], minimumPassRate: 1 },
    };
    let submittedBody: unknown = null;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.endsWith("/api/workspaces")) {
        return new Response(JSON.stringify({
          workspaces: [{ id: "workbench", name: "Workbench", rootPath: "/repo", addedAt: "2026-08-02T12:00:00.000Z", builtIn: true }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (path.endsWith("/api/agents/tool-builder/runs") && init?.method === "POST") {
        submittedBody = JSON.parse(String(init.body));
        return new Response(JSON.stringify({ operationId: "operation-1" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (path.endsWith("/api/agents/tool-builder")) {
        return new Response(JSON.stringify({
          manifest: agent,
          inputSchema: {
            type: "object",
            required: ["request", "allowSideEffects", "additionalConstraints"],
            properties: {
              request: { type: "string" },
              targetToolId: { type: "string" },
              allowSideEffects: { type: "boolean", default: false },
              additionalConstraints: {
                type: "array",
                items: { type: "string" },
                default: [],
                maxItems: 20,
              },
            },
          },
          outputSchema: { type: "object", properties: {} },
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (path.endsWith("/api/operations/operation-1")) {
        return new Response(JSON.stringify({
          operationId: "operation-1", kind: "agent-run", agentId: "tool-builder",
          status: "completed", events: [], result: null, error: null,
          createdAt: "2026-08-02T12:00:00.000Z", completedAt: "2026-08-02T12:00:01.000Z",
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
    }));

    window.history.replaceState(null, "", "/agents/tool-builder");
    render(<AppRoutes />);

    expect(await screen.findByRole("heading", { name: "Tool Builder" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("request"), {
      target: { value: "Create a bounded dependency-version report tool." },
    });
    fireEvent.change(screen.getByLabelText(/additionalConstraints/), {
      target: { value: "Do not add dependencies.\nDo not execute commands." },
    });
    const runButton = screen.getByRole("button", { name: "Run agent" });
    await waitFor(() => expect(runButton).toBeEnabled());
    fireEvent.submit(runButton.closest("form")!);

    await waitFor(() => expect(submittedBody).not.toBeNull());
    expect(submittedBody).toMatchObject({
      input: {
        request: "Create a bounded dependency-version report tool.",
        allowSideEffects: false,
        additionalConstraints: [
          "Do not add dependencies.",
          "Do not execute commands.",
        ],
      },
    });
    expect((submittedBody as { input: object }).input).not.toHaveProperty("targetToolId");
    expect(screen.getByText("Enter one item per line (up to 20).")).toBeInTheDocument();
  });

  it("renders the catalog as complete agent products", async () => {
    const agent = {
      id: "repository-assistant", name: "Repository Assistant", version: "1.0.0",
      status: "active", description: "Inspects a repository.", owner: "local-platform",
      tags: ["engineering"], defaultModel: "gpt-5.4-mini",
      components: { workflowIds: ["repository-assistant"], harnessIds: [], scenarioIds: [], datasetIds: [] },
      permissions: { toolIds: ["read-file"] },
      verification: { datasetIds: ["repository-assistant-smoke"], minimumPassRate: 1 },
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      const body = path.endsWith("/api/agents")
        ? { agents: [agent] }
        : path.endsWith("/api/agents/repository-assistant")
          ? { manifest: agent, inputSchema: { type: "object", properties: {} }, outputSchema: { type: "object", properties: {} } }
        : {};
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }));

    window.history.replaceState(null, "", "/agents");
    render(<AppRoutes />);

    expect(await screen.findByRole("heading", { name: "Repository Assistant" })).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.textContent === "1 tools")).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.textContent === "1 datasets")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: /Repository Assistant/ }));
    expect(window.location.pathname).toBe("/agents/repository-assistant");
    expect(await screen.findByText("Product identity")).toBeInTheDocument();
  });

  it("renders a grounded documentation audit and reveals saved cited context", async () => {
    const presentation = {
      artifactId: "audit-artifact", artifactKind: "agent-run", presentationKind: "documentation-audit",
      title: "Documentation Audit", agentId: "documentation-auditor", agentVersion: "1.0.0", workspaceId: "sample",
      succeeded: true, assessment: "Grounded evidence.", overview: "One stale command was found.",
      completedAt: "2026-08-02T12:00:00.000Z", durationMs: 120,
      metrics: [{ id: "findings", label: "Findings", value: "1", detail: "1 high severity" }],
      findings: [{ title: "Stale command", category: "stale", severity: "high", explanation: "The command is absent.", evidencePaths: ["README.md"], recommendation: "Replace it." }],
      coverageGaps: [], prioritizedActions: ["Correct the README."],
      sources: [{ path: "README.md", sizeBytes: 24, rationale: "Documentation evidence.", toolCallId: "read-1" }],
      timeline: [{ id: "inventory", label: "Repository inventory", status: "completed", detail: "8 files observed.", durationMs: 4 }],
      usage: { model: "gpt-5.4-mini", inputTokens: 100, cachedInputTokens: 0, outputTokens: 20, reasoningTokens: 0, totalTokens: 120, estimatedCostUsd: 0.0001, pricingIds: ["price-1"] },
      warnings: [],
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      const body = path.includes("/presentation")
        ? presentation
        : path.includes("/source?")
          ? { path: "README.md", content: "Run npm run old-command.", sizeBytes: 24, rationale: "Documentation evidence.", toolCallId: "read-1" }
          : path.endsWith("/api/workspaces")
            ? { workspaces: [{ id: "workbench", name: "Workbench", rootPath: "/repo", addedAt: "2026-08-02T12:00:00.000Z", builtIn: true }] }
            : path.endsWith("/api/artifacts/audit-artifact")
              ? { kind: "agent-run", artifact: { agentId: "documentation-auditor" } }
              : {};
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    }));

    window.history.replaceState(null, "", "/runs/audit-artifact");
    render(<AppRoutes />);

    expect(await screen.findByRole("heading", { name: "Documentation Audit" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Stale command" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "README.md" }));
    expect(await screen.findByText("Run npm run old-command.")).toBeInTheDocument();
  });

  it("runs a candidate-ready proposal and links its frozen comparison", async () => {
    const proposal = {
      analysisRunId: "proposal-artifact",
      succeeded: true,
      packet: {
        subject: {
          agentId: "documentation-auditor",
          agentVersion: "1.0.0",
        },
        execution: {
          workspaceId: "workbench",
          model: "test-model",
          repetitions: 1,
          concurrency: 1,
        },
      },
      parsedOutput: {
        disposition: "candidate-ready",
        candidatePolicyPatch: {
          changes: [{ field: "instructions", valueJson: "{}" }],
        },
      },
      policyEvaluation: {
        passed: true,
        message: "Proposal passed policy evaluation.",
      },
    };
    const presentation = {
      artifactId: "proposal-artifact",
      artifactKind: "agent-improvement-proposal",
      presentationKind: "agent-improvement",
      title: "Documentation Auditor Improvement Proposal",
      agentId: "documentation-auditor",
      agentVersion: "1.0.0",
      workspaceId: "workbench",
      succeeded: true,
      assessment: "Proposal passed policy evaluation.",
      overview: "Clarify evidence citation requirements.",
      completedAt: "2026-08-03T23:00:00.000Z",
      durationMs: 1,
      metrics: [],
      findings: [],
      coverageGaps: [],
      prioritizedActions: [],
      sources: [],
      timeline: [],
      usage: null,
      warnings: [],
      improvement: null,
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const body = path.endsWith("/api/workspaces")
        ? { workspaces: [{ id: "workbench", name: "Workbench", rootPath: "/repo", addedAt: "2026-08-03T23:00:00.000Z", builtIn: true }] }
        : path.endsWith("/api/artifacts/proposal-artifact/presentation")
          ? presentation
          : path.endsWith("/api/artifacts/proposal-artifact")
            ? { kind: "agent-improvement-proposal", artifact: proposal }
            : path.endsWith("/api/improvement-proposals/proposal-artifact/candidate-evaluations") && init?.method === "POST"
              ? { operationId: "candidate-operation" }
              : path.endsWith("/api/operations/candidate-operation")
                ? {
                    operationId: "candidate-operation",
                    kind: "agent-candidate-evaluation",
                    agentId: "documentation-auditor",
                    status: "completed",
                    events: [],
                    result: { artifactId: "candidate-comparison" },
                    error: null,
                    createdAt: "2026-08-03T23:00:01.000Z",
                    completedAt: "2026-08-03T23:00:02.000Z",
                  }
                : {};
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }));

    window.history.replaceState(null, "", "/runs/proposal-artifact");
    render(<AppRoutes />);

    expect(
      await screen.findByRole("heading", { name: "Run candidate comparison" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Run frozen comparison" }),
    );
    expect(
      await screen.findByRole("link", { name: "Inspect candidate comparison" }),
    ).toHaveAttribute("href", "/runs/candidate-comparison");
  });

  it("runs only eligible tool-capability recommendations through Tool Builder", async () => {
    const proposal = {
      analysisRunId: "tool-handoff-proposal",
      succeeded: true,
      packet: {
        subject: {
          agentId: "documentation-auditor",
          agentVersion: "1.0.0",
        },
        execution: {
          workspaceId: "workbench",
          model: "test-model",
          repetitions: 1,
          concurrency: 1,
        },
      },
      parsedOutput: {
        disposition: "engineering-change-required",
        candidatePolicyPatch: null,
        recommendations: [
          {
            category: "tool-capability",
            title: "Add bounded reference inventory",
            rationale: "Deterministic reference evidence is missing.",
            proposedChange: "Propose one read-only inventory tool.",
            priority: "high",
            evidenceIds: ["case:documentation-health"],
          },
          {
            category: "implementation",
            title: "Refactor the workflow",
            rationale: "A workflow change may also be needed.",
            proposedChange: "Review the workflow implementation.",
            priority: "medium",
            evidenceIds: ["case:documentation-health"],
          },
        ],
      },
      policyEvaluation: {
        passed: true,
        message: "Proposal passed policy evaluation.",
      },
    };
    const presentation = {
      artifactId: "tool-handoff-proposal",
      artifactKind: "agent-improvement-proposal",
      presentationKind: "agent-improvement",
      title: "Documentation Auditor Improvement Proposal",
      agentId: "documentation-auditor",
      agentVersion: "1.0.0",
      workspaceId: "workbench",
      succeeded: true,
      assessment: "Proposal passed policy evaluation.",
      overview: "A bounded tool capability is required.",
      completedAt: "2026-08-03T23:10:00.000Z",
      durationMs: 1,
      metrics: [],
      findings: [],
      coverageGaps: [],
      prioritizedActions: [],
      sources: [],
      timeline: [],
      usage: null,
      warnings: [],
      improvement: null,
    };
    let submittedBody: unknown = null;
    let submittedRiskBody: unknown = null;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const body = path.endsWith("/api/workspaces")
        ? { workspaces: [{ id: "workbench", name: "Workbench", rootPath: "/repo", addedAt: "2026-08-03T23:10:00.000Z", builtIn: true }] }
        : path.endsWith("/api/artifacts/tool-handoff-proposal/presentation")
          ? presentation
          : path.endsWith("/api/artifacts/tool-handoff-proposal")
            ? { kind: "agent-improvement-proposal", artifact: proposal }
            : path.endsWith("/api/improvement-proposals/tool-handoff-proposal/tool-builder-handoffs") && init?.method === "POST"
              ? (
                  submittedBody = JSON.parse(String(init.body)),
                  { operationId: "tool-builder-operation" }
                )
              : path.endsWith("/api/improvement-proposals/tool-handoff-proposal/change-risk-reviewer-handoffs") && init?.method === "POST"
                ? (
                    submittedRiskBody = JSON.parse(String(init.body)),
                    { operationId: "change-risk-operation" }
                  )
              : path.endsWith("/api/operations/tool-builder-operation")
                ? {
                    operationId: "tool-builder-operation",
                    kind: "agent-run",
                    agentId: "tool-builder",
                    status: "completed",
                    events: [],
                    result: { artifactId: "tool-builder-run" },
                    error: null,
                    createdAt: "2026-08-03T23:10:01.000Z",
                    completedAt: "2026-08-03T23:10:02.000Z",
                  }
                : path.endsWith("/api/operations/change-risk-operation")
                  ? {
                      operationId: "change-risk-operation",
                      kind: "agent-run",
                      agentId: "change-risk-reviewer",
                      status: "completed",
                      events: [],
                      result: { artifactId: "change-risk-run" },
                      error: null,
                      createdAt: "2026-08-03T23:10:03.000Z",
                      completedAt: "2026-08-03T23:10:04.000Z",
                    }
                : {};
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }));

    window.history.replaceState(null, "", "/runs/tool-handoff-proposal");
    render(<AppRoutes />);

    expect(
      await screen.findByRole("heading", {
        name: "Request a Tool Builder proposal",
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Run Tool Builder" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Run Tool Builder" }));
    await waitFor(() =>
      expect(submittedBody).toEqual({ recommendationIndex: 0 })
    );
    expect(
      await screen.findByRole("link", { name: "Inspect Tool Builder proposal" }),
    ).toHaveAttribute("href", "/runs/tool-builder-run");
    expect(
      screen.getByRole("heading", {
        name: "Review applied workspace changes",
      }),
    ).toBeInTheDocument();
    fireEvent.change(
      screen.getByLabelText("Tool Builder run artifact ID (optional)"),
      { target: { value: "tool-builder-run" } },
    );
    expect(
      screen.getAllByRole("button", { name: "Run Change Risk Reviewer" }),
    ).toHaveLength(2);
    fireEvent.click(
      screen.getAllByRole("button", { name: "Run Change Risk Reviewer" })[0]!,
    );
    await waitFor(() =>
      expect(submittedRiskBody).toEqual({
        recommendationIndex: 0,
        toolBuilderRunArtifactId: "tool-builder-run",
      })
    );
    expect(
      await screen.findByRole("link", { name: "Inspect Change Risk review" }),
    ).toHaveAttribute("href", "/runs/change-risk-run");
  });

  it("connects experiment history, comparison, case results, and trial evidence", async () => {
    const experiment = {
      experimentId: "candidate-evaluation", agentId: "evaluation-agent", agentVersion: "1.1.0",
      workspaceId: "workbench", model: "fake-model", execution: { repetitions: 2, concurrency: 1 },
      datasets: [],
      summary: { totalDatasets: 1, passedDatasets: 0, failedDatasets: 1, totalCases: 1, passedCases: 0, failedCases: 1, totalRuns: 2, passedRuns: 1, failedRuns: 1, passRate: 0.5 },
      passed: false, completedAt: "2026-08-02T12:00:02.000Z",
    };
    const datasetCase = {
      datasetId: "triage-dataset", datasetCaseId: "checkout-timeout", totalRuns: 2,
      passedRuns: 1, failedRuns: 1, passRate: 0.5, minimumPassRate: 1, passed: false,
      input: { failureLog: "Timeout waiting for checkout." },
      trials: [{
        agentRunId: "trial-1", succeeded: false,
        input: { failureLog: "Timeout waiting for checkout." },
        output: { classification: "application-defect" },
        assessment: { passed: false, message: "Expected a test defect." }, failure: null,
        durationMs: 12, completedAt: "2026-08-02T12:00:01.000Z",
      }],
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      let body: unknown = {};
      if (path.endsWith("/api/workspaces")) {
        body = { workspaces: [{ id: "workbench", name: "Workbench", rootPath: "/repo", addedAt: "2026-08-02T12:00:00.000Z", builtIn: true }] };
      } else if (path.endsWith("/api/evaluations/candidate-evaluation/improvements") && init?.method === "POST") {
        body = { operationId: "improvement-operation" };
      } else if (path.endsWith("/api/operations/improvement-operation")) {
        body = {
          operationId: "improvement-operation", kind: "agent-improvement", agentId: "agent-improvement-analyst",
          status: "completed", events: [], result: { artifactId: "proposal-artifact" }, error: null,
          createdAt: "2026-08-02T12:00:03.000Z", completedAt: "2026-08-02T12:00:04.000Z",
        };
      } else if (path.includes("/api/evaluations/compare?")) {
        body = {
          baseline: { experimentId: "baseline-evaluation" }, candidate: { experimentId: "candidate-evaluation" },
          summary: { improvedCases: 0, regressedCases: 1, unchangedCases: 0, insufficientEvidenceCases: 0 },
          cases: [{ datasetId: "triage-dataset", datasetCaseId: "checkout-timeout", baselinePassRate: 1, candidatePassRate: 0.5, passRateDelta: -0.5, classification: "regressed" }],
        };
      } else if (path.includes("/cases/triage-dataset/checkout-timeout")) {
        body = datasetCase;
      } else if (path.endsWith("/api/evaluations/candidate-evaluation")) {
        body = { experiment, datasets: [{ datasetId: "triage-dataset", passed: false, minimumPassRate: 1, cases: [datasetCase] }] };
      } else if (path.includes("/api/evaluations?agentId=evaluation-agent")) {
        body = { experiments: [
          experiment,
          { ...experiment, experimentId: "baseline-evaluation", agentVersion: "1.0.0", passed: true, summary: { ...experiment.summary, passedCases: 1, failedCases: 0, passedRuns: 2, failedRuns: 0, passRate: 1 } },
        ], rejected: [] };
      }
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    }));

    window.history.replaceState(null, "", "/evaluations/candidate-evaluation");
    render(<AppRoutes />);

    expect(await screen.findByRole("heading", { name: "Evaluation candidat" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Analyze failures" }));
    expect(await screen.findByRole("link", { name: "Inspect improvement proposal" })).toHaveAttribute("href", "/runs/proposal-artifact");
    fireEvent.change(await screen.findByLabelText("Baseline experiment"), { target: { value: "baseline-evaluation" } });
    expect(await screen.findByText("-50 points")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "checkout-timeout" }));
    expect(window.location.pathname).toContain("/cases/triage-dataset/checkout-timeout");
    expect(await screen.findByText("Expected a test defect.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download regression-case draft" })).toBeInTheDocument();
  });

  it("renders the foundry project index and navigates to the chain view", async () => {
    const decision = {
      decisionId: "d1000000-0000-4000-8000-000000000001",
      decision: "approve", operatorId: "rashad",
      rationale: "Chain verified end to end.", requestedRevisions: null,
      decidedAt: "2026-08-05T10:11:00.000Z",
    };
    const chain = {
      briefId: "b1000000-0000-4000-8000-000000000001",
      title: "Habit tracker", latestVersion: 5, status: "approved",
      latestActivityAt: "2026-08-05T10:11:00.000Z", intakeTurnCount: 6, intakeQuestions: [], intakeCanContinue: false, completions: [], standingAdvisories: [],
      briefVersions: [{ version: 5, artifactId: "b1000000-0000-4000-8000-000000000001-v5", title: "Habit tracker", createdAt: "2026-08-04T10:00:00.000Z", status: "approved", openQuestions: [], decisions: [decision] }],
      plans: [{ planId: "p1000000-0000-4000-8000-000000000001", createdAt: "2026-08-04T11:00:00.000Z", status: "approved", componentCount: 5, sliceCount: 2, mappingTestTypes: { integration: 7 }, blockingConcerns: 0, advisoryConcerns: 3, decisions: [decision] }],
      capabilityPlans: [{ capabilityPlanId: "c1000000-0000-4000-8000-000000000001", planId: "p1000000-0000-4000-8000-000000000001", createdAt: "2026-08-04T12:00:00.000Z", status: "approved", needCount: 6, proposedCapabilityCount: 0, blockingConcerns: 0, advisoryConcerns: 0, decisions: [decision] }],
      testSuites: [{ testSuiteId: "t1000000-0000-4000-8000-000000000001", planId: "p1000000-0000-4000-8000-000000000001", capabilityPlanId: "c1000000-0000-4000-8000-000000000001", createdAt: "2026-08-04T13:00:00.000Z", status: "approved", interfaceContract: "CLI via node ./dist/index.js", files: [{ path: "acceptance-tests/routing.test.ts", visibility: "visible", testType: "integration", coveredCriterionIds: ["x"] }, { path: "acceptance-tests/holdout.test.ts", visibility: "holdout", testType: "integration", coveredCriterionIds: ["y"] }], decisions: [decision] }],
      build: {
        anchorTestSuiteId: "t1000000-0000-4000-8000-000000000001",
        anchorPlanId: "p1000000-0000-4000-8000-000000000001",
        planAvailable: true, approvedSliceCount: 1,
        slices: [
          { sliceId: "s1", title: "CLI shell and command routing", delivers: "Routing.", dependsOnSliceIds: [], status: "approved", workOrders: [{ workOrderId: "w1000000-0000-4000-8000-000000000001", createdAt: "2026-08-05T09:00:00.000Z", applicableTestFilePaths: [] }], submissions: [{ submissionId: "u1000000-0000-4000-8000-000000000001", createdAt: "2026-08-05T10:00:00.000Z", status: "passed", scopeCheck: { passed: true, failures: [] }, files: [{ path: "acceptance-tests/routing.test.ts", visibility: "visible", exitCode: 0, passed: true }], outputExcerpt: "PASS", decisions: [decision] }] },
          { sliceId: "s2", title: "Streak tracking", delivers: "Streaks.", dependsOnSliceIds: ["s1"], status: "not-started", workOrders: [], submissions: [] },
        ],
      },
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith("/api/workspaces")) {
        return new Response(JSON.stringify({ workspaces: [{ id: "workbench", name: "Workbench", rootPath: "/repo", addedAt: "2026-08-02T12:00:00.000Z", builtIn: true }] }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (path.includes("/api/foundry/projects/")) {
        return new Response(JSON.stringify(chain), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (path.endsWith("/api/foundry/projects")) {
        return new Response(JSON.stringify({
          projects: [{ briefId: chain.briefId, title: "Habit tracker", latestVersion: 5, status: "approved", latestActivityAt: chain.latestActivityAt, stages: { plan: "approved", capability: "approved", tests: "approved", build: { approved: 1, total: 2 } } }],
          rejected: [],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
    }));

    window.history.replaceState(null, "", "/foundry");
    render(<AppRoutes />);

    expect(await screen.findByRole("heading", { name: "Foundry" })).toBeInTheDocument();
    expect(await screen.findByText("1/2 slices")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "Habit tracker" }));
    expect(window.location.pathname).toBe(`/foundry/${chain.briefId}`);
    expect(await screen.findByRole("heading", { name: "Habit tracker" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /Slice 1: CLI shell/ })).toBeInTheDocument();
    expect(screen.getAllByText("Chain verified end to end.").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: /Slice 2: Streak tracking/ })).toBeInTheDocument();
    expect(screen.getByText("not started")).toBeInTheDocument();
  });

  it("records a decision from the chain view and refetches the chain", async () => {
    const chainPayload = {
      briefId: "b2000000-0000-4000-8000-000000000002",
      title: "Note taker", latestVersion: 1, status: "draft",
      latestActivityAt: "2026-08-05T10:00:00.000Z", intakeTurnCount: 0, intakeQuestions: [], intakeCanContinue: false, completions: [], standingAdvisories: [],
      briefVersions: [{ version: 1, artifactId: "b2000000-0000-4000-8000-000000000002-v1", title: "Note taker", createdAt: "2026-08-05T09:00:00.000Z", status: "draft", openQuestions: [], decisions: [] }],
      plans: [], capabilityPlans: [], testSuites: [], build: null,
      buildNote: "No approved test suite yet.",
    };
    let chainFetches = 0;
    let postedBody: unknown = null;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.endsWith("/api/workspaces")) {
        return new Response(JSON.stringify({ workspaces: [{ id: "workbench", name: "Workbench", rootPath: "/repo", addedAt: "2026-08-02T12:00:00.000Z", builtIn: true }] }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (path.endsWith("/decisions") && init?.method === "POST") {
        postedBody = JSON.parse(String(init.body));
        return new Response(JSON.stringify({ decision: { decisionId: "d2" } }), { status: 201, headers: { "content-type": "application/json" } });
      }
      if (path.includes("/api/foundry/projects/")) {
        chainFetches += 1;
        return new Response(JSON.stringify(chainPayload), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
    }));

    window.history.replaceState(null, "", `/foundry/${chainPayload.briefId}`);
    render(<AppRoutes />);

    expect(await screen.findByRole("heading", { name: "Note taker" })).toBeInTheDocument();
    fireEvent.click(screen.getByText("Record decision"));
    fireEvent.change(screen.getByLabelText("Operator"), { target: { value: "rashad" } });
    fireEvent.change(screen.getByLabelText("Rationale"), { target: { value: "Complete and buildable." } });
    fireEvent.click(screen.getByRole("button", { name: "Record approve" }));

    await waitFor(() => expect(postedBody).not.toBeNull());
    expect(postedBody).toEqual({
      decision: "approve",
      operatorId: "rashad",
      rationale: "Complete and buildable.",
    });
    await waitFor(() => expect(chainFetches).toBeGreaterThan(1));
  });

  it("starts a stage run from the chain view and answers intake questions", async () => {
    const questionId = "q1000000-0000-4000-8000-000000000001";
    const chainPayload = {
      briefId: "b3000000-0000-4000-8000-000000000003",
      title: "Recipe box", latestVersion: 2, status: "approved",
      latestActivityAt: "2026-08-05T10:00:00.000Z", intakeTurnCount: 2, intakeQuestions: [], intakeCanContinue: false, completions: [], standingAdvisories: [],
      briefVersions: [
        { version: 1, artifactId: "b3000000-0000-4000-8000-000000000003-v1", title: "Recipe box", createdAt: "2026-08-05T08:00:00.000Z", status: "draft", openQuestions: [{ id: questionId, question: "Which storage should recipes use?" }], decisions: [] },
        { version: 2, artifactId: "b3000000-0000-4000-8000-000000000003-v2", title: "Recipe box", createdAt: "2026-08-05T09:00:00.000Z", status: "approved", openQuestions: [], decisions: [] },
      ],
      plans: [], capabilityPlans: [], testSuites: [], build: null,
      buildNote: "No approved test suite yet.",
    };
    // Version 2 (latest) has no open questions, so the intake panel must
    // not render; the approved brief exposes the architect run control.
    let postedPlanBody: unknown = null;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.endsWith("/api/workspaces")) {
        return new Response(JSON.stringify({ workspaces: [{ id: "workbench", name: "Workbench", rootPath: "/repo", addedAt: "2026-08-02T12:00:00.000Z", builtIn: true }] }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (path.endsWith("/api/foundry/plans") && init?.method === "POST") {
        postedPlanBody = JSON.parse(String(init.body));
        return new Response(JSON.stringify({ operationId: "op-plan-1", kind: "foundry-stage", agentId: "project-architect", status: "queued", events: [], result: null, error: null, createdAt: "2026-08-05T10:01:00.000Z", completedAt: null }), { status: 202, headers: { "content-type": "application/json" } });
      }
      if (path.endsWith("/api/operations/op-plan-1")) {
        return new Response(JSON.stringify({ operationId: "op-plan-1", kind: "foundry-stage", agentId: "project-architect", status: "completed", events: [{ sequence: 1, stage: "persistence", message: "Plan recorded.", occurredAt: "2026-08-05T10:01:01.000Z" }], result: { planId: "p9" }, error: null, createdAt: "2026-08-05T10:01:00.000Z", completedAt: "2026-08-05T10:01:01.000Z" }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (path.includes("/api/foundry/projects/")) {
        return new Response(JSON.stringify(chainPayload), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
    }));

    window.history.replaceState(null, "", `/foundry/${chainPayload.briefId}`);
    render(<AppRoutes />);

    expect(await screen.findByRole("heading", { name: "Recipe box" })).toBeInTheDocument();
    expect(screen.queryByText("Which storage should recipes use?")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Generate architecture plan" }));
    await waitFor(() => expect(postedPlanBody).not.toBeNull());
    expect(postedPlanBody).toEqual({ briefId: chainPayload.briefId });
    expect(await screen.findByText("Plan recorded.")).toBeInTheDocument();
  });

  it("shows the intake turn panel when the latest brief version has open questions", async () => {
    const chainPayload = {
      briefId: "b4000000-0000-4000-8000-000000000004",
      title: "Trip planner", latestVersion: 1, status: "draft",
      latestActivityAt: "2026-08-05T10:00:00.000Z", intakeTurnCount: 1, intakeQuestions: [{ id: "q1", question: "Which airports matter?" }], intakeCanContinue: true, completions: [], standingAdvisories: [],
      briefVersions: [
        { version: 1, artifactId: "b4000000-0000-4000-8000-000000000004-v1", title: "Trip planner", createdAt: "2026-08-05T09:00:00.000Z", status: "draft", openQuestions: [{ id: "q1", question: "Which airports matter?" }], decisions: [] },
      ],
      plans: [], capabilityPlans: [], testSuites: [], build: null,
      buildNote: "No approved test suite yet.",
    };
    let postedTurnBody: unknown = null;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.endsWith("/api/workspaces")) {
        return new Response(JSON.stringify({ workspaces: [{ id: "workbench", name: "Workbench", rootPath: "/repo", addedAt: "2026-08-02T12:00:00.000Z", builtIn: true }] }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (path.endsWith("/turns") && init?.method === "POST") {
        postedTurnBody = JSON.parse(String(init.body));
        return new Response(JSON.stringify({ operationId: "op-turn-1", kind: "foundry-stage", agentId: "project-intake", status: "queued", events: [], result: null, error: null, createdAt: "2026-08-05T10:01:00.000Z", completedAt: null }), { status: 202, headers: { "content-type": "application/json" } });
      }
      if (path.endsWith("/api/operations/op-turn-1")) {
        return new Response(JSON.stringify({ operationId: "op-turn-1", kind: "foundry-stage", agentId: "project-intake", status: "completed", events: [], result: { briefId: chainPayload.briefId, briefVersion: 2 }, error: null, createdAt: "2026-08-05T10:01:00.000Z", completedAt: "2026-08-05T10:01:01.000Z" }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (path.includes("/api/foundry/projects/")) {
        return new Response(JSON.stringify(chainPayload), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
    }));

    window.history.replaceState(null, "", `/foundry/${chainPayload.briefId}`);
    render(<AppRoutes />);

    const question = await screen.findByLabelText("Which airports matter?");
    fireEvent.change(question, { target: { value: "Tweed and JFK via train." } });
    fireEvent.click(screen.getByRole("button", { name: "Submit answers" }));

    await waitFor(() => expect(postedTurnBody).not.toBeNull());
    expect(postedTurnBody).toEqual({
      answers: [{ questionId: "q1", answer: "Tweed and JFK via train." }],
    });
  });

  it("renders a raw foundry artifact with the holdout disclosure", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith("/api/workspaces")) {
        return new Response(JSON.stringify({ workspaces: [{ id: "workbench", name: "Workbench", rootPath: "/repo", addedAt: "2026-08-02T12:00:00.000Z", builtIn: true }] }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (path.includes("/api/foundry/artifacts/")) {
        return new Response(JSON.stringify({
          kind: "test-suite",
          artifact: { testSuiteId: "t1", content: { testFiles: [{ path: "acceptance-tests/holdout.test.ts", visibility: "holdout", content: "describe('secret')" }] } },
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
    }));

    window.history.replaceState(null, "", "/foundry/artifacts/t1");
    render(<AppRoutes />);

    expect(await screen.findByRole("heading", { name: "test-suite" })).toBeInTheDocument();
    expect(await screen.findByText(/holdout test content/i)).toBeInTheDocument();
    expect(screen.getByText(/describe\('secret'\)/)).toBeInTheDocument();
  });
});
