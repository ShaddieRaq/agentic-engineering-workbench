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
});
