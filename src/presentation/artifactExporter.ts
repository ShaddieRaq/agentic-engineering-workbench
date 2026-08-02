import type { ArtifactExport, ArtifactPresentation } from "./artifactPresentation.js";

function safe(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replace(/([`*_[\]{}()#+.!|])/g, "\\$1");
}

export function renderArtifactMarkdown(presentation: ArtifactPresentation): string {
  const lines = [
    `# ${safe(presentation.title)}`,
    "",
    `- Agent: \`${safe(presentation.agentId)}@${safe(presentation.agentVersion)}\``,
    `- Workspace: \`${safe(presentation.workspaceId ?? "legacy") }\``,
    `- Outcome: **${presentation.succeeded === null ? "not applicable" : presentation.succeeded ? "succeeded" : "failed"}**`,
    `- Completed: ${safe(presentation.completedAt)}`,
    "",
  ];
  if (presentation.overview) lines.push("## Overview", "", safe(presentation.overview), "");
  if (presentation.metrics.length) {
    lines.push("## Metrics", "");
    for (const metric of presentation.metrics) lines.push(`- **${safe(metric.label)}:** ${safe(metric.value)}${metric.detail ? ` — ${safe(metric.detail)}` : ""}`);
    lines.push("");
  }
  if (presentation.findings.length) {
    lines.push("## Findings", "");
    for (const finding of presentation.findings) {
      lines.push(`### ${safe(finding.title)}`, "", `**${finding.severity.toUpperCase()} · ${finding.category}**`, "", safe(finding.explanation), "", `Recommendation: ${safe(finding.recommendation)}`, "", `Evidence: ${finding.evidencePaths.map((path) => `\`${safe(path)}\``).join(", ")}`, "");
    }
  }
  if (presentation.prioritizedActions.length) {
    lines.push("## Prioritized Actions", "");
    presentation.prioritizedActions.forEach((action, index) => lines.push(`${index + 1}. ${safe(action)}`));
    lines.push("");
  }
  if (presentation.coverageGaps.length) {
    lines.push("## Coverage Gaps", "");
    for (const gap of presentation.coverageGaps) lines.push(`- **${safe(gap.area)}:** ${safe(gap.reason)} (${gap.evidencePaths.map((path) => `\`${safe(path)}\``).join(", ")})`);
    lines.push("");
  }
  if (presentation.warnings.length) {
    lines.push("## Warnings", "", ...presentation.warnings.map((warning) => `- ${safe(warning)}`), "");
  }
  if (presentation.usage) {
    lines.push(
      "## Model Usage",
      "",
      `- **Model:** \`${safe(presentation.usage.model)}\``,
      `- **Total tokens:** ${presentation.usage.totalTokens.toLocaleString()}`,
      `- **Input tokens:** ${presentation.usage.inputTokens.toLocaleString()}`,
      `- **Output tokens:** ${presentation.usage.outputTokens.toLocaleString()}`,
      `- **Estimated cost:** ${presentation.usage.estimatedCostUsd === null ? "unavailable" : `$${presentation.usage.estimatedCostUsd.toFixed(6)}`}`,
      "",
    );
  }
  lines.push("## Execution", "");
  for (const step of presentation.timeline) lines.push(`- **${safe(step.label)} — ${step.status}:** ${safe(step.detail)}`);
  return `${lines.join("\n").trim()}\n`;
}

export function exportArtifactPresentation(
  presentation: ArtifactPresentation,
  format: "json" | "markdown",
): ArtifactExport {
  if (format === "json") return {
    format,
    mediaType: "application/json; charset=utf-8",
    fileName: `${presentation.agentId}-${presentation.artifactId}-report.json`,
    content: `${JSON.stringify(presentation, null, 2)}\n`,
  };
  return {
    format,
    mediaType: "text/markdown; charset=utf-8",
    fileName: `${presentation.agentId}-${presentation.artifactId}-report.md`,
    content: renderArtifactMarkdown(presentation),
  };
}
