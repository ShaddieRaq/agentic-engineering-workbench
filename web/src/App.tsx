import { useState, type FormEvent } from "react";
import { api, type AgentDescription, type AgentManifest, type ArtifactList, type Health, type Operation } from "./api.js";
import { AgentCard, EmptyState, ErrorNotice, Loading, OperationTrace, RunAgentPanel, StatusBadge } from "./components.js";
import { useOperation, useResource } from "./hooks.js";
import { LocalLink as Link, LocalNavLink as NavLink, usePathname } from "./router.js";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" to="/"><span className="brand-mark">AE</span><span>Agentic<br />Workbench</span></Link>
        <nav aria-label="Primary navigation">
          <NavLink to="/" end>Overview</NavLink>
          <NavLink to="/agents">Agents</NavLink>
          <NavLink to="/runs">Evidence</NavLink>
          <NavLink to="/verification">Verification</NavLink>
          <NavLink to="/authoring">Authoring</NavLink>
        </nav>
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
        <div><span>Workspace</span><strong className="metric-path" title={health.data?.workspaceRoot}>{health.data?.workspaceRoot.split('/').at(-1)}</strong></div>
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
  const agents = useResource<{ agents: AgentManifest[] }>("/api/agents");
  const query = new URLSearchParams({ limit: "100" });
  if (agentId) query.set("agentId", agentId);
  if (outcome) query.set("succeeded", outcome);
  const resource = useResource<ArtifactList>(`/api/artifacts?${query.toString()}`);
  if (resource.loading) return <Loading />;
  if (resource.error) return <ErrorNotice message={resource.error} />;
  return (
    <><PageHeader eyebrow="Validated local persistence" title="Evidence" /><p className="lede">Every accepted artifact was loaded through its current runtime schema.</p>
      <div className="filter-bar"><label>Agent<select value={agentId} onChange={(event) => setAgentId(event.target.value)}><option value="">All agents</option>{agents.data?.agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label><label>Outcome<select value={outcome} onChange={(event) => setOutcome(event.target.value)}><option value="">All outcomes</option><option value="true">Succeeded</option><option value="false">Failed</option></select></label></div>
      <div className="table-wrap"><table><thead><tr><th>Type</th><th>Agent</th><th>Version</th><th>Outcome</th><th>Completed</th></tr></thead><tbody>{resource.data?.artifacts.map((artifact) => <tr key={artifact.id}><td><Link to={`/runs/${artifact.id}`}>{artifact.kind}</Link></td><td>{artifact.agentId}</td><td>{artifact.agentVersion}</td><td><StatusBadge value={artifact.succeeded ? "completed" : "failed"} /></td><td>{new Date(artifact.completedAt).toLocaleString()}</td></tr>)}</tbody></table></div>
      {!resource.data?.artifacts.length && <EmptyState>No agent evidence has been recorded yet.</EmptyState>}
      {!!resource.data?.rejected.length && <div className="notice"><strong>{resource.data.rejected.length} incompatible artifact(s)</strong> were rejected and excluded from this view.</div>}
    </>
  );
}

function RunDetailPage() {
  const artifactId = usePathname().split("/")[2];
  const resource = useResource<{ kind: string; artifact: unknown }>(artifactId ? `/api/artifacts/${artifactId}` : null);
  if (resource.loading) return <Loading />;
  if (resource.error || !resource.data) return <ErrorNotice message={resource.error ?? "Artifact not found"} />;
  const artifact = resource.data.artifact as Record<string, unknown>;
  const identity = String(artifact.agentId ?? "unknown agent");
  const version = String(artifact.agentVersion ?? "unknown");
  const completedAt = String(artifact.completedAt ?? "unknown");
  return <><PageHeader eyebrow={resource.data.kind} title={`Evidence ${artifactId?.slice(0, 8)}`}><StatusBadge value={artifact.succeeded === false ? "failed" : "completed"} /></PageHeader><section className="metric-grid evidence-metrics"><div><span>Agent</span><strong className="metric-word">{identity}</strong></div><div><span>Version</span><strong className="metric-word">{version}</strong></div><div><span>Completed</span><strong className="metric-word">{completedAt === "unknown" ? completedAt : new Date(completedAt).toLocaleString()}</strong></div><div><span>Contract</span><strong className="metric-word">Validated</strong></div></section><details className="panel evidence-details"><summary>Reveal complete raw evidence</summary><p>Full inputs, outputs, assessment, configuration, and timing are shown below for deliberate inspection.</p><pre className="evidence-json">{JSON.stringify(resource.data.artifact, null, 2)}</pre></details></>;
}

function VerificationPage() {
  const agents = useResource<{ agents: AgentManifest[] }>("/api/agents");
  const [agentId, setAgentId] = useState("");
  const [repetitions, setRepetitions] = useState(1);
  const [concurrency, setConcurrency] = useState(1);
  const [operationId, setOperationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const operation = useOperation(operationId);
  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const started = await api<Operation>(`/api/agents/${agentId}/verifications`, { method: "POST", body: JSON.stringify({ repetitions, concurrency }) });
      setOperationId(started.operationId); setError(null);
    } catch (cause: unknown) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }
  return <><PageHeader eyebrow="Product-level reliability" title="Verification" /><p className="lede">Run every registered case through the complete agent—tools, workflow, model, output contract, and assessment.</p><div className="run-grid"><form className="panel" onSubmit={submit}><label>Agent<select required value={agentId} onChange={(event) => setAgentId(event.target.value)}><option value="">Choose an agent</option>{agents.data?.agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label><label>Repetitions<input type="number" min="1" value={repetitions} onChange={(event) => setRepetitions(Number(event.target.value))} /></label><label>Concurrency<input type="number" min="1" max="10" value={concurrency} onChange={(event) => setConcurrency(Number(event.target.value))} /></label>{error && <ErrorNotice message={error} />}<button className="button" type="submit">Run verification</button></form>{operation.data ? <OperationTrace operation={operation.data} /> : <div className="concept-card"><span className="concept-index">TEST</span><h3>Reliability belongs to the version</h3><p>Verification evidence is accepted only when its agent ID and version match the current manifest.</p></div>}</div></>;
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

export function AppRoutes() {
  const pathname = usePathname();
  let page: React.ReactNode;
  if (pathname === "/") page = <OverviewPage />;
  else if (pathname === "/agents") page = <AgentsPage />;
  else if (/^\/agents\/[^/]+$/.test(pathname)) page = <AgentDetailPage />;
  else if (pathname === "/runs") page = <RunsPage />;
  else if (/^\/runs\/[^/]+$/.test(pathname)) page = <RunDetailPage />;
  else if (pathname === "/verification") page = <VerificationPage />;
  else if (pathname === "/authoring") page = <AuthoringPage />;
  else page = <EmptyState>Page not found. <Link to="/">Return home</Link>.</EmptyState>;
  return <Shell>{page}</Shell>;
}

export default function App() { return <AppRoutes />; }
