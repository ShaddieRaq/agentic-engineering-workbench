import { useEffect, useState, type FormEvent } from "react";
import { api, type AgentDescription, type AgentManifest, type ArtifactList, type ArtifactPresentation, type EvaluationCase, type EvaluationComparison, type EvaluationList, type EvaluationView, type Health, type Operation, type ToolDescription, type ToolSummary } from "./api.js";
import { ArtifactPresentationView } from "./artifactPresentation.js";
import { AgentCard, EmptyState, ErrorNotice, Loading, OperationTrace, RunAgentPanel, StatusBadge } from "./components.js";
import { useOperation, useResource } from "./hooks.js";
import { LocalLink as Link, LocalNavLink as NavLink, usePathname } from "./router.js";
import { WorkspaceProvider, useWorkspace } from "./workspace.js";

function Shell({ children }: { children: React.ReactNode }) {
  const { workspaces, selectedWorkspaceId, selectWorkspace } = useWorkspace();
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" to="/"><span className="brand-mark">AE</span><span>Agentic<br />Workbench</span></Link>
        <nav aria-label="Primary navigation">
          <NavLink to="/" end>Overview</NavLink>
          <NavLink to="/agents">Agents</NavLink>
          <NavLink to="/tools">Tools</NavLink>
          <NavLink to="/workspaces">Workspaces</NavLink>
          <NavLink to="/runs">Evidence</NavLink>
          <NavLink to="/evaluations">Evaluation Studio</NavLink>
          <NavLink to="/authoring">Authoring</NavLink>
        </nav>
        <label className="workspace-switcher">Active workspace<select value={selectedWorkspaceId ?? ""} onChange={(event) => selectWorkspace(event.target.value)}>{workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select></label>
        <div className="sidebar-note"><span className="pulse" />Local control plane</div>
      </aside>
      <main>{children}</main>
    </div>
  );
}

function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return <header className="page-header"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1></div>{children}</header>;
}

function OverviewPage() {
  const { workspaces, selectedWorkspaceId } = useWorkspace();
  const health = useResource<Health>("/api/health");
  const agents = useResource<{ agents: AgentManifest[] }>("/api/agents");
  const artifacts = useResource<ArtifactList>("/api/artifacts?limit=5");
  if (health.loading || agents.loading || artifacts.loading) return <Loading />;
  if (health.error || agents.error || artifacts.error) return <ErrorNotice message={health.error ?? agents.error ?? artifacts.error ?? "Unknown error"} />;
  return (
    <>
      <PageHeader eyebrow="Local agent platform" title="See the system around the model">
        <div className="health-block"><span className="pulse" /><div><strong>Platform online</strong><small>{health.data?.catalogValid ? "Catalog validated" : "Catalog needs attention"}</small></div></div>
      </PageHeader>
      <section className="hero-panel">
        <div><span className="eyebrow">Agent lifecycle</span><h2>From a versioned definition to inspectable evidence.</h2><p>The workbench makes every boundary visible—contracts, permissions, workflow control, provider execution, assessment, and persistence.</p></div>
        <div className="lifecycle-strip">
          {['Agent', 'Input', 'Permissions', 'Workflow', 'Model', 'Assessment', 'Evidence'].map((stage, index) => <div key={stage}><span>{String(index + 1).padStart(2, '0')}</span><strong>{stage}</strong></div>)}
        </div>
      </section>
      <section className="metric-grid">
        <div><span>Registered agents</span><strong>{agents.data?.agents.length ?? 0}</strong></div>
        <div><span>Recent artifacts</span><strong>{artifacts.data?.artifacts.length ?? 0}</strong></div>
        <div><span>Provider</span><strong className="metric-word">{health.data?.apiKeyConfigured ? "Ready" : "Not configured"}</strong></div>
        <div><span>Workspace</span><strong className="metric-path">{workspaces.find(({ id }) => id === selectedWorkspaceId)?.name ?? "Loading"}</strong></div>
      </section>
      <section><div className="section-heading"><div><span className="eyebrow">Products</span><h2>Registered agents</h2></div><Link to="/agents">View catalog →</Link></div><div className="card-grid">{agents.data?.agents.map((agent) => <AgentCard agent={agent} key={agent.id} />)}</div></section>
    </>
  );
}

function AgentsPage() {
  const resource = useResource<{ agents: AgentManifest[] }>("/api/agents");
  if (resource.loading) return <Loading />;
  if (resource.error) return <ErrorNotice message={resource.error} />;
  return <><PageHeader eyebrow="Immutable catalog" title="Agents" /><p className="lede">Each card represents a complete, versioned agent product—not only a prompt.</p><div className="card-grid">{resource.data?.agents.map((agent) => <AgentCard agent={agent} key={agent.id} />)}</div></>;
}

function ToolsPage() {
  const resource = useResource<{ tools: ToolSummary[] }>("/api/tools");
  if (resource.loading) return <Loading />;
  if (resource.error) return <ErrorNotice message={resource.error} />;
  return <><PageHeader eyebrow="Executable capabilities" title="Tools" /><p className="lede">Tools are TypeScript capabilities with runtime-validated inputs and outputs. Agents receive only the tools declared in their permission manifests.</p><div className="card-grid">{resource.data?.tools.map((tool) => <Link className="agent-card" to={`/tools/${tool.id}`} key={tool.id}><div className="card-topline"><span className="status">code</span><span>{tool.consumerAgentIds.length} consumer(s)</span></div><h3>{tool.id}</h3><p>{tool.description}</p><div className="tag-row">{tool.consumerAgentIds.map((id) => <span className="tag" key={id}>{id}</span>)}</div></Link>)}</div></>;
}

function ToolDetailPage() {
  const toolId = usePathname().split("/")[2];
  const resource = useResource<ToolDescription>(toolId ? `/api/tools/${toolId}` : null);
  if (resource.loading) return <Loading />;
  if (resource.error || !resource.data) return <ErrorNotice message={resource.error ?? "Tool not found"} />;
  const tool = resource.data;
  return <><PageHeader eyebrow="Controlled TypeScript capability" title={tool.id}><StatusBadge value="active" /></PageHeader><p className="lede">{tool.description}</p><section className="detail-grid"><ListBlock title="Permitted agent consumers" values={tool.consumerAgentIds} /><div className="detail-block"><h3>Registration boundary</h3><p>This tool is explicitly imported into the platform registry and rebuilt for the selected workspace root.</p></div></section><section className="contract-grid"><div className="panel"><span className="eyebrow">Validated input</span><pre>{JSON.stringify(tool.inputSchema, null, 2)}</pre></div><div className="panel"><span className="eyebrow">Validated output</span><pre>{JSON.stringify(tool.outputSchema, null, 2)}</pre></div></section></>;
}

function ListBlock({ title, values }: { title: string; values: string[] }) {
  return <div className="detail-block"><h3>{title}</h3>{values.length ? <ul>{values.map((value) => <li key={value}><code>{value}</code></li>)}</ul> : <p>None declared</p>}</div>;
}

function AgentDetailPage() {
  const agentId = usePathname().split("/")[2];
  const resource = useResource<AgentDescription>(agentId ? `/api/agents/${agentId}` : null);
  if (resource.loading) return <Loading />;
  if (resource.error || !resource.data) return <ErrorNotice message={resource.error ?? "Agent not found"} />;
  const { manifest, inputSchema, outputSchema } = resource.data;
  return (
    <>
      <PageHeader eyebrow={`${manifest.id} · v${manifest.version}`} title={manifest.name}><StatusBadge value={manifest.status} /></PageHeader>
      <p className="lede">{manifest.description}</p>
      <section className="detail-grid">
        <div className="panel span-two"><span className="eyebrow">Product identity</span><dl className="definition-list"><div><dt>Owner</dt><dd>{manifest.owner}</dd></div><div><dt>Default model</dt><dd>{manifest.defaultModel}</dd></div><div><dt>Verification threshold</dt><dd>{manifest.verification.minimumPassRate === null ? "Not gated" : `${manifest.verification.minimumPassRate * 100}% per case`}</dd></div></dl><div className="tag-row">{manifest.tags.map((tag) => <span className="tag" key={tag}>{tag}</span>)}</div></div>
        <ListBlock title="Permitted tools" values={manifest.permissions.toolIds} />
        <ListBlock title="Workflows" values={manifest.components.workflowIds} />
        <ListBlock title="Verification datasets" values={manifest.verification.datasetIds} />
        <ListBlock title="Harnesses and scenarios" values={[...manifest.components.harnessIds, ...manifest.components.scenarioIds]} />
      </section>
      <section className="contract-grid"><div className="panel"><span className="eyebrow">Input contract</span><pre>{JSON.stringify(inputSchema, null, 2)}</pre></div><div className="panel"><span className="eyebrow">Output contract</span><pre>{JSON.stringify(outputSchema, null, 2)}</pre></div></section>
      <RunAgentPanel agent={manifest} schema={inputSchema} />
    </>
  );
}

function RunsPage() {
  const [agentId, setAgentId] = useState("");
  const [outcome, setOutcome] = useState("");
  const { workspaces, selectedWorkspaceId } = useWorkspace();
  const [workspaceId, setWorkspaceId] = useState(selectedWorkspaceId ?? "");
  useEffect(() => {
    if (selectedWorkspaceId) setWorkspaceId(selectedWorkspaceId);
  }, [selectedWorkspaceId]);
  const agents = useResource<{ agents: AgentManifest[] }>("/api/agents");
  const query = new URLSearchParams({ limit: "100" });
  if (agentId) query.set("agentId", agentId);
  if (outcome) query.set("succeeded", outcome);
  if (workspaceId) query.set("workspaceId", workspaceId);
  const resource = useResource<ArtifactList>(`/api/artifacts?${query.toString()}`);
  if (resource.loading) return <Loading />;
  if (resource.error) return <ErrorNotice message={resource.error} />;
  return (
    <><PageHeader eyebrow="Validated local persistence" title="Evidence" /><p className="lede">Every accepted artifact was loaded through its current runtime schema.</p>
      <div className="filter-bar"><label>Workspace<select value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)}><option value="">All workspaces</option>{workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select></label><label>Agent<select value={agentId} onChange={(event) => setAgentId(event.target.value)}><option value="">All agents</option>{agents.data?.agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label><label>Outcome<select value={outcome} onChange={(event) => setOutcome(event.target.value)}><option value="">All outcomes</option><option value="true">Succeeded</option><option value="false">Failed</option></select></label></div>
      <div className="table-wrap"><table><thead><tr><th>Type</th><th>Workspace</th><th>Agent</th><th>Version</th><th>Outcome</th><th>Completed</th></tr></thead><tbody>{resource.data?.artifacts.map((artifact) => <tr key={artifact.id}><td><Link to={`/runs/${artifact.id}`}>{artifact.kind}</Link></td><td>{artifact.workspaceId ?? "legacy"}</td><td>{artifact.agentId}</td><td>{artifact.agentVersion}</td><td><StatusBadge value={artifact.succeeded ? "completed" : "failed"} /></td><td>{new Date(artifact.completedAt).toLocaleString()}</td></tr>)}</tbody></table></div>
      {!resource.data?.artifacts.length && <EmptyState>No agent evidence has been recorded yet.</EmptyState>}
      {!!resource.data?.rejected.length && <div className="notice"><strong>{resource.data.rejected.length} incompatible artifact(s)</strong> were rejected and excluded from this view.</div>}
    </>
  );
}

function RunDetailPage() {
  const artifactId = usePathname().split("/")[2];
  const resource = useResource<{ kind: string; artifact: unknown }>(artifactId ? `/api/artifacts/${artifactId}` : null);
  const presentation = useResource<ArtifactPresentation>(artifactId ? `/api/artifacts/${artifactId}/presentation` : null);
  if (resource.loading || presentation.loading) return <Loading />;
  if (resource.error || presentation.error || !resource.data || !presentation.data) return <ErrorNotice message={resource.error ?? presentation.error ?? "Artifact not found"} />;
  return <ArtifactPresentationView presentation={presentation.data} rawArtifact={resource.data.artifact} />;
}

function passRate(value: number | null): string {
  return value === null ? "No evidence" : `${Math.round(value * 100)}%`;
}

function EvaluationStudioPage() {
  const { workspaces, selectedWorkspaceId } = useWorkspace();
  const agents = useResource<{ agents: AgentManifest[] }>("/api/agents");
  const [agentId, setAgentId] = useState("");
  const [workspaceId, setWorkspaceId] = useState(selectedWorkspaceId ?? "");
  const [repetitions, setRepetitions] = useState(1);
  const [concurrency, setConcurrency] = useState(1);
  const [operationId, setOperationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const operation = useOperation(operationId);
  useEffect(() => {
    if (selectedWorkspaceId) setWorkspaceId(selectedWorkspaceId);
  }, [selectedWorkspaceId]);
  const query = new URLSearchParams({ limit: "100" });
  if (agentId) query.set("agentId", agentId);
  if (workspaceId) query.set("workspaceId", workspaceId);
  const evaluations = useResource<EvaluationList>(`/api/evaluations?${query.toString()}`);
  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const started = await api<Operation>(`/api/agents/${agentId}/verifications`, { method: "POST", body: JSON.stringify({ repetitions, concurrency, workspaceId: selectedWorkspaceId }) });
      setOperationId(started.operationId); setError(null);
    } catch (cause: unknown) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }
  if (evaluations.loading || agents.loading) return <Loading />;
  if (evaluations.error || agents.error) return <ErrorNotice message={evaluations.error ?? agents.error ?? "Unable to load evaluations."} />;
  return <><PageHeader eyebrow="Agent reliability laboratory" title="Evaluation Studio" /><p className="lede">Run immutable experiments, inspect every dataset case and trial, and compare agent versions without losing the underlying evidence.</p><div className="run-grid"><form className="panel" onSubmit={submit}><div className="section-heading"><h3>New experiment</h3><span className="eyebrow">Live model calls</span></div><label>Agent<select required value={agentId} onChange={(event) => setAgentId(event.target.value)}><option value="">Choose an agent</option>{agents.data?.agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label><label>Repetitions<input type="number" min="1" value={repetitions} onChange={(event) => setRepetitions(Number(event.target.value))} /></label><label>Concurrency<input type="number" min="1" max="10" value={concurrency} onChange={(event) => setConcurrency(Number(event.target.value))} /></label>{error && <ErrorNotice message={error} />}<button className="button" type="submit" disabled={!selectedWorkspaceId}>Run evaluation</button></form>{operation.data ? <OperationTrace operation={operation.data} /> : <div className="concept-card"><span className="concept-index">EVAL</span><h3>A result becomes useful when it can be compared.</h3><p>Each experiment freezes the agent version, workspace, model, execution policy, dataset gates, and links to complete case evidence.</p></div>}</div><section><div className="section-heading"><div><span className="eyebrow">Immutable history</span><h2>Experiments</h2></div></div><div className="filter-bar"><label>Workspace<select value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)}><option value="">All workspaces</option>{workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select></label><label>Agent<select value={agentId} onChange={(event) => setAgentId(event.target.value)}><option value="">All agents</option>{agents.data?.agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label></div><div className="table-wrap"><table><thead><tr><th>Experiment</th><th>Agent version</th><th>Model</th><th>Cases</th><th>Trials</th><th>Pass rate</th><th>Gate</th><th>Completed</th></tr></thead><tbody>{evaluations.data?.experiments.map((experiment) => <tr key={experiment.experimentId}><td><Link to={`/evaluations/${experiment.experimentId}`}>{experiment.experimentId.slice(0, 8)}</Link></td><td>{experiment.agentId}@{experiment.agentVersion}</td><td>{experiment.model}</td><td>{experiment.summary.passedCases}/{experiment.summary.totalCases}</td><td>{experiment.summary.passedRuns}/{experiment.summary.totalRuns}</td><td>{passRate(experiment.summary.passRate)}</td><td><StatusBadge value={experiment.passed ? "completed" : "failed"} /></td><td>{new Date(experiment.completedAt).toLocaleString()}</td></tr>)}</tbody></table></div>{!evaluations.data?.experiments.length && <EmptyState>No evaluation experiments have been recorded for this selection.</EmptyState>}{!!evaluations.data?.rejected.length && <div className="notice"><strong>{evaluations.data.rejected.length} incompatible experiment(s)</strong> were rejected rather than shown as valid evidence.</div>}</section></>;
}

function EvaluationDetailPage() {
  const experimentId = usePathname().split("/")[2];
  const resource = useResource<EvaluationView>(experimentId ? `/api/evaluations/${experimentId}` : null);
  const history = useResource<EvaluationList>(resource.data ? `/api/evaluations?agentId=${encodeURIComponent(resource.data.experiment.agentId)}&limit=100` : null);
  const [baselineId, setBaselineId] = useState("");
  const comparison = useResource<EvaluationComparison>(baselineId && experimentId ? `/api/evaluations/compare?baselineId=${encodeURIComponent(baselineId)}&candidateId=${encodeURIComponent(experimentId)}` : null);
  if (resource.loading) return <Loading />;
  if (resource.error || !resource.data) return <ErrorNotice message={resource.error ?? "Evaluation not found."} />;
  const { experiment, datasets } = resource.data;
  const alternatives = history.data?.experiments.filter(({ experimentId: id }) => id !== experiment.experimentId) ?? [];
  return <><PageHeader eyebrow={`${experiment.agentId}@${experiment.agentVersion}`} title={`Evaluation ${experiment.experimentId.slice(0, 8)}`}><StatusBadge value={experiment.passed ? "completed" : "failed"} /></PageHeader><p className="lede">An immutable experiment over {experiment.summary.totalCases} cases and {experiment.summary.totalRuns} trials.</p><section className="metric-grid evidence-metrics"><div><span>Pass rate</span><strong>{passRate(experiment.summary.passRate)}</strong></div><div><span>Cases meeting gate</span><strong>{experiment.summary.passedCases}/{experiment.summary.totalCases}</strong></div><div><span>Trials passed</span><strong>{experiment.summary.passedRuns}/{experiment.summary.totalRuns}</strong></div><div><span>Execution</span><strong className="metric-word">{experiment.execution.repetitions}× · concurrency {experiment.execution.concurrency}</strong></div></section><section className="panel comparison-panel"><div className="section-heading"><div><span className="eyebrow">Version comparison</span><h2>Compare with a baseline</h2></div></div><label>Baseline experiment<select value={baselineId} onChange={(event) => setBaselineId(event.target.value)}><option value="">Choose an earlier experiment</option>{alternatives.map((item) => <option key={item.experimentId} value={item.experimentId}>{item.experimentId.slice(0, 8)} · v{item.agentVersion} · {item.model} · {passRate(item.summary.passRate)}</option>)}</select></label>{comparison.loading && <Loading />}{comparison.error && <ErrorNotice message={comparison.error} />}{comparison.data && <><div className="metric-grid comparison-metrics"><div><span>Improved</span><strong>{comparison.data.summary.improvedCases}</strong></div><div><span>Regressed</span><strong>{comparison.data.summary.regressedCases}</strong></div><div><span>Unchanged</span><strong>{comparison.data.summary.unchangedCases}</strong></div><div><span>Insufficient evidence</span><strong>{comparison.data.summary.insufficientEvidenceCases}</strong></div></div><div className="table-wrap"><table><thead><tr><th>Case</th><th>Baseline</th><th>Candidate</th><th>Delta</th><th>Classification</th></tr></thead><tbody>{comparison.data.cases.map((item) => <tr key={`${item.datasetId}/${item.datasetCaseId}`}><td>{item.datasetId} / {item.datasetCaseId}</td><td>{passRate(item.baselinePassRate)}</td><td>{passRate(item.candidatePassRate)}</td><td>{item.passRateDelta === null ? "—" : `${item.passRateDelta >= 0 ? "+" : ""}${Math.round(item.passRateDelta * 100)} points`}</td><td><StatusBadge value={item.classification} /></td></tr>)}</tbody></table></div></>}</section>{datasets.map((dataset) => <section key={dataset.datasetId}><div className="section-heading"><div><span className="eyebrow">Dataset · threshold {dataset.minimumPassRate === null ? "not gated" : passRate(dataset.minimumPassRate)}</span><h2>{dataset.datasetId}</h2></div><StatusBadge value={dataset.passed ? "completed" : "failed"} /></div><div className="table-wrap"><table><thead><tr><th>Case</th><th>Trials</th><th>Passed</th><th>Pass rate</th><th>Gate</th></tr></thead><tbody>{dataset.cases.map((datasetCase) => <tr key={datasetCase.datasetCaseId}><td><Link to={`/evaluations/${experiment.experimentId}/cases/${encodeURIComponent(dataset.datasetId)}/${encodeURIComponent(datasetCase.datasetCaseId)}`}>{datasetCase.datasetCaseId}</Link></td><td>{datasetCase.totalRuns}</td><td>{datasetCase.passedRuns}</td><td>{passRate(datasetCase.passRate)}</td><td><StatusBadge value={datasetCase.passed ? "completed" : "failed"} /></td></tr>)}</tbody></table></div></section>)}</>;
}

function EvaluationCasePage() {
  const parts = usePathname().split("/");
  const experimentId = parts[2] ? decodeURIComponent(parts[2]) : "";
  const datasetId = parts[4] ? decodeURIComponent(parts[4]) : "";
  const caseId = parts[5] ? decodeURIComponent(parts[5]) : "";
  const resource = useResource<EvaluationCase>(experimentId && datasetId && caseId ? `/api/evaluations/${encodeURIComponent(experimentId)}/cases/${encodeURIComponent(datasetId)}/${encodeURIComponent(caseId)}` : null);
  if (resource.loading) return <Loading />;
  if (resource.error || !resource.data) return <ErrorNotice message={resource.error ?? "Evaluation case not found."} />;
  const datasetCase = resource.data;
  return <><PageHeader eyebrow={`${datasetCase.datasetId} · ${datasetCase.totalRuns} trial(s)`} title={datasetCase.datasetCaseId}><StatusBadge value={datasetCase.passed ? "completed" : "failed"} /></PageHeader><p className="lede">Reliability uses hidden dataset ground truth when present, followed by the dataset’s {datasetCase.minimumPassRate === null ? "ungated" : passRate(datasetCase.minimumPassRate)} threshold.</p><div className="report-actions"><Link className="button button-secondary" to={`/evaluations/${experimentId}`}>← Back to experiment</Link><a className="button button-secondary" href={`/api/evaluations/${encodeURIComponent(experimentId)}/cases/${encodeURIComponent(datasetId)}/${encodeURIComponent(caseId)}/draft`} download>Download regression-case draft</a></div><section className="contract-grid"><div className="panel"><span className="eyebrow">Dataset input</span><pre>{JSON.stringify(datasetCase.input, null, 2)}</pre></div>{datasetCase.expectation !== null && <div className="panel"><span className="eyebrow">Hidden evaluation expectation</span><pre>{JSON.stringify(datasetCase.expectation, null, 2)}</pre></div>}<div className="panel"><span className="eyebrow">Case reliability</span><div className="metric-grid case-metrics"><div><span>Pass rate</span><strong>{passRate(datasetCase.passRate)}</strong></div><div><span>Passed</span><strong>{datasetCase.passedRuns}/{datasetCase.totalRuns}</strong></div></div></div></section><section><div className="section-heading"><div><span className="eyebrow">Complete evidence</span><h2>Trials</h2></div></div><div className="trial-list">{datasetCase.trials.map((trial, index) => <article className="panel" key={trial.agentRunId}><div className="section-heading"><div><span className="eyebrow">Trial {index + 1} · {trial.durationMs.toFixed(0)} ms</span><h3>{trial.agentRunId}</h3></div><StatusBadge value={trial.succeeded ? "completed" : "failed"} /></div><p>{trial.caseAssessment?.message ?? trial.assessment?.message ?? trial.failure?.message ?? "No assessment was recorded."}</p>{trial.caseAssessment && <p><strong>Ground-truth assessment:</strong> {trial.caseAssessment.passed ? "matched" : "did not match"}</p>}<details><summary>Actual structured output</summary><pre>{JSON.stringify(trial.output, null, 2)}</pre></details>{trial.failure && <div className="notice notice-error">{trial.failure.stage} / {trial.failure.category}: {trial.failure.message}</div>}</article>)}</div></section></>;
}

function WorkspacesPage() {
  const { workspaces, selectedWorkspaceId, selectWorkspace, reload, loading, error: loadError } = useWorkspace();
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [rootPath, setRootPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function add(event: FormEvent) {
    event.preventDefault();
    try {
      const workspace = await api<{ id: string }>("/api/workspaces", {
        method: "POST",
        body: JSON.stringify({ id, rootPath, ...(name ? { name } : {}) }),
      });
      await reload();
      selectWorkspace(workspace.id);
      setId(""); setName(""); setRootPath(""); setError(null);
    } catch (cause: unknown) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }
  async function remove(workspaceId: string) {
    try {
      await api<void>(`/api/workspaces/${workspaceId}`, { method: "DELETE" });
      await reload();
      setError(null);
    } catch (cause: unknown) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }
  return <><PageHeader eyebrow="Local repository boundaries" title="Workspaces" /><p className="lede">Register repositories already present on this computer. Every agent tool is rebuilt with the selected repository as its allowed root.</p>{(error ?? loadError) && <ErrorNotice message={error ?? loadError ?? "Unknown error"} />}<div className="run-grid"><div className="workspace-list">{workspaces.map((workspace) => <article className={workspace.id === selectedWorkspaceId ? "panel selected-workspace" : "panel"} key={workspace.id}><div><span className="eyebrow">{workspace.builtIn ? "Built in" : "Registered"}</span><h2>{workspace.name}</h2><code>{workspace.rootPath}</code></div><div className="workspace-actions"><button className="button button-secondary" type="button" onClick={() => selectWorkspace(workspace.id)}>Select</button>{!workspace.builtIn && <button className="danger-button" type="button" onClick={() => void remove(workspace.id)}>Remove</button>}</div></article>)}</div><form className="panel" onSubmit={add}><div className="section-heading"><h3>Register local project</h3><span className="eyebrow">No Git push required</span></div><label>Workspace ID<input required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={id} onChange={(event) => setId(event.target.value)} placeholder="personal-website" /></label><label>Display name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Personal Website" /></label><label>Absolute repository path<input required value={rootPath} onChange={(event) => setRootPath(event.target.value)} placeholder="/Users/you/Projects/personal-website" /></label><button className="button" disabled={loading}>Register workspace</button></form></div></>;
}

function AuthoringPage() {
  const steps = [
    ["Manifest", "Give the agent a stable ID, version, purpose, lifecycle, component references, and permissions."],
    ["Contracts", "Define Zod schemas for everything entering and leaving the agent boundary."],
    ["Execution", "Compose existing workflows and tools through the services supplied by the shared runner."],
    ["Assessment", "Decide whether schema-valid output actually achieved the agent's goal."],
    ["Dataset", "Capture representative inputs and failure cases as versioned product tests."],
    ["Registration", "Add the typed registration to the immutable catalog and validate every reference."],
  ];
  return <><PageHeader eyebrow="Build your own" title="Agent anatomy" /><p className="lede">Agents remain TypeScript products so their executable behavior is reviewed, tested, and explicit. The console teaches the structure; source control remains the authoring boundary.</p><div className="authoring-list">{steps.map(([title, description], index) => <article key={title}><span>{String(index + 1).padStart(2, '0')}</span><div><h2>{title}</h2><p>{description}</p></div></article>)}</div><div className="panel scaffold-panel"><span className="eyebrow">Create a learning agent</span><h2>Generate the safe starting structure.</h2><pre>npm run agents -- scaffold my-first-agent</pre><p>The command creates an experimental manifest, input and output schemas, executor, assessment, smoke dataset, test, and authoring README. Registration remains an explicit reviewed step.</p></div><div className="notice"><strong>Start by comparing the two existing agents.</strong> They share the platform runner but own different contracts, workflows, assessments, and datasets.</div></>;
}

function RoutedContent() {
  const pathname = usePathname();
  let page: React.ReactNode;
  if (pathname === "/") page = <OverviewPage />;
  else if (pathname === "/agents") page = <AgentsPage />;
  else if (pathname === "/tools") page = <ToolsPage />;
  else if (/^\/tools\/[^/]+$/.test(pathname)) page = <ToolDetailPage />;
  else if (pathname === "/workspaces") page = <WorkspacesPage />;
  else if (/^\/agents\/[^/]+$/.test(pathname)) page = <AgentDetailPage />;
  else if (pathname === "/runs") page = <RunsPage />;
  else if (/^\/runs\/[^/]+$/.test(pathname)) page = <RunDetailPage />;
  else if (pathname === "/evaluations" || pathname === "/verification") page = <EvaluationStudioPage />;
  else if (/^\/evaluations\/[^/]+\/cases\/[^/]+\/[^/]+$/.test(pathname)) page = <EvaluationCasePage />;
  else if (/^\/evaluations\/[^/]+$/.test(pathname)) page = <EvaluationDetailPage />;
  else if (pathname === "/authoring") page = <AuthoringPage />;
  else page = <EmptyState>Page not found. <Link to="/">Return home</Link>.</EmptyState>;
  return <Shell>{page}</Shell>;
}

export function AppRoutes() { return <WorkspaceProvider><RoutedContent /></WorkspaceProvider>; }

export default function App() { return <AppRoutes />; }
