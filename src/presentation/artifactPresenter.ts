import type { StoredArtifact } from "../artifacts/artifactStore.js";
import { artifactPresentationSchema, type ArtifactPresentation, type ArtifactSourceSnapshot } from "./artifactPresentation.js";
import { getDocumentationAuditSource, presentDocumentationAudit } from "./documentationAuditPresentation.js";

export function presentArtifact(artifactId: string, stored: StoredArtifact): ArtifactPresentation {
  if (stored.kind === "agent-run") {
    const specializedRequested = stored.artifact.agentId === "documentation-auditor";
    const specialized = specializedRequested
      ? presentDocumentationAudit(artifactId, stored.artifact)
      : null;
    if (specialized) return specialized;
    const run = stored.artifact;
    return artifactPresentationSchema.parse({
      artifactId,
      artifactKind: stored.kind,
      presentationKind: "generic",
      title: `${run.manifest.name} Run`,
      agentId: run.agentId,
      agentVersion: run.agentVersion,
      workspaceId: run.configuration.workspaceId ?? null,
      succeeded: run.succeeded,
      assessment: run.assessment?.message ?? run.failure?.message ?? null,
      overview: null,
      completedAt: run.completedAt,
      durationMs: run.durationMs,
      metrics: [], findings: [], coverageGaps: [], prioritizedActions: [], sources: [],
      timeline: [
        { id: "execution", label: "Agent execution", status: run.failure ? "failed" : "completed", detail: run.failure?.message ?? "The agent completed its registered execution path.", durationMs: run.durationMs },
        { id: "assessment", label: "Agent assessment", status: run.assessment === null ? "skipped" : run.assessment.passed ? "completed" : "failed", detail: run.assessment?.message ?? "No assessment was recorded.", durationMs: null },
        { id: "persistence", label: "Evidence persistence", status: "completed", detail: `Immutable artifact ${artifactId} loaded through its runtime contract.`, durationMs: null },
      ],
      usage: null,
      warnings: [
        ...run.warnings,
        ...(specializedRequested ? ["The specialized documentation-audit presentation could not validate this artifact; generic evidence is shown instead."] : []),
      ],
    });
  }
  const run = stored.artifact;
  return artifactPresentationSchema.parse({
    artifactId,
    artifactKind: stored.kind,
    presentationKind: "generic",
    title: `${run.agentId} Verification`,
    agentId: run.agentId,
    agentVersion: run.agentVersion,
    workspaceId: run.runs[0]?.agentRun.configuration.workspaceId ?? null,
    succeeded: null,
    assessment: null,
    overview: `${run.runs.length} complete agent runs preserved for dataset ${run.datasetId}.`,
    completedAt: run.completedAt,
    durationMs: null,
    metrics: [
      { id: "runs", label: "Runs", value: String(run.runs.length), detail: null },
      { id: "cases", label: "Cases", value: String(run.caseSummaries.length), detail: null },
    ],
    findings: [], coverageGaps: [], prioritizedActions: [], sources: [], timeline: [], usage: null, warnings: [],
  });
}

export function getArtifactSource(stored: StoredArtifact, path: string): ArtifactSourceSnapshot | null {
  if (stored.kind !== "agent-run" || stored.artifact.agentId !== "documentation-auditor") return null;
  return getDocumentationAuditSource(stored.artifact, path);
}
