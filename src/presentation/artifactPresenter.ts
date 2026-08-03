import type { StoredArtifact } from "../artifacts/artifactStore.js";
import { artifactPresentationSchema, type ArtifactPresentation, type ArtifactSourceSnapshot } from "./artifactPresentation.js";
import { getDocumentationAuditSource, presentDocumentationAudit } from "./documentationAuditPresentation.js";
import { getPlaywrightFailureTriageSource, presentPlaywrightFailureTriage } from "./playwrightFailureTriagePresentation.js";
import { presentAgentImprovement } from "./agentImprovementPresentation.js";

export function presentArtifact(artifactId: string, stored: StoredArtifact): ArtifactPresentation {
  if (stored.kind === "agent-improvement-proposal") {
    return presentAgentImprovement(artifactId, stored.artifact);
  }
  if (stored.kind === "agent-run") {
    const specializedRequested =
      stored.artifact.agentId === "documentation-auditor" ||
      stored.artifact.agentId === "playwright-failure-triage";
    const specialized = stored.artifact.agentId === "documentation-auditor"
      ? presentDocumentationAudit(artifactId, stored.artifact)
      : stored.artifact.agentId === "playwright-failure-triage"
        ? presentPlaywrightFailureTriage(artifactId, stored.artifact)
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
  if (stored.kind === "agent-evaluation") {
    const experiment = stored.artifact;
    return artifactPresentationSchema.parse({
      artifactId,
      artifactKind: stored.kind,
      presentationKind: "generic",
      title: `${experiment.agentId} Evaluation`,
      agentId: experiment.agentId,
      agentVersion: experiment.agentVersion,
      workspaceId: experiment.workspaceId,
      succeeded: experiment.passed,
      assessment: experiment.passed
        ? "Every dataset met the registered verification policy."
        : `${experiment.summary.failedCases} case(s) missed the registered threshold.`,
      overview: `${experiment.summary.passedRuns}/${experiment.summary.totalRuns} trials passed across ${experiment.summary.totalCases} cases.`,
      completedAt: experiment.completedAt,
      durationMs: null,
      metrics: [
        { id: "datasets", label: "Datasets", value: String(experiment.summary.totalDatasets), detail: null },
        { id: "cases", label: "Cases", value: String(experiment.summary.totalCases), detail: `${experiment.summary.failedCases} below threshold` },
        { id: "runs", label: "Trials", value: String(experiment.summary.totalRuns), detail: `${experiment.summary.passedRuns} passed` },
        { id: "pass-rate", label: "Pass rate", value: experiment.summary.passRate === null ? "No evidence" : `${Math.round(experiment.summary.passRate * 100)}%`, detail: null },
      ],
      findings: [], coverageGaps: [], prioritizedActions: [], sources: [], timeline: [], usage: null, warnings: [],
    });
  }
  if (stored.kind === "agent-candidate-evaluation") {
    const evaluation = stored.artifact;
    return artifactPresentationSchema.parse({
      artifactId,
      artifactKind: stored.kind,
      presentationKind: "generic",
      title: `${evaluation.plan.subject.agentId} Candidate Comparison`,
      agentId: evaluation.plan.subject.agentId,
      agentVersion: evaluation.plan.subject.agentVersion,
      workspaceId: evaluation.plan.workspaceId,
      succeeded: evaluation.gates.passed,
      assessment:
        evaluation.gates.passed
          ? "Every automated promotion gate passed or was not applicable; operator approval is still required."
          : `${
            evaluation.gates.results.filter(({ status }) => status === "failed")
              .length
          } automated promotion gate(s) failed.`,
      overview:
        `Candidate ${evaluation.plan.candidate.candidateId} compared under frozen plan ${evaluation.plan.planId}.`,
      completedAt: evaluation.completedAt,
      durationMs: null,
      metrics: [
        {
          id: "improved",
          label: "Improved cases",
          value: String(evaluation.comparison.summary.improvedCases),
          detail: null,
        },
        {
          id: "regressed",
          label: "Regressed cases",
          value: String(evaluation.comparison.summary.regressedCases),
          detail: null,
        },
        {
          id: "unchanged",
          label: "Unchanged cases",
          value: String(evaluation.comparison.summary.unchangedCases),
          detail: null,
        },
        {
          id: "gates",
          label: "Promotion gates",
          value: evaluation.gates.passed ? "Passed" : "Failed",
          detail:
            `${evaluation.gates.results.filter(({ status }) => status === "failed").length} failed`,
        },
      ],
      findings: [],
      coverageGaps: [],
      prioritizedActions: [],
      sources: [],
      timeline: [],
      usage: null,
      warnings: [
        "Automated gates do not promote a candidate without an operator decision.",
        ...evaluation.gates.results
          .filter(({ status }) => status === "not-applicable")
          .map(({ gateId, message }) => `${gateId}: ${message}`),
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
  if (stored.kind !== "agent-run") return null;
  if (stored.artifact.agentId === "documentation-auditor") {
    return getDocumentationAuditSource(stored.artifact, path);
  }
  if (stored.artifact.agentId === "playwright-failure-triage") {
    return getPlaywrightFailureTriageSource(stored.artifact, path);
  }
  return null;
}
