import { describe, expect, it } from "vitest";
import type { AgentRunResult } from "../src/agents/agentRunResult.js";
import { documentationAuditorAgent } from "../src/agents/documentationAuditor/documentationAuditorAgent.js";
import { exportArtifactPresentation } from "../src/presentation/artifactExporter.js";
import { getArtifactSource, presentArtifact } from "../src/presentation/artifactPresenter.js";

function documentationRun(): AgentRunResult {
  const parsedOutput = {
    overview: "One stale command was found.",
    findings: [{
      title: "Stale command",
      category: "stale" as const,
      severity: "high" as const,
      explanation: "The README command is absent from package scripts.",
      evidencePaths: ["README.md", "package.json"],
      recommendation: "Replace the command.",
    }],
    coverageGaps: [{ area: "Deployment", reason: "No deployment guide was inspected.", evidencePaths: ["README.md"] }],
    prioritizedActions: ["Correct the README command."],
  };
  const context = [
    { path: "README.md", content: "Run npm run old-command.", sizeBytes: 24, toolCallId: "read-1", rationale: "Documentation evidence." },
    { path: "package.json", content: "{\"scripts\":{\"test\":\"vitest\"}}", sizeBytes: 29, toolCallId: "read-2", rationale: "Manifest evidence." },
  ];
  return {
    agentRunId: "run-1",
    agentId: "documentation-auditor",
    agentVersion: "1.0.0",
    manifestDigest: "a".repeat(64),
    manifest: documentationAuditorAgent.manifest,
    input: {},
    configuration: { model: "gpt-5.4-mini", permittedToolIds: ["file-inventory", "read-file"], workspaceId: "sample" },
    warnings: [],
    output: {
      auditRunId: "audit-1",
      succeeded: true,
      ...parsedOutput,
      auditEvidence: {
        auditRunId: "audit-1",
        inventory: {
          toolCallId: "inventory-1", toolId: "file-inventory", input: { path: "." },
          output: { entries: context.map(({ path, sizeBytes }) => ({ path, sizeBytes, extension: path.endsWith(".md") ? ".md" : ".json" })), filesObserved: 8, directoriesVisited: 3, truncated: false },
          failure: null, durationMs: 4, completedAt: "2026-08-02T12:00:00.000Z", succeeded: true,
        },
        context,
        reads: context.map(({ path, content, sizeBytes, toolCallId }) => ({
          toolCallId, toolId: "read-file", input: { path }, output: { path, content, sizeBytes }, failure: null,
          durationMs: 2, completedAt: "2026-08-02T12:00:00.000Z", succeeded: true,
        })),
        prompt: "Audit supplied context.", rawOutput: "structured", parsedOutput, refusal: null,
        provider: { model: "gpt-5.4-mini-2026-03-17", usage: { inputTokens: 1_000, cachedInputTokens: 100, outputTokens: 200, reasoningTokens: 50, totalTokens: 1_200 } },
        executionFailure: null,
        citationEvaluation: { passed: true, availablePaths: ["README.md", "package.json"], citedPaths: ["README.md", "package.json"], invalidPaths: [], message: "Every citation is grounded." },
        succeeded: true, durationMs: 150, completedAt: "2026-08-02T12:00:00.000Z",
      },
    },
    assessment: { passed: true, message: "Documentation audit completed with grounded evidence." },
    failure: null,
    succeeded: true,
    durationMs: 160,
    completedAt: "2026-08-02T12:00:00.000Z",
  };
}

describe("artifact presentation", () => {
  it("projects documentation evidence into a source-free visual contract", () => {
    const stored = { kind: "agent-run" as const, artifact: documentationRun() };
    const presentation = presentArtifact("artifact-1", stored);

    expect(presentation).toMatchObject({
      presentationKind: "documentation-audit",
      workspaceId: "sample",
      metrics: [
        { id: "observed", value: "8" },
        { id: "context", value: "2" },
        { id: "findings", value: "1" },
        { id: "citations", value: "2" },
      ],
      findings: [{ title: "Stale command", severity: "high" }],
      usage: { model: "gpt-5.4-mini-2026-03-17", totalTokens: 1_200 },
    });
    expect(JSON.stringify(presentation)).not.toContain("old-command");
    expect(getArtifactSource(stored, "README.md")?.content).toContain("old-command");
  });

  it("exports presentation JSON and Markdown without embedding source contents", () => {
    const presentation = presentArtifact("artifact-1", { kind: "agent-run", artifact: documentationRun() });
    presentation.findings[0]!.explanation = "Avoid <script>alert('x')</script> and [unsafe](javascript:alert(1)).";
    const markdown = exportArtifactPresentation(presentation, "markdown");
    const json = exportArtifactPresentation(presentation, "json");

    expect(markdown.content).toContain("# Documentation Audit");
    expect(markdown.content).toContain("Stale command");
    expect(markdown.content).toContain("## Model Usage");
    expect(markdown.content).toContain("1,200");
    expect(json.content).toContain('"presentationKind": "documentation-audit"');
    expect(markdown.content).not.toContain("old-command");
    expect(json.content).not.toContain("old-command");
    expect(markdown.content).not.toContain("<script>");
    expect(markdown.content).toContain("&lt;script&gt;");
    expect(markdown.content).not.toContain("[unsafe](javascript:");
  });

  it("falls back visibly when specialized historical evidence is incompatible", () => {
    const run = documentationRun();
    run.output = { ...(run.output as Record<string, unknown>), auditEvidence: {} };

    const presentation = presentArtifact("artifact-1", { kind: "agent-run", artifact: run });

    expect(presentation.presentationKind).toBe("generic");
    expect(presentation.warnings).toContainEqual(expect.stringContaining("could not validate"));
  });

  it("projects Change Risk lineage as related artifact links", () => {
    const run = documentationRun();
    run.agentId = "change-risk-reviewer";
    run.input = {
      instruction: "Review applied workspace changes.",
      sourceImprovement: {
        artifactId: "improvement-proposal",
        recommendationIndex: 0,
        toolBuilderRunArtifactId: "tool-builder-run",
      },
    };

    expect(
      presentArtifact("risk-review", { kind: "agent-run", artifact: run })
        .relatedArtifacts,
    ).toEqual([
      {
        id: "improvement-proposal",
        kind: "agent-improvement-proposal",
        relationship: "source-improvement",
      },
      {
        id: "tool-builder-run",
        kind: "agent-run",
        relationship: "tool-builder-proposal",
      },
    ]);
  });
});
