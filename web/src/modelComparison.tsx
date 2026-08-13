import type {
  ModelComparisonCellView,
  ModelComparisonIndex,
  ModelComparisonTriageCaseView,
  ModelComparisonView,
} from "./api.js";
import {
  EmptyState,
  ErrorNotice,
  Loading,
  MetricTile,
  PageHeader,
  RawDrawer,
  StatusBadge,
} from "./components.js";
import { useResource } from "./hooks.js";
import { LocalLink as Link, usePathname } from "./router.js";

function percent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

function usd(value: number | null): string {
  return value === null ? "—" : `$${value.toFixed(4)}`;
}

function latency(value: number | null): string {
  if (value === null) return "—";
  return value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${Math.round(value)}ms`;
}

function tokens(value: number | null): string {
  return value === null ? "—" : Math.round(value).toLocaleString();
}

function agentLabel(agentId: string, agentVersion: string | null): string {
  return agentVersion ? `${agentId}@${agentVersion}` : agentId;
}

// A "best per dimension" marker. The chip is the whole point of the modelComparison:
// the most reliable model is rarely also the cheapest or the fastest, so each
// winner is called out where the operator is already reading that number.
function BestChip({ label }: { label: string }) {
  return <span className="best-chip" title={`Best ${label} in this run`}>★ {label}</span>;
}

function ModelComparisonRow({ cell }: { cell: ModelComparisonCellView }) {
  if (cell.status === "error") {
    return (
      <tr className="model-comparison-row-error">
        <td className="model-comparison-model">{cell.model}</td>
        <td><StatusBadge value="error" /></td>
        <td colSpan={5} className="model-comparison-error-cell">{cell.error ?? "Run failed before evidence was produced."}</td>
      </tr>
    );
  }
  return (
    <tr>
      <td className="model-comparison-model">{cell.model}</td>
      <td><StatusBadge value={cell.verdict} /></td>
      <td>
        {percent(cell.passRate)}
        {cell.bestReliability ? <BestChip label="most reliable" /> : null}
      </td>
      <td>{cell.passedRuns}/{cell.totalRuns}</td>
      <td>{tokens(cell.avgTokensPerRun)}</td>
      <td>
        {usd(cell.estimatedCostUsd)}
        {cell.lowestCost ? <BestChip label="cheapest" /> : null}
      </td>
      <td>
        {latency(cell.avgLatencyMs)}
        {cell.lowestLatency ? <BestChip label="fastest" /> : null}
      </td>
    </tr>
  );
}

function TriageCaseCard({ triaged }: { triaged: ModelComparisonTriageCaseView }) {
  return (
    <article className="triage-card">
      <div className="triage-heading">
        <h3>{triaged.caseId}</h3>
        {triaged.marginal ? (
          <span className="status status-marginal" title="A failing model still partially passed — this failure is close to the gate and may be variance.">
            marginal
          </span>
        ) : null}
      </div>
      <p className="triage-dataset">{triaged.datasetId}</p>
      <dl className="triage-models">
        <div>
          <dt>Failed on</dt>
          <dd>{triaged.failedModels.join(", ")}</dd>
        </div>
        {triaged.passedModels.length > 0 ? (
          <div>
            <dt>Passed on</dt>
            <dd>{triaged.passedModels.join(", ")}</dd>
          </div>
        ) : null}
        {triaged.worstFailurePassRate !== null ? (
          <div>
            <dt>Best failing pass-rate</dt>
            <dd>{percent(triaged.worstFailurePassRate)}</dd>
          </div>
        ) : null}
      </dl>
    </article>
  );
}

export function ModelComparisonListPage() {
  const resource = useResource<ModelComparisonIndex>("/api/foundry/model-comparisons");
  if (resource.loading) return <Loading />;
  if (resource.error) return <ErrorNotice message={resource.error} />;
  const modelComparisons = resource.data?.modelComparisons ?? [];

  return (
    <>
      <PageHeader eyebrow="Cross-model reliability" title="Model comparison eval" />
      <p className="lede">
        One agent, run across a set of models, scored the same way. Each run shows where a weaker
        model still holds the gate — and where a failure is the prompt's fault, not the model's.
      </p>
      {modelComparisons.length === 0 ? (
        <EmptyState>
          No model-comparison runs recorded yet. Produce one with <code>npm run modelComparison</code>, then{" "}
          <code>npm run modelComparison:triage</code> to classify the failures.
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Agent</th>
                <th>Models</th>
                <th>Passing</th>
                <th>Triage</th>
                <th>Completed</th>
              </tr>
            </thead>
            <tbody>
              {modelComparisons.map((entry) => (
                <tr key={entry.modelComparisonId}>
                  <td>
                    <Link to={`/model-comparisons/${entry.modelComparisonId}`}>
                      {agentLabel(entry.agentId, entry.agentVersion)}
                    </Link>
                  </td>
                  <td>{entry.models.join(", ")}</td>
                  <td>{entry.modelsPassing}/{entry.modelCount}</td>
                  <td>{entry.hasTriage ? <span className="status status-triaged">triaged</span> : "—"}</td>
                  <td>{new Date(entry.completedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export function ModelComparisonDetailPage() {
  const modelComparisonId = usePathname().split("/")[2];
  const resource = useResource<ModelComparisonView>(
    modelComparisonId ? `/api/foundry/model-comparisons/${modelComparisonId}` : null,
  );
  if (resource.loading) return <Loading />;
  if (resource.error || !resource.data) {
    return <ErrorNotice message={resource.error ?? "ModelComparison not found"} />;
  }
  const view = resource.data;
  const { summary, triage } = view;
  const allPass = summary.modelsPassing === summary.modelCount && summary.modelsErrored === 0;

  return (
    <>
      <PageHeader eyebrow={agentLabel(view.agentId, view.agentVersion)} title="Model comparison eval">
        <span className={`status status-${allPass ? "pass" : "fail"}`}>
          {summary.modelsPassing}/{summary.modelCount} models pass
        </span>
      </PageHeader>
      <p className="lede">
        One agent run across {summary.modelCount} models — {view.execution.repetitions}× per model,
        concurrency {view.execution.concurrency}. The most reliable model is often neither the
        cheapest nor the fastest; the badges mark the winner per dimension.
      </p>

      <div className="cross-links">
        <Link to={`/agents/${view.agentId}`}>Agent contract →</Link>
        <Link to="/self-hardening">Self-hardening cycles →</Link>
      </div>

      <section className="metric-grid model-comparison-summary">
        <MetricTile label="Models tested" value={summary.modelCount} />
        <MetricTile
          label="Passing the gate"
          value={`${summary.modelsPassing}/${summary.modelCount}`}
          tone={allPass ? "good" : summary.modelsPassing === 0 ? "critical" : undefined}
        />
        <MetricTile
          label="Pass-rate spread"
          value={summary.passRateSpread === null ? "—" : `${Math.round(summary.passRateSpread * 100)} pts`}
          hint="Gap between the best and worst model"
          tone={summary.passRateSpread && summary.passRateSpread > 0 ? "warn" : undefined}
        />
        {summary.modelsErrored > 0 ? (
          <MetricTile label="Errored" value={summary.modelsErrored} tone="critical" />
        ) : null}
        {triage ? (
          <>
            <MetricTile
              label="Ambiguity failures"
              value={summary.ambiguityCount}
              hint="Every model failed — a prompt/gate gap"
              tone={summary.ambiguityCount > 0 ? "warn" : undefined}
            />
            <MetricTile
              label="Capability-dependent"
              value={summary.capabilityDependentCount}
              hint="Some model passed — a model-selection signal"
              tone={summary.capabilityDependentCount > 0 ? "holdout" : undefined}
            />
          </>
        ) : null}
      </section>

      <section>
        <div className="section-heading">
          <div>
            <span className="eyebrow">Per-model evidence</span>
            <h2>Comparison</h2>
          </div>
        </div>
        <div className="table-wrap">
          <table className="model-comparison-table">
            <thead>
              <tr>
                <th>Model</th>
                <th>Verdict</th>
                <th>Pass rate</th>
                <th>Passed</th>
                <th>Avg tokens</th>
                <th>Cost</th>
                <th>Latency</th>
              </tr>
            </thead>
            <tbody>
              {view.cells.map((cell) => <ModelComparisonRow cell={cell} key={cell.model} />)}
            </tbody>
          </table>
        </div>
      </section>

      {triage ? (
        <section>
          <div className="section-heading">
            <div>
              <span className="eyebrow">Error analysis</span>
              <h2>What the failures mean</h2>
            </div>
          </div>
          {triage.ambiguity.length === 0 && triage.capabilityDependent.length === 0 ? (
            <EmptyState>
              No failures to triage — every case that could be classified passed on every model.
            </EmptyState>
          ) : (
            <div className="triage-groups">
              <div className="triage-group triage-ambiguity">
                <h3 className="triage-group-title">
                  Ambiguity <span>· every model failed</span>
                </h3>
                <p className="triage-group-note">
                  The task itself is under-specified or the expectation is off. This is a
                  prompt/gate-hardening target the improvement loop can fix — not a model problem.
                </p>
                {triage.ambiguity.length === 0 ? (
                  <p className="triage-empty">None.</p>
                ) : (
                  triage.ambiguity.map((triaged) => (
                    <TriageCaseCard triaged={triaged} key={`${triaged.datasetId}/${triaged.caseId}`} />
                  ))
                )}
              </div>
              <div className="triage-group triage-capability">
                <h3 className="triage-group-title">
                  Capability-dependent <span>· some model passed</span>
                </h3>
                <p className="triage-group-note">
                  A model can do this; the failing ones hit a capability floor. This is a
                  model-selection signal, not a prompt bug.
                </p>
                {triage.capabilityDependent.length === 0 ? (
                  <p className="triage-empty">None.</p>
                ) : (
                  triage.capabilityDependent.map((triaged) => (
                    <TriageCaseCard triaged={triaged} key={`${triaged.datasetId}/${triaged.caseId}`} />
                  ))
                )}
              </div>
            </div>
          )}
        </section>
      ) : (
        <section className="notice">
          <strong>Failures not yet triaged.</strong> Run <code>npm run modelComparison:triage</code> to
          classify each failure as an ambiguity (prompt gap) or capability-dependent
          (model-selection) signal.
        </section>
      )}

      <RawDrawer label="Raw modelComparison view" value={view} />
    </>
  );
}
