import { type FormEvent, useMemo, useState } from "react";
import { api, type AgentManifest, type JsonSchema, type Operation, type VerificationEvidence } from "./api.js";
import { useOperation } from "./hooks.js";
import { LocalLink as Link } from "./router.js";
import { useWorkspace } from "./workspace.js";

export function StatusBadge({ value }: { value: string }) {
  return <span className={`status status-${value}`}>{value.replaceAll("-", " ")}</span>;
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="empty-state">{children}</div>;
}

export function Loading() {
  return <div className="loading" role="status"><span />Loading platform evidence…</div>;
}

export function ErrorNotice({ message }: { message: string }) {
  return <div className="notice notice-error" role="alert">{message}</div>;
}

export function AgentCard({ agent }: { agent: AgentManifest }) {
  return (
    <Link className="agent-card" to={`/agents/${agent.id}`}>
      <div className="card-topline"><StatusBadge value={agent.status} /><span>v{agent.version}</span></div>
      <h3>{agent.name}</h3>
      <p>{agent.description}</p>
      <div className="tag-row">{agent.tags.map((tag) => <span className="tag" key={tag}>{tag}</span>)}</div>
      <div className="card-metrics">
        <span><strong>{agent.permissions.toolIds.length}</strong> tools</span>
        <span><strong>{agent.verification.datasetIds.length}</strong> datasets</span>
      </div>
    </Link>
  );
}

function defaultInput(schema: JsonSchema): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(schema.properties ?? {}).map(([name, property]) => [
      name,
      property.default ?? (property.type === "boolean" ? false : property.type === "number" ? 0 : ""),
    ]),
  );
}

export function OperationTrace({ operation }: { operation: Operation }) {
  const artifactId = operation.kind === "agent-run"
    ? (operation.result as { artifactId?: string } | null)?.artifactId
    : null;
  const verifications = operation.kind === "agent-verification" && Array.isArray(operation.result)
    ? operation.result as VerificationEvidence[]
    : [];
  return (
    <section className="trace-panel" aria-live="polite">
      <div className="section-heading"><h3>Execution lifecycle</h3><StatusBadge value={operation.status} /></div>
      <ol className="timeline">
        {operation.events.map((event) => (
          <li key={event.sequence}>
            <span className="timeline-dot" />
            <div><strong>{event.stage}</strong><p>{event.message}</p><time>{new Date(event.occurredAt).toLocaleTimeString()}</time></div>
          </li>
        ))}
      </ol>
      {operation.error && <ErrorNotice message={operation.error} />}
      {artifactId && <Link className="button button-secondary" to={`/runs/${artifactId}`}>Inspect persisted evidence</Link>}
      {verifications.length > 0 && (
        <div className="verification-results">
          {verifications.map(({ artifactId: verificationArtifactId, verification }) => (
            <article key={verificationArtifactId}>
              <div><strong>{verification.datasetId}</strong><small>{verification.failedCaseIds.length ? `Failed: ${verification.failedCaseIds.join(", ")}` : "All cases met the policy"}</small></div>
              <StatusBadge value={verification.passed ? "completed" : "failed"} />
              <Link to={`/runs/${verificationArtifactId}`}>Evidence →</Link>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export function RunAgentPanel({ agent, schema }: { agent: AgentManifest; schema: JsonSchema }) {
  const { selectedWorkspaceId } = useWorkspace();
  const initial = useMemo(() => defaultInput(schema), [schema]);
  const [fields, setFields] = useState(initial);
  const [rawInput, setRawInput] = useState(JSON.stringify(initial, null, 2));
  const [inputMode, setInputMode] = useState<"form" | "json">("form");
  const [model, setModel] = useState(agent.defaultModel);
  const [operationId, setOperationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const operation = useOperation(operationId);

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const parsed: unknown = inputMode === "json" ? JSON.parse(rawInput) : fields;
      const started = await api<Operation>(`/api/agents/${agent.id}/runs`, {
        method: "POST",
        body: JSON.stringify({ input: parsed, model, workspaceId: selectedWorkspaceId }),
      });
      setOperationId(started.operationId);
      setError(null);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return (
    <div className="run-grid">
      <form className="panel" onSubmit={submit}>
        <div className="section-heading"><h3>Run this agent</h3><span className="eyebrow">Live model call</span></div>
        <label>Model<input value={model} onChange={(event) => setModel(event.target.value)} /></label>
        <div className="mode-switch" aria-label="Input editing mode">
          <button type="button" className={inputMode === "form" ? "active" : ""} onClick={() => setInputMode("form")}>Guided form</button>
          <button type="button" className={inputMode === "json" ? "active" : ""} onClick={() => { setRawInput(JSON.stringify(fields, null, 2)); setInputMode("json"); }}>Raw JSON</button>
        </div>
        {inputMode === "form" ? Object.entries(schema.properties ?? {}).map(([name, property]) => (
          <label key={name}>{property.title ?? name}{property.description && <small>{property.description}</small>}
            {property.type === "boolean" ? (
              <select value={String(Boolean(fields[name]))} onChange={(event) => setFields((current) => ({ ...current, [name]: event.target.value === "true" }))}><option value="true">true</option><option value="false">false</option></select>
            ) : property.type === "number" || property.type === "integer" ? (
              <input type="number" value={String(fields[name] ?? "")} onChange={(event) => setFields((current) => ({ ...current, [name]: Number(event.target.value) }))} />
            ) : (
              <textarea rows={name.toLowerCase().includes("instruction") ? 7 : 3} value={String(fields[name] ?? "")} onChange={(event) => setFields((current) => ({ ...current, [name]: event.target.value }))} />
            )}
          </label>
        )) : <label>Validated JSON input<textarea rows={12} value={rawInput} onChange={(event) => setRawInput(event.target.value)} spellCheck={false} /></label>}
        {error && <ErrorNotice message={error} />}
        <button className="button" type="submit" disabled={!selectedWorkspaceId || operation.data?.status === "running"}>Run agent</button>
      </form>
      {operation.data ? <OperationTrace operation={operation.data} /> : (
        <div className="concept-card">
          <span className="concept-index">RUN</span>
          <h3>The platform stays in control</h3>
          <p>Your input is validated, permissions are filtered from the manifest, the workflow executes, output is assessed, and complete evidence is persisted.</p>
        </div>
      )}
    </div>
  );
}
