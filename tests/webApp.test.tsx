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
});
