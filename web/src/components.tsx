import { type FormEvent, useMemo, useState } from "react";
import { api, type AgentEvaluationEvidence, type AgentManifest, type JsonSchema, type Operation } from "./api.js";
import { useOperation } from "./hooks.js";
import { LocalLink as Link } from "./router.js";
import { useWorkspace } from "./workspace.js";

export function StatusBadge({ value }: { value: string }) {
  return <span className={`status status-${value}`}>{value.replaceAll("-", " ")}</span>;
}

// Provenance is the "no silent fabrication" guarantee: each criterion is
// tagged with where it came from. The tooltip teaches why it matters in
// context, at zero layout cost.
export const provenanceTitle: Record<string, string> = {
  "user-stated": "User-stated — the operator said this explicitly.",
  "agent-inferred":
    "Agent-inferred — the model deduced this; the operator never confirmed it.",
  unresolved: "Unresolved — a placeholder for a decision that has not been made.",
};

export function ProvenanceChip({ source, count }: { source: string; count?: number }) {
  return (
    <span className={`status status-${source}`} title={provenanceTitle[source] ?? source}>
      {count === undefined ? "" : `${count} `}
      {source.replaceAll("-", " ")}
    </span>
  );
}

// The one sanctioned "reveal raw evidence" drawer. A JSON.stringify <pre> is an
// escape hatch behind a disclosure, never the default render of a page.
export function RawDrawer({ value, label = "Reveal raw evidence" }: { value: unknown; label?: string }) {
  return (
    <details className="raw-drawer">
      <summary>{label}</summary>
      <pre className="evidence-json">{typeof value === "string" ? value : JSON.stringify(value, null, 2)}</pre>
    </details>
  );
}

// Readable rendering of arbitrary JSON data (agent inputs, evaluation
// expectations, structured outputs): objects become key/value rows, arrays
// become lists, strings render as text — not quoted JSON. The companion to
// SchemaView (which renders schemas); this renders data.
export function JsonView({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="json-null">null</span>;
  if (typeof value === "string") return <span className="json-string">{value}</span>;
  if (typeof value === "number" || typeof value === "boolean") {
    return <span className="json-scalar">{String(value)}</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="json-empty">empty list</span>;
    return (
      <ul className="json-array">
        {value.map((item, index) => <li key={index}><JsonView value={item} /></li>)}
      </ul>
    );
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return <span className="json-empty">empty</span>;
  return (
    <div className="json-object">
      {entries.map(([key, child]) => (
        <div className="json-row" key={key}>
          <span className="json-key">{key}</span>
          <div className="json-value"><JsonView value={child} /></div>
        </div>
      ))}
    </div>
  );
}

function schemaTypeLabel(schema: JsonSchema): string {
  if (Array.isArray(schema.enum)) {
    return `enum(${schema.enum.map((value) => JSON.stringify(value)).join(" | ")})`;
  }
  if (schema.type === "array") {
    return `array<${schema.items ? schemaTypeLabel(schema.items) : "any"}>`;
  }
  return schema.type ?? "any";
}

// Renders a JSON schema as a readable field tree — name · type · required ·
// description — instead of a raw JSON dump. Recurses one level into nested
// objects / arrays-of-objects.
export function SchemaView({ schema }: { schema: JsonSchema }) {
  const properties = schema.properties ?? {};
  const required = new Set(schema.required ?? []);
  const entries = Object.entries(properties);
  if (entries.length === 0) {
    return <p className="schema-empty">{schemaTypeLabel(schema)}</p>;
  }
  return (
    <div className="schema-view">
      {entries.map(([name, property]) => {
        const nested =
          property.type === "object" && property.properties
            ? property
            : property.type === "array" && property.items?.type === "object" && property.items.properties
              ? property.items
              : null;
        return (
          <div className="schema-row" key={name}>
            <div className="schema-field">
              <code className="schema-name">{name}</code>
              <span className="schema-type">{schemaTypeLabel(property)}</span>
              {required.has(name) && <span className="schema-req">required</span>}
            </div>
            {property.description && <p className="schema-desc">{property.description}</p>}
            {nested && <div className="schema-nested"><SchemaView schema={nested} /></div>}
          </div>
        );
      })}
    </div>
  );
}

// Acceptance criteria as a requirements-traceability matrix, not a card stack:
// a scannable, filterable table where each row is a criterion and the columns
// are its provenance and how an independent tester verifies it. Scan a column
// to find the gaps (which are unresolved?) instead of reading every card.
const PROVENANCE_ORDER = ["user-stated", "agent-inferred", "unresolved"] as const;

export function CriteriaMatrix({
  criteria,
  coverage,
}: {
  criteria: { id: string; text: string; source: string; verification: string }[];
  coverage?: Record<string, { test: boolean; holdout: boolean }> | undefined;
}) {
  const [filter, setFilter] = useState<string | null>(null);
  if (criteria.length === 0) return null;
  const shown = filter ? criteria.filter((criterion) => criterion.source === filter) : criteria;
  const coveredCount = coverage ? criteria.filter((criterion) => coverage[criterion.id]).length : 0;
  const holdoutCount = coverage ? criteria.filter((criterion) => coverage[criterion.id]?.holdout).length : 0;

  return (
    <div className="criteria-matrix">
      <div className="criteria-health">
        <strong>{criteria.length} acceptance criteria</strong>
        {PROVENANCE_ORDER.map((source) => {
          const count = criteria.filter((criterion) => criterion.source === source).length;
          if (count === 0) return null;
          const active = filter === source;
          return (
            <button
              type="button"
              key={source}
              className={`chip-filter${active ? " active" : ""}`}
              aria-pressed={active}
              onClick={() => setFilter(active ? null : source)}
            >
              <ProvenanceChip source={source} count={count} />
            </button>
          );
        })}
        {filter && (
          <button type="button" className="chip-clear" onClick={() => setFilter(null)}>
            show all
          </button>
        )}
        {coverage && (
          <span className="criteria-coverage-summary">
            · {coveredCount} covered
            {holdoutCount > 0 ? ` · ${holdoutCount} behind a holdout` : ""}
            {criteria.length - coveredCount > 0 ? ` · ${criteria.length - coveredCount} gap` : ""}
          </span>
        )}
      </div>
      <div className="table-wrap">
        <table className="criteria-table">
          <thead>
            <tr>
              <th>Criterion</th>
              <th>Source</th>
              <th>Verified by an independent tester</th>
              {coverage && <th>Covered by a test</th>}
            </tr>
          </thead>
          <tbody>
            {shown.map((criterion) => (
              <tr key={criterion.id} className={`source-${criterion.source}`}>
                <td className="cell-criterion">{criterion.text}</td>
                <td><ProvenanceChip source={criterion.source} /></td>
                <td className="cell-verify">{criterion.verification}</td>
                {coverage && (
                  <td className="cell-cover">
                    <CoverageCell entry={coverage[criterion.id]} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// The coverage cell threads the criterion to the tests that verify it. A
// holdout-covered criterion is the blind-verification rigor — rendered as its
// own indigo signal (NOT danger red), with a tooltip that teaches what a
// holdout is. A criterion no test touches is a gap worth flagging.
function CoverageCell({ entry }: { entry?: { test: boolean; holdout: boolean } | undefined }) {
  if (!entry || (!entry.test && !entry.holdout)) {
    return (
      <span className="cover-gap" title="No test in the current suite covers this criterion.">
        — not yet
      </span>
    );
  }
  return (
    <span className="cover-chips">
      {entry.test && (
        <span className="cover-chip test" title="A visible test covers this criterion.">
          test
        </span>
      )}
      {entry.holdout && (
        <span
          className="cover-chip holdout"
          title="Covered by a holdout — a test the builder never saw, checked on first exposure."
        >
          holdout
        </span>
      )}
    </span>
  );
}

export function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return <header className="page-header"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1></div>{children}</header>;
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="empty-state">{children}</div>;
}

// A single summary figure — the "state before detail" primitive. `tone` reaches
// for the reserved semantic colors (good=pass, warn=inferred/attention,
// critical=fail, holdout=withheld/rigor); omit it for a neutral figure.
export function MetricTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "good" | "warn" | "critical" | "holdout" | undefined;
}) {
  return (
    <div className={`metric-tile${tone ? ` tone-${tone}` : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}

export function Loading() {
  return <div className="loading" role="status"><span />Loading platform evidence…</div>;
}

// Error card (console UX settlement): plain sentence first, decisive
// excerpt promoted, full payload behind a drawer. Long raw messages —
// Zod dumps, gate refusals with id lists — stop arriving as JSON walls.
export function ErrorNotice({ message }: { message: string }) {
  const compact = message.length <= 180 && !message.includes("{") && !message.includes("\n");
  if (compact) {
    return <div className="notice notice-error" role="alert">{message}</div>;
  }
  const firstSentence = message.split(/(?<=[.!?])\s/)[0] ?? message;
  const headline =
    firstSentence.length > 160 ? `${firstSentence.slice(0, 157)}…` : firstSentence;
  return (
    <div className="notice notice-error error-card" role="alert">
      <strong>{headline}</strong>
      <details>
        <summary>Show full output</summary>
        <pre className="evidence-json">{message}</pre>
      </details>
    </div>
  );
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
      property.default ?? (
        property.type === "boolean"
          ? false
          : property.type === "number" || property.type === "integer"
            ? 0
            : property.type === "array"
              ? []
              : ""
      ),
    ]),
  );
}

function guidedInput(
  fields: Record<string, unknown>,
  schema: JsonSchema,
): Record<string, unknown> {
  const required = new Set(schema.required ?? []);

  return Object.fromEntries(
    Object.entries(fields).filter(
      ([name, value]) => required.has(name) || value !== "",
    ),
  );
}

function stringArrayValue(value: unknown): string {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").join("\n")
    : "";
}

function parseStringArray(value: string): string[] {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function OperationTrace({ operation }: { operation: Operation }) {
  const artifactId =
    operation.kind === "agent-run" ||
      operation.kind === "agent-improvement" ||
      operation.kind === "agent-candidate-evaluation"
    ? (operation.result as { artifactId?: string } | null)?.artifactId
    : null;
  const evaluation = operation.kind === "agent-verification" && operation.result && !Array.isArray(operation.result)
    ? operation.result as AgentEvaluationEvidence
    : null;
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
      {artifactId && <Link className="button button-secondary" to={`/runs/${artifactId}`}>{operation.kind === "agent-improvement" ? "Inspect improvement proposal" : operation.kind === "agent-candidate-evaluation" ? "Inspect candidate comparison" : operation.agentId === "tool-builder" ? "Inspect Tool Builder proposal" : operation.agentId === "change-risk-reviewer" ? "Inspect Change Risk review" : "Inspect persisted evidence"}</Link>}
      {evaluation && (
        <div className="verification-results">
          <article>
            <div><strong>Evaluation experiment</strong><small>{evaluation.experiment.summary.passedRuns}/{evaluation.experiment.summary.totalRuns} trials passed across {evaluation.experiment.summary.totalCases} cases</small></div>
            <StatusBadge value={evaluation.experiment.passed ? "completed" : "failed"} />
            <Link to={`/evaluations/${evaluation.artifactId}`}>Open Studio →</Link>
          </article>
          {evaluation.datasets.map(({ artifactId: datasetArtifactId, verification }) => (
            <article key={datasetArtifactId}>
              <div><strong>{verification.datasetId}</strong><small>{verification.failedCaseIds.length ? `Failed: ${verification.failedCaseIds.join(", ")}` : "All cases met the policy"}</small></div>
              <StatusBadge value={verification.passed ? "completed" : "failed"} />
              <Link to={`/runs/${datasetArtifactId}`}>Dataset evidence →</Link>
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
      const parsed: unknown = inputMode === "json"
        ? JSON.parse(rawInput)
        : guidedInput(fields, schema);
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
            ) : property.type === "array" && property.items?.type === "string" ? (
              <>
                <textarea
                  rows={4}
                  value={stringArrayValue(fields[name])}
                  onChange={(event) => setFields((current) => ({
                    ...current,
                    [name]: parseStringArray(event.target.value),
                  }))}
                />
                <small>
                  Enter one item per line{typeof property.maxItems === "number" ? ` (up to ${property.maxItems})` : ""}.
                </small>
              </>
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
