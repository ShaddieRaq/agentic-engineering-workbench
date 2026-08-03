import { useState } from "react";
import { api, type ArtifactPresentation, type ArtifactSourceSnapshot } from "./api.js";
import { ErrorNotice, StatusBadge } from "./components.js";

function milliseconds(value: number | null): string {
  if (value === null) return "Not recorded";
  return value < 1_000 ? `${Math.round(value)} ms` : `${(value / 1_000).toFixed(2)} s`;
}

function SourceLinks({
  paths,
  onSelect,
}: {
  paths: string[];
  onSelect: (path: string) => void;
}) {
  return <div className="source-links">{paths.map((path) => <button type="button" key={path} onClick={() => onSelect(path)}>{path}</button>)}</div>;
}

export function ArtifactPresentationView({
  presentation,
  rawArtifact,
}: {
  presentation: ArtifactPresentation;
  rawArtifact: unknown;
}) {
  const [source, setSource] = useState<ArtifactSourceSnapshot | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  async function inspectSource(path: string) {
    try {
      setSource(await api<ArtifactSourceSnapshot>(`/api/artifacts/${presentation.artifactId}/source?path=${encodeURIComponent(path)}`));
      setSourceError(null);
    } catch (error: unknown) {
      setSource(null);
      setSourceError(error instanceof Error ? error.message : String(error));
    }
  }
  const outcome = presentation.succeeded === null ? "active" : presentation.succeeded ? "completed" : "failed";
  const reportLabel = presentation.presentationKind === "documentation-audit"
    ? "Audit"
    : presentation.presentationKind === "playwright-failure-triage"
      ? "Triage"
      : "Evidence";
  return <>
    <header className="page-header">
      <div><span className="eyebrow">{presentation.artifactKind} · {presentation.presentationKind}</span><h1>{presentation.title}</h1></div>
      <StatusBadge value={outcome} />
    </header>
    <div className="report-actions">
      <a className="button button-secondary" href={`/api/artifacts/${presentation.artifactId}/export?format=markdown`} download>Download Markdown</a>
      <a className="button button-secondary" href={`/api/artifacts/${presentation.artifactId}/export?format=json`} download>Download report JSON</a>
      <a className="button button-secondary" href={`/api/artifacts/${presentation.artifactId}/raw`} download>Download raw evidence</a>
    </div>
    <section className="metric-grid evidence-metrics">
      <div><span>Agent</span><strong className="metric-word">{presentation.agentId}</strong></div>
      <div><span>Workspace</span><strong className="metric-word">{presentation.workspaceId ?? "Legacy"}</strong></div>
      <div><span>Duration</span><strong className="metric-word">{milliseconds(presentation.durationMs)}</strong></div>
      <div><span>Completed</span><strong className="metric-word">{new Date(presentation.completedAt).toLocaleString()}</strong></div>
    </section>
    {presentation.overview && <section className="hero-panel report-overview"><span className="eyebrow">{reportLabel} overview</span><h2>{presentation.overview}</h2>{presentation.assessment && <p>{presentation.assessment}</p>}</section>}
    {!!presentation.metrics.length && <section><div className="section-heading"><div><span className="eyebrow">Observed evidence</span><h2>{reportLabel} metrics</h2></div></div><div className="metric-grid report-metrics">{presentation.metrics.map((metric) => <div key={metric.id}><span>{metric.label}</span><strong>{metric.value}</strong>{metric.detail && <small>{metric.detail}</small>}</div>)}</div></section>}
    {!!presentation.warnings.length && <section className="notice notice-warning"><strong>Evidence warnings</strong><ul>{presentation.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></section>}
    {!!presentation.findings.length && <section><div className="section-heading"><div><span className="eyebrow">Grounded conclusions</span><h2>Findings</h2></div><span>{presentation.findings.length} total</span></div><div className="finding-list">{presentation.findings.map((finding, index) => <article className={`finding-card severity-${finding.severity}`} key={`${finding.title}-${index}`}><div className="finding-heading"><div><span className="eyebrow">{finding.category}</span><h3>{finding.title}</h3></div><span className={`severity severity-${finding.severity}`}>{presentation.presentationKind === "playwright-failure-triage" ? `${finding.severity} confidence` : finding.severity}</span></div><p>{finding.explanation}</p><div className="recommendation"><strong>Recommendation</strong><p>{finding.recommendation}</p></div><SourceLinks paths={finding.evidencePaths} onSelect={(path) => void inspectSource(path)} /></article>)}</div></section>}
    {!presentation.findings.length && presentation.presentationKind === "documentation-audit" && <section className="notice">No documentation findings were recorded for this audit.</section>}
    {!!presentation.prioritizedActions.length && <section className="panel"><span className="eyebrow">Recommended sequence</span><h2>Prioritized actions</h2><ol className="action-list">{presentation.prioritizedActions.map((action) => <li key={action}>{action}</li>)}</ol></section>}
    {!!presentation.coverageGaps.length && <section><div className="section-heading"><div><span className="eyebrow">Known limits</span><h2>Coverage gaps</h2></div></div><div className="finding-list">{presentation.coverageGaps.map((gap) => <article className="detail-block" key={gap.area}><h3>{gap.area}</h3><p>{gap.reason}</p><SourceLinks paths={gap.evidencePaths} onSelect={(path) => void inspectSource(path)} /></article>)}</div></section>}
    {sourceError && <ErrorNotice message={sourceError} />}
    {source && <section className="panel source-snapshot"><div className="section-heading"><div><span className="eyebrow">Saved source snapshot</span><h2>{source.path}</h2></div><button className="danger-button" type="button" onClick={() => setSource(null)}>Close</button></div><p>{source.rationale} · {source.sizeBytes.toLocaleString()} bytes · tool call {source.toolCallId}</p><pre>{source.content}</pre></section>}
    {!!presentation.timeline.length && <section className="panel"><span className="eyebrow">Observable workflow</span><h2>Execution timeline</h2><ol className="timeline report-timeline">{presentation.timeline.map((step) => <li key={step.id}><span className={`timeline-dot timeline-${step.status}`} /><div><strong>{step.label}</strong> <StatusBadge value={step.status === "warning" || step.status === "skipped" ? "active" : step.status} /><p>{step.detail}</p>{step.durationMs !== null && <time>{milliseconds(step.durationMs)}</time>}</div></li>)}</ol></section>}
    {presentation.usage && <section><div className="section-heading"><div><span className="eyebrow">Provider evidence</span><h2>Model usage</h2></div></div><div className="metric-grid report-metrics"><div><span>Model</span><strong className="metric-word">{presentation.usage.model}</strong></div><div><span>Total tokens</span><strong>{presentation.usage.totalTokens.toLocaleString()}</strong></div><div><span>Input / output</span><strong className="metric-word">{presentation.usage.inputTokens.toLocaleString()} / {presentation.usage.outputTokens.toLocaleString()}</strong></div><div><span>Estimated cost</span><strong className="metric-word">{presentation.usage.estimatedCostUsd === null ? "Unavailable" : `$${presentation.usage.estimatedCostUsd.toFixed(6)}`}</strong></div></div></section>}
    <details className="panel evidence-details"><summary>Reveal complete raw evidence</summary><p>Full inputs, outputs, assessment, configuration, and timing are shown below for deliberate inspection.</p><pre className="evidence-json">{JSON.stringify(rawArtifact, null, 2)}</pre></details>
  </>;
}
