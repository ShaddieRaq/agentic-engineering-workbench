// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppRoutes } from "../web/src/App.js";

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("agent workbench web interface", () => {
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
