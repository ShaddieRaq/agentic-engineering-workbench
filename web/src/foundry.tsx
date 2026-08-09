import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  api,
  OPERATOR_TOKEN_STORAGE_KEY,
  storedOperatorToken,
  type FoundryChainView,
  type FoundryDecisionView,
  type FoundryProjectIndex,
  type FoundrySliceRow,
  type FoundryStoredArtifact,
  type FoundrySubmissionView,
  type Operation,
} from "./api.js";
import { EmptyState, ErrorNotice, Loading, OperationTrace, PageHeader, StatusBadge } from "./components.js";
import { useOperation, useResource } from "./hooks.js";
import { LocalLink as Link, navigate, usePathname } from "./router.js";

function shortId(id: string): string {
  return id.slice(0, 8);
}

function when(value: string): string {
  return new Date(value).toLocaleString();
}

function DecisionList({ decisions }: { decisions: FoundryDecisionView[] }) {
  if (!decisions.length) return <p className="muted-note">No decisions recorded yet.</p>;
  return (
    <ul className="decision-list">
      {decisions.map((decision) => (
        <li key={decision.decisionId}>
          <StatusBadge value={decision.decision} />
          <strong> {decision.operatorId}</strong> · {when(decision.decidedAt)}
          <p>{decision.rationale}</p>
          {decision.requestedRevisions && (
            <ul>
              {decision.requestedRevisions.map((revision) => (
                <li key={revision}>{revision}</li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

const OPERATOR_STORAGE_KEY = "workbench-operator-id";

// Decision 090: operator-attributed writes need the token the server
// printed at startup. Pasted once; api() attaches it from localStorage on
// every request after that.
export function OperatorTokenField() {
  const [token, setToken] = useState(storedOperatorToken);
  return (
    <label>
      Operator token
      <input
        type="password"
        value={token}
        placeholder="printed in the server terminal at startup"
        onChange={(event) => {
          setToken(event.target.value);
          window.localStorage.setItem(
            OPERATOR_TOKEN_STORAGE_KEY,
            event.target.value.trim(),
          );
        }}
      />
    </label>
  );
}

// Starts a model-invoking foundry stage as a tracked operation and calls
// onDone with the operation result once it completes. Stage gates live in
// the services; a violation surfaces as a failed operation in the trace.
function StageRunControl({
  label,
  action,
  body,
  onDone,
}: {
  label: string;
  action: string;
  body: unknown;
  onDone: (result: unknown) => void;
}) {
  const [operationId, setOperationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const operation = useOperation(operationId);
  const completed = useRef(false);

  useEffect(() => {
    if (operation.data?.status === "completed" && !completed.current) {
      completed.current = true;
      onDone(operation.data.result);
    }
  }, [operation.data, onDone]);

  async function start() {
    try {
      const started = await api<Operation>(action, {
        method: "POST",
        body: JSON.stringify(body),
      });
      completed.current = false;
      setOperationId(started.operationId);
      setError(null);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  const running =
    operation.data?.status === "queued" || operation.data?.status === "running";
  return (
    <div className="stage-run">
      <button className="button button-secondary" type="button" onClick={start} disabled={running}>
        {label}
      </button>
      {error && <ErrorNotice message={error} />}
      {operation.data && <OperationTrace operation={operation.data} />}
    </div>
  );
}

function IntakeStartPanel() {
  const [title, setTitle] = useState("");
  const [idea, setIdea] = useState("");
  const [operationId, setOperationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const operation = useOperation(operationId);
  const navigated = useRef(false);

  useEffect(() => {
    if (operation.data?.status === "completed" && !navigated.current) {
      navigated.current = true;
      const result = operation.data.result as { briefId?: string } | null;
      if (result?.briefId) navigate(`/foundry/${result.briefId}`);
    }
  }, [operation.data]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const started = await api<Operation>("/api/foundry/intake", {
        method: "POST",
        body: JSON.stringify({ title, idea }),
      });
      navigated.current = false;
      setOperationId(started.operationId);
      setError(null);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return (
    <div className="panel foundry-panel">
      <div className="section-heading">
        <h3>Start a new project</h3>
        <span className="eyebrow">Intake interview</span>
      </div>
      <form onSubmit={submit} className="decision-form-body">
        <label>
          Title
          <input value={title} onChange={(event) => setTitle(event.target.value)} required />
        </label>
        <label>
          Idea
          <textarea rows={3} value={idea} onChange={(event) => setIdea(event.target.value)} required />
        </label>
        {error && <ErrorNotice message={error} />}
        <button className="button" type="submit" disabled={operation.data?.status === "running" || operation.data?.status === "queued"}>
          Start interview
        </button>
      </form>
      {operation.data && <OperationTrace operation={operation.data} />}
    </div>
  );
}

// Answers the questions the interview is currently waiting on. The ids come
// from the latest intake TURN record (what the controller validates answers
// against), not the brief's openQuestions, which live in a different id
// space. The optional context field arrives as a new (unkeyed) answer,
// matching the CLI's `new=` form.
function IntakeTurnPanel({
  briefId,
  questions,
  onDone,
}: {
  briefId: string;
  questions: { id: string; question: string }[];
  onDone: () => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [additional, setAdditional] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [operationId, setOperationId] = useState<string | null>(null);
  const operation = useOperation(operationId);
  const completed = useRef(false);

  useEffect(() => {
    if (operation.data?.status === "completed" && !completed.current) {
      completed.current = true;
      onDone();
    }
  }, [operation.data, onDone]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const payload = [
      ...questions
        .filter(({ id }) => (answers[id] ?? "").trim().length > 0)
        .map(({ id }) => ({ questionId: id, answer: answers[id]!.trim() })),
      ...(additional.trim().length > 0
        ? [{ questionId: null, answer: additional.trim() }]
        : []),
    ];
    if (payload.length === 0) {
      setError("Answer at least one question or add context.");
      return;
    }
    try {
      const started = await api<Operation>(`/api/foundry/intake/${briefId}/turns`, {
        method: "POST",
        body: JSON.stringify({ answers: payload }),
      });
      completed.current = false;
      setOperationId(started.operationId);
      setError(null);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return (
    <div className="submission-block">
      <div className="section-heading">
        <h4>Open questions ({questions.length})</h4>
        <span className="eyebrow">Continue the interview</span>
      </div>
      <form onSubmit={submit} className="decision-form-body">
        {questions.map((question) => (
          <label key={question.id}>
            {question.question}
            <textarea
              rows={2}
              value={answers[question.id] ?? ""}
              onChange={(event) =>
                setAnswers((current) => ({ ...current, [question.id]: event.target.value }))
              }
            />
          </label>
        ))}
        <label>
          Additional context (optional)
          <textarea rows={2} value={additional} onChange={(event) => setAdditional(event.target.value)} />
        </label>
        {error && <ErrorNotice message={error} />}
        <button className="button" type="submit" disabled={operation.data?.status === "running" || operation.data?.status === "queued"}>
          Submit answers
        </button>
      </form>
      {operation.data && <OperationTrace operation={operation.data} />}
    </div>
  );
}

function IssueWorkOrderButton({
  testSuiteId,
  onDone,
}: {
  testSuiteId: string;
  onDone: () => void;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function issue() {
    try {
      const result = await api<{
        done?: boolean;
        message?: string;
        workOrder?: { workOrderId: string; sliceTitle: string };
      }>("/api/foundry/work-orders", {
        method: "POST",
        body: JSON.stringify({ testSuiteId }),
      });
      setMessage(
        result.done
          ? result.message ?? "Nothing left to build."
          : `Issued work order ${shortId(result.workOrder?.workOrderId ?? "")} for "${result.workOrder?.sliceTitle ?? ""}" — its slice below now shows status "ordered". Prepare the builder workspace, then hand it to the builder session.`,
      );
      setError(null);
      onDone();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return (
    <div className="stage-run">
      <button className="button button-secondary" type="button" onClick={issue}>
        Issue next work order
      </button>
      {message && <div className="notice notice-success" role="status">{message}</div>}
      {error && <ErrorNotice message={error} />}
    </div>
  );
}



// Refresh-safe operations tray: rendered purely from server state
// (console UX settlement — a reload mid-run must reconstruct in-flight
// work). Polls while anything is active; reloads the chain when an
// operation settles.
function OperationsTray({ onSettled }: { onSettled: () => void }) {
  const [rows, setRows] = useState<
    { operationId: string; label: string; status: string; createdAt: string }[]
  >([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const activeIds = useRef<Set<string>>(new Set());
  const operation = useOperation(expanded);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    async function poll() {
      try {
        const response = await api<{ operations: typeof rows }>(
          "/api/foundry/operations",
        );
        if (cancelled) return;
        const next = response.operations;
        const nextActive = new Set(
          next
            .filter(({ status }) => status === "queued" || status === "running")
            .map(({ operationId }) => operationId),
        );
        // An operation left the active set: server state changed — reload.
        for (const id of activeIds.current) {
          if (!nextActive.has(id)) onSettled();
        }
        activeIds.current = nextActive;
        setRows(next);
        timer = setTimeout(poll, nextActive.size > 0 ? 2000 : 10000);
      } catch {
        timer = setTimeout(poll, 5000);
      }
    }
    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = rows.filter(
    ({ status }) => status === "queued" || status === "running",
  );
  if (active.length === 0) return null;
  return (
    <div className="ops-tray">
      {active.map((row) => (
        <div className="ops-row" key={row.operationId}>
          <button
            type="button"
            className="ops-row-head"
            onClick={() =>
              setExpanded(expanded === row.operationId ? null : row.operationId)
            }
          >
            <StatusBadge value={row.status} /> {row.label}
            <span className="muted-note"> · started {when(row.createdAt)}</span>
          </button>
          {expanded === row.operationId && operation.data && (
            <OperationTrace operation={operation.data} />
          )}
        </div>
      ))}
    </div>
  );
}

// The server-computed answer to "what now?" — one state, one action
// (console UX settlement). run-kinds host the button; decide/answer/form
// kinds scroll to and reveal the stage's form.
function NextStepBanner({
  step,
  briefId,
  onDone,
}: {
  step: NonNullable<FoundryChainView["nextStep"]>;
  briefId: string;
  onDone: () => void;
}) {
  const [operationId, setOperationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const operation = useOperation(operationId);
  const completed = useRef(false);

  useEffect(() => {
    if (operation.data?.status === "completed" && !completed.current) {
      completed.current = true;
      onDone();
    }
  }, [operation.data, onDone]);

  async function runAction() {
    if (!step.action) return;
    try {
      const response = await api<Operation | Record<string, unknown>>(
        step.action.endpoint,
        { method: "POST", body: JSON.stringify(step.action.body) },
      );
      if (response && typeof response === "object" && "operationId" in response) {
        completed.current = false;
        setOperationId((response as Operation).operationId);
      } else {
        onDone();
      }
      setError(null);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  function jump() {
    if (!step.anchor) return;
    navigate(`/foundry/${briefId}/${step.anchor}`);
  }

  const running =
    operation.data?.status === "queued" || operation.data?.status === "running";
  return (
    <div className={`next-step next-step-${step.kind}`} role="status">
      <div>
        <strong>Next: {step.headline}</strong>
        <p className="muted-note">{step.detail}</p>
      </div>
      {step.kind === "run" && step.action && (
        <button className="button" type="button" onClick={() => void runAction()} disabled={running}>
          {running ? "Running…" : step.action.label}
        </button>
      )}
      {(step.kind === "decide" || step.kind === "answer" || step.kind === "form") && step.anchor && (
        <button className="button" type="button" onClick={jump}>
          Go to {step.kind === "answer" ? "the questions" : "the form"}
        </button>
      )}
      {error && <ErrorNotice message={error} />}
      {operation.data && operation.data.status !== "completed" && (
        <OperationTrace operation={operation.data} />
      )}
    </div>
  );
}

// Sticky scroll-nav: one glyph per stage, amber where the operator is
// needed. Display-only — the banner is the authority.
function StageRail({ chain, active }: { chain: FoundryChainView; active: string }) {
  const currentPlan = chain.plans.find(
    ({ briefVersion }) => briefVersion === chain.latestVersion,
  );
  const currentCapability = currentPlan
    ? chain.capabilityPlans.find(({ planId }) => planId === currentPlan.planId)
    : undefined;
  const currentSuite = currentCapability
    ? chain.testSuites.find(
        ({ capabilityPlanId }) =>
          capabilityPlanId === currentCapability.capabilityPlanId,
      )
    : undefined;
  const entries: { anchor: string; label: string; status: string }[] = [
    {
      anchor: "brief",
      label: "Brief",
      status: chain.intakeCanContinue
        ? "revision-requested"
        : chain.briefVersions[chain.briefVersions.length - 1]?.status ?? "draft",
    },
    { anchor: "plan", label: "Plan", status: currentPlan?.status ?? "missing" },
    { anchor: "capability", label: "Capability", status: currentCapability?.status ?? "missing" },
    { anchor: "tests", label: "Tests", status: currentSuite?.status ?? "missing" },
    {
      anchor: "build",
      label: "Build",
      status: chain.build
        ? chain.build.satisfiedSliceCount === chain.build.slices.length &&
          chain.build.slices.length > 0
          ? "approved"
          : "revision-requested"
        : "missing",
    },
  ];
  return (
    <nav className="stage-rail" aria-label="Stages">
      <Link to={`/foundry/${chain.briefId}`} className={active === "overview" ? "rail-current" : ""}>
        Overview
      </Link>
      {entries.map((entry) => (
        <Link
          key={entry.anchor}
          to={`/foundry/${chain.briefId}/${entry.anchor}`}
          className={[
            active === entry.anchor ? "rail-current" : "",
            chain.nextStep.anchor === entry.anchor ? "rail-needed" : "",
          ].join(" ").trim()}
        >
          <StatusBadge value={entry.status} /> {entry.label}
        </Link>
      ))}
    </nav>
  );
}

// The project hub: one card per stage with its status and headline
// numbers; detail lives on the stage pages.
function ProjectOverview({ chain, onReload }: { chain: FoundryChainView; onReload: () => void }) {
  const latest = chain.briefVersions[chain.briefVersions.length - 1];
  const plan = chain.plans.find(({ briefVersion }) => briefVersion === chain.latestVersion);
  const capability = plan
    ? chain.capabilityPlans.find(({ planId }) => planId === plan.planId)
    : undefined;
  const suite = capability
    ? chain.testSuites.find(({ capabilityPlanId }) => capabilityPlanId === capability.capabilityPlanId)
    : undefined;
  const cards: { anchor: string; title: string; status: string; summary: string }[] = [
    {
      anchor: "brief",
      title: "Project brief",
      status: latest?.status ?? "draft",
      summary: `v${chain.latestVersion} · ${chain.intakeTurnCount} interview turn(s) · ${chain.briefVersions.length} version(s)`,
    },
    {
      anchor: "plan",
      title: "Architecture plan",
      status: plan?.status ?? "missing",
      summary: plan
        ? `${plan.sliceCount} slice(s) · ${plan.blockingConcerns} blocking concern(s)${plan.evolvesFromCompletionId ? ` · evolution (${plan.carriedSliceCount ?? 0} carried)` : ""}`
        : "Not generated for this brief version yet.",
    },
    {
      anchor: "capability",
      title: "Capability plan",
      status: capability?.status ?? "missing",
      summary: capability
        ? `${capability.needCount} need(s) · ${capability.blockingConcerns} blocking concern(s)`
        : "Follows plan approval.",
    },
    {
      anchor: "tests",
      title: "Acceptance tests",
      status: suite?.status ?? "missing",
      summary: suite
        ? `${suite.files.length} file(s) · ${suite.files.filter(({ visibility }) => visibility === "holdout").length} holdout(s)`
        : "Follows capability approval.",
    },
    {
      anchor: "build",
      title: "Governed build",
      status: chain.build && chain.build.slices.length > 0
        ? chain.build.satisfiedSliceCount === chain.build.slices.length
          ? "approved"
          : "revision-requested"
        : "missing",
      summary: chain.build
        ? `${chain.build.satisfiedSliceCount}/${chain.build.slices.length} slices satisfied (${chain.build.approvedSliceCount} approved this round)`
        : chain.buildNote ?? "Follows suite approval.",
    },
  ];
  return (
    <>
      <div className="card-grid stage-cards">
        {cards.map((card) => (
          <Link className="agent-card" to={`/foundry/${chain.briefId}/${card.anchor}`} key={card.anchor}>
            <div className="card-topline">
              <StatusBadge value={card.status} />
              {chain.nextStep.anchor === card.anchor && <span className="eyebrow">← next</span>}
            </div>
            <h3>{card.title}</h3>
            <p>{card.summary}</p>
          </Link>
        ))}
      </div>
      {chain.standingAdvisories.length > 0 && (
        <details className="panel history-strip">
          <summary>{chain.standingAdvisories.length} open edge(s) recorded by prior gates — expand to review</summary>
          {chain.standingAdvisories.map((advisory) => (
            <p className="muted-note" key={`${advisory.stage}-${advisory.description.slice(0, 40)}`}>
              <StatusBadge value={advisory.stage} /> ×{advisory.occurrences} — {advisory.description}
            </p>
          ))}
        </details>
      )}
      {chain.completions.length > 0 && (
        <div className="panel" style={{ marginTop: 14 }}>
          <span className="eyebrow">Generation closures</span>
          {chain.completions.map((completion) => (
            <div key={completion.completionId}>
              <p className="muted-note">
                <StatusBadge value="completed" /> Completion {shortId(completion.completionId)} · brief v{completion.briefVersion} · {completion.builtSliceCount} slice(s) · main {completion.mainCommitSha.slice(0, 10)} · {completion.operatorId}
                {completion.recordedRetroactively && <> · recorded retroactively</>}
              </p>
              {completion.fieldReports.map((report) => (
                <p className="muted-note field-report" key={report.fieldReportId}>
                  <StatusBadge value="field report" /> {report.operatorId} · {when(report.createdAt)} — {report.report}
                </p>
              ))}
              <FieldReportForm completionId={completion.completionId} onRecorded={onReload} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// Closes a build generation (Decision 088): re-runs the full approved
// suite — holdouts included — against the project's main, then records the
// operator-signed completion with commit and tree pins. Evolution rounds
// descend from this record.
function RecordCompletionPanel({
  testSuiteId,
  onDone,
}: {
  testSuiteId: string;
  onDone: () => void;
}) {
  const [projectRoot, setProjectRoot] = useState("");
  const [operatorId, setOperatorId] = useState(
    () => window.localStorage.getItem(OPERATOR_STORAGE_KEY) ?? "",
  );
  const [retroactive, setRetroactive] = useState(false);
  const [operationId, setOperationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const operation = useOperation(operationId);
  const completed = useRef(false);

  useEffect(() => {
    if (operation.data?.status === "completed" && !completed.current) {
      completed.current = true;
      onDone();
    }
  }, [operation.data, onDone]);

  async function start(event: FormEvent) {
    event.preventDefault();
    try {
      const started = await api<Operation>("/api/foundry/completions", {
        method: "POST",
        body: JSON.stringify({
          testSuiteId,
          projectRoot,
          operatorId,
          ...(retroactive ? { retroactive } : {}),
        }),
      });
      window.localStorage.setItem(OPERATOR_STORAGE_KEY, operatorId);
      completed.current = false;
      setOperationId(started.operationId);
      setError(null);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return (
    <details className="panel decision-form">
      <summary>Record build completion (close this generation)</summary>
      <form onSubmit={(event) => void start(event)} className="decision-form-body">
        <p className="muted-note">
          Re-runs the FULL approved suite — holdouts included — out-of-tree
          against the project&apos;s main, then pins the commit and tree
          digest. Refuses a dirty tree or a red suite.
        </p>
        <label>
          Project root (absolute path)
          <input required value={projectRoot} onChange={(event) => setProjectRoot(event.target.value)} placeholder="/Users/you/Projects/generated/my-project" />
        </label>
        <label>
          Operator
          <input required value={operatorId} onChange={(event) => setOperatorId(event.target.value)} />
        </label>
        <OperatorTokenField />
        <label className="checkbox-label">
          <input type="checkbox" checked={retroactive} onChange={(event) => setRetroactive(event.target.checked)} />
          {" "}Recorded retroactively (build predates completion records)
        </label>
        {error && <ErrorNotice message={error} />}
        {operation.data && <OperationTrace operation={operation.data} />}
        <button className="button" type="submit">Record completion</button>
      </form>
    </details>
  );
}

// Records an operator-attributed decision against a decisions endpoint.
// Approval gates live server-side in the decision constructors; this form
// only collects the human identity, verdict, and rationale.
function DecisionForm({ action, onRecorded, allowReopen, defaultOpen }: { action: string; onRecorded: () => void; allowReopen?: boolean; defaultOpen?: boolean }) {
  const [decision, setDecision] = useState<"approve" | "reject" | "revise" | "reopen">("approve");
  const [operatorId, setOperatorId] = useState(
    () => window.localStorage.getItem(OPERATOR_STORAGE_KEY) ?? "",
  );
  const [rationale, setRationale] = useState("");
  const [revisions, setRevisions] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [recorded, setRecorded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const requestedRevisions = revisions
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      await api(action, {
        method: "POST",
        body: JSON.stringify({
          decision,
          operatorId,
          rationale,
          ...(decision === "revise" ? { requestedRevisions } : {}),
        }),
      });
      window.localStorage.setItem(OPERATOR_STORAGE_KEY, operatorId);
      setError(null);
      setRecorded(`Recorded: ${decision} by ${operatorId}. The page has refreshed with the new status.`);
      setRationale("");
      setRevisions("");
      onRecorded();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setRecorded(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="decision-form" open={defaultOpen}>
      <summary>Record decision</summary>
      <form className="panel" onSubmit={submit}>
        <label>
          Decision
          <select value={decision} onChange={(event) => setDecision(event.target.value as "approve" | "reject" | "revise" | "reopen")}>
            <option value="approve">approve</option>
            <option value="reject">reject</option>
            <option value="revise">revise</option>
            {allowReopen && <option value="reopen">reopen (start an evolution round)</option>}
          </select>
        </label>
        <label>
          Operator
          <input value={operatorId} onChange={(event) => setOperatorId(event.target.value)} placeholder="who is deciding" required />
        </label>
        <OperatorTokenField />
        <label>
          Rationale
          <textarea rows={3} value={rationale} onChange={(event) => setRationale(event.target.value)} required />
        </label>
        {decision === "revise" && (
          <label>
            Requested revisions (one per line)
            <textarea rows={3} value={revisions} onChange={(event) => setRevisions(event.target.value)} />
          </label>
        )}
        {error && <ErrorNotice message={error} />}
        {recorded && <div className="notice notice-success" role="status">{recorded}</div>}
        <button className="button" type="submit" disabled={busy}>Record {decision}</button>
      </form>
    </details>
  );
}

export function FoundryProjectsPage() {
  const resource = useResource<FoundryProjectIndex>("/api/foundry/projects");
  if (resource.loading) return <Loading />;
  if (resource.error) return <ErrorNotice message={resource.error} />;
  const index = resource.data;
  return (
    <>
      <PageHeader eyebrow="Idea to verified software" title="Foundry" />
      <p className="lede">
        Every project is a governed chain: an interviewed brief, an architecture plan,
        a capability plan, independently designed tests, and a slice-by-slice build —
        each stage gated by an operator decision.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Project</th><th>Brief</th><th>Plan</th><th>Capabilities</th><th>Tests</th><th>Build</th><th>Last activity</th></tr>
          </thead>
          <tbody>
            {index?.projects.map((project) => (
              <tr key={project.briefId}>
                <td><Link to={`/foundry/${project.briefId}`}>{project.title}</Link><br /><small className="muted-note">v{project.latestVersion} · {shortId(project.briefId)}</small></td>
                <td><StatusBadge value={project.status} /></td>
                <td><StatusBadge value={project.stages.plan} /></td>
                <td><StatusBadge value={project.stages.capability} /></td>
                <td><StatusBadge value={project.stages.tests} /></td>
                <td>{project.stages.build ? `${project.stages.build.approved}/${project.stages.build.total} slices` : "—"}</td>
                <td>{when(project.latestActivityAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!index?.projects.length && <EmptyState>No foundry projects yet. Start one with an intake interview.</EmptyState>}
      {!!index?.rejected.length && (
        <div className="notice"><strong>{index.rejected.length} incompatible foundry artifact(s)</strong> were rejected store-wide and excluded from every view.</div>
      )}
      <section className="foundry-stage">
        <IntakeStartPanel />
      </section>
    </>
  );
}

function SubmissionDetails({ submission, onRecorded }: { submission: FoundrySubmissionView; onRecorded: () => void }) {
  return (
    <div className="submission-block">
      <div className="section-heading">
        <h4>Submission {shortId(submission.submissionId)} · {when(submission.createdAt)}</h4>
        <StatusBadge value={submission.status} />
      </div>
      {submission.builderReport && (
        <div className="builder-authored">
          <span className="eyebrow">Builder report — builder-authored, unverified</span>
          <p>{submission.builderReport}</p>
        </div>
      )}
      <p>
        Scope check: <StatusBadge value={submission.scopeCheck.passed ? "passed" : "failed"} />
      </p>
      {!!submission.scopeCheck.failures.length && (
        <ul className="decision-list">
          {submission.scopeCheck.failures.map((failure) => <li key={failure}>{failure}</li>)}
        </ul>
      )}
      {!!submission.files.length && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Test file</th><th>Visibility</th><th>Exit</th><th>Result</th></tr></thead>
            <tbody>
              {submission.files.map((file) => (
                <tr key={file.path}>
                  <td><code>{file.path}</code></td>
                  <td><StatusBadge value={file.visibility} /></td>
                  <td>{file.exitCode}</td>
                  <td><StatusBadge value={file.passed ? "passed" : "failed"} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {submission.outputExcerpt && (
        <details className="panel evidence-details">
          <summary>Test run output excerpt</summary>
          <pre className="evidence-json">{submission.outputExcerpt}</pre>
        </details>
      )}
      <DecisionList decisions={submission.decisions} />
      <DecisionForm
        action={`/api/foundry/submissions/${submission.submissionId}/decisions`}
        onRecorded={onRecorded}
        defaultOpen={submission.decisions.length === 0}
      />
      <Link to={`/foundry/artifacts/${submission.submissionId}`}>Raw submission evidence →</Link>
    </div>
  );
}

// Field report against a completed generation (Decision 090): what the
// shipped software actually did on real inputs. Seeds the next reopened
// interview automatically.
function FieldReportForm({ completionId, onRecorded }: { completionId: string; onRecorded: () => void }) {
  const [operatorId, setOperatorId] = useState(
    () => window.localStorage.getItem(OPERATOR_STORAGE_KEY) ?? "",
  );
  const [report, setReport] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api(`/api/foundry/completions/${completionId}/field-reports`, {
        method: "POST",
        body: JSON.stringify({ operatorId, report }),
      });
      window.localStorage.setItem(OPERATOR_STORAGE_KEY, operatorId);
      setError(null);
      setReport("");
      onRecorded();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="decision-form">
      <summary>Record field report (what the shipped software did on real inputs)</summary>
      <form className="decision-form-body" onSubmit={(event) => void submit(event)}>
        <p className="muted-note">
          Concrete observations beat judgments: what you ran, what it produced,
          what was wrong. This feeds the next reopened interview automatically.
        </p>
        <label>
          Operator
          <input required value={operatorId} onChange={(event) => setOperatorId(event.target.value)} />
        </label>
        <OperatorTokenField />
        <label>
          Report
          <textarea required rows={4} value={report} onChange={(event) => setReport(event.target.value)} />
        </label>
        {error && <ErrorNotice message={error} />}
        <button className="button" type="submit" disabled={busy}>Record field report</button>
      </form>
    </details>
  );
}

// Operator answer to a builder question (Decision 090). Token-guarded
// server-side; the answer becomes an artifact the builder polls for.
function AnswerQuestionForm({ questionId, onRecorded }: { questionId: string; onRecorded: () => void }) {
  const [operatorId, setOperatorId] = useState(
    () => window.localStorage.getItem(OPERATOR_STORAGE_KEY) ?? "",
  );
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api(`/api/foundry/questions/${questionId}/answers`, {
        method: "POST",
        body: JSON.stringify({ operatorId, answer }),
      });
      window.localStorage.setItem(OPERATOR_STORAGE_KEY, operatorId);
      setError(null);
      onRecorded();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="decision-form-body" onSubmit={(event) => void submit(event)}>
      <label>
        Operator
        <input required value={operatorId} onChange={(event) => setOperatorId(event.target.value)} />
      </label>
      <OperatorTokenField />
      <label>
        Answer
        <textarea required rows={3} value={answer} onChange={(event) => setAnswer(event.target.value)} />
      </label>
      {error && <ErrorNotice message={error} />}
      <button className="button" type="submit" disabled={busy}>Send answer to the builder</button>
    </form>
  );
}

// Builder speech on a slice (Decision 090): notes and questions, rendered
// clearly labeled as builder-authored. The builder informs and asks; it
// never decides.
function BuilderSpeech({ slice, onRecorded }: { slice: FoundrySliceRow; onRecorded: () => void }) {
  if (!slice.builderNotes.length && !slice.builderQuestions.length) return null;
  return (
    <div className="builder-speech">
      <span className="eyebrow">Builder messages — builder-authored, unverified</span>
      {slice.builderNotes.map((note) => (
        <p className="muted-note" key={note.noteId}>
          <StatusBadge value="note" /> {when(note.createdAt)} — {note.note}
        </p>
      ))}
      {slice.builderQuestions.map((question) => (
        <div className={question.answer ? "builder-question answered" : "builder-question"} key={question.questionId}>
          <p>
            <StatusBadge value={question.answer ? "answered" : "question"} /> {when(question.createdAt)} — {question.question}
          </p>
          {question.answer ? (
            <p className="muted-note">
              <strong>{question.answer.operatorId}</strong> · {when(question.answer.answeredAt)} — {question.answer.answer}
            </p>
          ) : (
            <AnswerQuestionForm questionId={question.questionId} onRecorded={onRecorded} />
          )}
        </div>
      ))}
    </div>
  );
}

const STAGE_PAGES = ["brief", "plan", "capability", "tests", "build"] as const;
type StagePage = (typeof STAGE_PAGES)[number] | "overview";

export function FoundryProjectPage() {
  const parts = usePathname().split("/");
  const briefId = parts[2];
  const stagePage: StagePage = STAGE_PAGES.includes(parts[3] as never)
    ? (parts[3] as StagePage)
    : "overview";
  const resource = useResource<FoundryChainView>(briefId ? `/api/foundry/projects/${briefId}` : null);
  if (resource.loading) return <Loading />;
  if (resource.error || !resource.data) return <ErrorNotice message={resource.error ?? "Project not found"} />;
  const chain = resource.data;
  return (
    <>
      <PageHeader eyebrow={`Foundry project · v${chain.latestVersion}`} title={chain.title}>
        <StatusBadge value={chain.status} />
      </PageHeader>
      <p className="lede">
        Chain {shortId(chain.briefId)} · {chain.intakeTurnCount} intake turn(s) · last activity {when(chain.latestActivityAt)}
      </p>

      <NextStepBanner step={chain.nextStep} briefId={chain.briefId} onDone={resource.reload} />
      <OperationsTray onSettled={resource.reload} />
      <StageRail chain={chain} active={stagePage} />

      {stagePage === "overview" && <ProjectOverview chain={chain} onReload={resource.reload} />}

      {stagePage === "brief" && (<>

      <section className="foundry-stage" id="stage-brief">
        <div className="section-heading"><div><span className="eyebrow">Stage 1</span><h2>Project brief</h2></div></div>
        {(() => {
          const newestFirst = [...chain.briefVersions].reverse();
          const [currentVersion, ...versionHistory] = newestFirst;
          const renderVersion = (version: typeof newestFirst[number]) => (
          <div className="panel foundry-panel" key={version.artifactId}>
            <div className="section-heading">
              <h3>Version {version.version} · {when(version.createdAt)}</h3>
              <StatusBadge value={version.status} />
            </div>
            {version.criterionChanges && (
              <div className="notice">
                <strong>Criterion changes vs v{version.version - 1}</strong>
                {version.criterionChanges.changed.map((text) => (
                  <p className="muted-note" key={`changed-${text}`}>rewritten: {text}</p>
                ))}
                {version.criterionChanges.added.map((text) => (
                  <p className="muted-note" key={`added-${text}`}>added: {text}</p>
                ))}
                {version.criterionChanges.retired.map((text) => (
                  <p className="muted-note" key={`retired-${text}`}>retired: {text}</p>
                ))}
              </div>
            )}
            <DecisionList decisions={version.decisions} />
            {version.version === chain.latestVersion && chain.intakeCanContinue && (
              <IntakeTurnPanel briefId={chain.briefId} questions={chain.intakeQuestions} onDone={resource.reload} />
            )}
            <DecisionForm
              action={`/api/foundry/briefs/${chain.briefId}/versions/${version.version}/decisions`}
              onRecorded={resource.reload}
              allowReopen={version.version === chain.latestVersion && version.status === "approved"}
              defaultOpen={version.version === chain.latestVersion && version.status === "draft" && !chain.intakeCanContinue}
            />
            <Link to={`/foundry/artifacts/${version.artifactId}`}>Raw brief →</Link>
          </div>
          );
          return (
            <>
              {currentVersion && renderVersion(currentVersion)}
              {versionHistory.length > 0 && (
                <details className="history-strip">
                  <summary>{versionHistory.length} earlier version(s) — collapsed history</summary>
                  {versionHistory.map(renderVersion)}
                </details>
              )}
            </>
          );
        })()}
      </section>

      {chain.standingAdvisories.length > 0 && (
        <section className="foundry-stage">
          <div className="section-heading"><div><span className="eyebrow">Open edges</span><h2>Standing advisories ({chain.standingAdvisories.length})</h2></div></div>
          <details className="panel history-strip">
            <summary>{chain.standingAdvisories.length} open edge(s) recorded by prior gates — expand to review</summary>
            <p className="muted-note">
              Advisory concerns from approved artifacts across all generations — the system&apos;s own defect predictions. Each stays here until a criterion resolves it; reopened interviews carry this list automatically.
            </p>
            {chain.standingAdvisories.map((advisory) => (
              <p className="muted-note" key={`${advisory.stage}-${advisory.description.slice(0, 40)}`}>
                <StatusBadge value={advisory.stage} /> ×{advisory.occurrences} · since {new Date(advisory.firstRecordedAt).toLocaleDateString()} — {advisory.description}
              </p>
            ))}
          </details>
        </section>
      )}
      </>)}

      {stagePage === "plan" && (<>
      <section className="foundry-stage" id="stage-plan">
        <div className="section-heading"><div><span className="eyebrow">Stage 2</span><h2>Architecture plans</h2></div></div>
        {chain.status === "approved" && (() => {
          // Decision 088: after a completion, a newer approved brief means
          // the next plan is an EVOLUTION plan descending from it.
          const latestCompletion = chain.completions[0];
          const evolveFrom =
            latestCompletion && chain.latestVersion > latestCompletion.briefVersion
              ? latestCompletion.completionId
              : undefined;
          return (
            <StageRunControl
              label={evolveFrom ? `Generate evolution plan (from completion ${shortId(evolveFrom)})` : "Generate architecture plan"}
              action="/api/foundry/plans"
              body={{ briefId: chain.briefId, ...(evolveFrom ? { evolveFrom } : {}) }}
              onDone={resource.reload}
            />
          );
        })()}
        {!chain.plans.length && <EmptyState>No architecture plan yet.</EmptyState>}
        {(() => {
          const [currentPlan, ...planHistory] = chain.plans;
          const renderPlan = (plan: typeof chain.plans[number]) => (
          <div className="panel foundry-panel" key={plan.planId}>
            <div className="section-heading">
              <h3>Plan {shortId(plan.planId)} · {when(plan.createdAt)}</h3>
              <StatusBadge value={plan.status} />
            </div>
            <p className="muted-note">
              {plan.componentCount} component(s) · {plan.sliceCount} slice(s) · {plan.blockingConcerns} blocking / {plan.advisoryConcerns} advisory concern(s)
              {plan.revisedFromArtifactId && <> · revision of {shortId(plan.revisedFromArtifactId)}</>}
              {plan.evolvesFromCompletionId && <> · <strong>evolution plan</strong> ({plan.carriedSliceCount ?? 0} carried) from completion {shortId(plan.evolvesFromCompletionId)}</>}
            </p>
            <p className="muted-note">
              Acceptance mappings:{" "}
              {Object.entries(plan.mappingTestTypes).map(([type, count]) => (
                <span key={type} className="mapping-type">
                  <StatusBadge value={type === "manual" ? "manual" : type} /> ×{count}{" "}
                </span>
              ))}
              {plan.mappingTestTypes["manual"] ? (
                <strong className="mapping-warning">
                  — manual mappings cannot be verified by the governed build; consider a revise decision.
                </strong>
              ) : null}
            </p>
            <DecisionList decisions={plan.decisions} />
            {plan.status === "revision-requested" && (
              <StageRunControl
                label="Re-run with the requested revisions"
                action="/api/foundry/plans"
                body={{
                  briefId: chain.briefId,
                  reviseFrom: plan.planId,
                  ...(plan.evolvesFromCompletionId
                    ? { evolveFrom: plan.evolvesFromCompletionId }
                    : {}),
                }}
                onDone={resource.reload}
              />
            )}
            <DecisionForm
              action={`/api/foundry/plans/${plan.planId}/decisions`}
              onRecorded={resource.reload}
              defaultOpen={plan.status === "draft"}
            />
            <Link to={`/foundry/artifacts/${plan.planId}`}>Raw plan →</Link>
          </div>
          );
          return (
            <>
              {currentPlan && renderPlan(currentPlan)}
              {planHistory.length > 0 && (
                <details className="history-strip">
                  <summary>{planHistory.length} earlier plan(s) — collapsed history</summary>
                  {planHistory.map(renderPlan)}
                </details>
              )}
            </>
          );
        })()}
      </section>
      </>)}

      {stagePage === "capability" && (<>
      <section className="foundry-stage" id="stage-capability">
        <div className="section-heading"><div><span className="eyebrow">Stage 3</span><h2>Capability plans</h2></div></div>
        {chain.plans.some(({ status }) => status === "approved") && (
          <StageRunControl
            label="Generate capability plan"
            action="/api/foundry/capability-plans"
            body={{ planId: chain.plans.find(({ status }) => status === "approved")!.planId }}
            onDone={resource.reload}
          />
        )}
        {!chain.capabilityPlans.length && <EmptyState>No capability plan yet.</EmptyState>}
        {(() => {
          const [currentCapability, ...capabilityHistory] = chain.capabilityPlans;
          const renderCapability = (plan: typeof chain.capabilityPlans[number]) => (
          <div className="panel foundry-panel" key={plan.capabilityPlanId}>
            <div className="section-heading">
              <h3>Capability plan {shortId(plan.capabilityPlanId)} · {when(plan.createdAt)}</h3>
              <StatusBadge value={plan.status} />
            </div>
            <p className="muted-note">
              {plan.needCount} need(s) · {plan.proposedCapabilityCount} proposed capability(ies) · for plan {shortId(plan.planId)}
              {plan.revisedFromArtifactId && <> · revision of {shortId(plan.revisedFromArtifactId)}</>}
            </p>
            <DecisionList decisions={plan.decisions} />
            {plan.status === "revision-requested" && (
              <StageRunControl
                label="Re-run with the requested revisions"
                action="/api/foundry/capability-plans"
                body={{ planId: plan.planId, reviseFrom: plan.capabilityPlanId }}
                onDone={resource.reload}
              />
            )}
            <DecisionForm
              action={`/api/foundry/capability-plans/${plan.capabilityPlanId}/decisions`}
              onRecorded={resource.reload}
              defaultOpen={plan.status === "draft"}
            />
            <Link to={`/foundry/artifacts/${plan.capabilityPlanId}`}>Raw capability plan →</Link>
          </div>
          );
          return (
            <>
              {currentCapability && renderCapability(currentCapability)}
              {capabilityHistory.length > 0 && (
                <details className="history-strip">
                  <summary>{capabilityHistory.length} earlier capability plan(s) — collapsed history</summary>
                  {capabilityHistory.map(renderCapability)}
                </details>
              )}
            </>
          );
        })()}
      </section>
      </>)}

      {stagePage === "tests" && (<>
      <section className="foundry-stage" id="stage-tests">
        <div className="section-heading"><div><span className="eyebrow">Stage 4</span><h2>Acceptance test suites</h2></div></div>
        {chain.capabilityPlans.some(({ status }) => status === "approved") && (
          <StageRunControl
            label="Design acceptance tests"
            action="/api/foundry/test-suites"
            body={{
              capabilityPlanId: chain.capabilityPlans.find(({ status }) => status === "approved")!.capabilityPlanId,
            }}
            onDone={resource.reload}
          />
        )}
        {!chain.testSuites.length && <EmptyState>No test suite yet.</EmptyState>}
        {(() => {
          const [currentSuite, ...suiteHistory] = chain.testSuites;
          const renderSuite = (suite: typeof chain.testSuites[number]) => (
          <div className="panel foundry-panel" key={suite.testSuiteId}>
            <div className="section-heading">
              <h3>Suite {shortId(suite.testSuiteId)} · {when(suite.createdAt)}</h3>
              <StatusBadge value={suite.status} />
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Test file</th><th>Visibility</th><th>Type</th><th>Criteria</th></tr></thead>
                <tbody>
                  {suite.files.map((file) => (
                    <tr key={file.path}>
                      <td><code>{file.path}</code></td>
                      <td><StatusBadge value={file.visibility} /></td>
                      <td>{file.testType}</td>
                      <td>{file.coveredCriterionIds.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <details className="panel evidence-details">
              <summary>Interface contract</summary>
              <pre className="evidence-json">{suite.interfaceContract}</pre>
            </details>
            <DecisionList decisions={suite.decisions} />
            {suite.status === "revision-requested" && (
              <StageRunControl
                label="Re-run with the requested revisions"
                action="/api/foundry/test-suites"
                body={{ capabilityPlanId: suite.capabilityPlanId, reviseFrom: suite.testSuiteId }}
                onDone={resource.reload}
              />
            )}
            <DecisionForm
              action={`/api/foundry/test-suites/${suite.testSuiteId}/decisions`}
              onRecorded={resource.reload}
              defaultOpen={suite.status === "draft"}
            />
            <Link to={`/foundry/artifacts/${suite.testSuiteId}`}>Raw suite (includes holdout content) →</Link>
          </div>
          );
          return (
            <>
              {currentSuite && renderSuite(currentSuite)}
              {suiteHistory.length > 0 && (
                <details className="history-strip">
                  <summary>{suiteHistory.length} earlier suite(s) — collapsed history</summary>
                  {suiteHistory.map(renderSuite)}
                </details>
              )}
            </>
          );
        })()}
      </section>
      </>)}

      {stagePage === "build" && (<>
      <section className="foundry-stage" id="stage-build">
        <div className="section-heading"><div><span className="eyebrow">Stage 5</span><h2>Governed build</h2></div></div>
        {chain.completions.length > 0 && (
          <div className="panel">
            <span className="eyebrow">Generation closures</span>
            {chain.completions.map((completion) => (
              <p className="muted-note" key={completion.completionId}>
                <StatusBadge value="completed" /> Completion {shortId(completion.completionId)} · suite {shortId(completion.testSuiteId)} · {completion.builtSliceCount} slice(s) · main {completion.mainCommitSha.slice(0, 10)} · tree {completion.treeDigest.slice(0, 10)}… · {completion.operatorId} · {new Date(completion.createdAt).toLocaleString()}
                {completion.recordedRetroactively && <> · <strong>recorded retroactively</strong></>}
              </p>
            ))}
          </div>
        )}
        {chain.buildNote && <div className="notice">{chain.buildNote}</div>}
        {chain.build && chain.build.planAvailable && (
          <>
            <p className="muted-note">
              Anchored on approved suite {shortId(chain.build.anchorTestSuiteId)} · {chain.build.satisfiedSliceCount}/{chain.build.slices.length} slices satisfied ({chain.build.approvedSliceCount} approved this round{chain.build.satisfiedSliceCount > chain.build.approvedSliceCount ? `, ${chain.build.satisfiedSliceCount - chain.build.approvedSliceCount} carried` : ""})
            </p>
            <IssueWorkOrderButton
              testSuiteId={chain.build.anchorTestSuiteId}
              onDone={resource.reload}
            />
            {chain.build.satisfiedSliceCount === chain.build.slices.length &&
              chain.build.slices.length > 0 &&
              !chain.completions.some(
                (completion) => completion.testSuiteId === chain.build!.anchorTestSuiteId,
              ) && (
                <RecordCompletionPanel
                  testSuiteId={chain.build.anchorTestSuiteId}
                  onDone={resource.reload}
                />
              )}
            {chain.build.slices.map((slice, index) => (
              slice.status === "carried" ? (
                <div className="panel foundry-panel slice-carried" key={slice.sliceId}>
                  <div className="section-heading">
                    <h3>Slice {index + 1}: {slice.title}</h3>
                    <StatusBadge value="carried" />
                  </div>
                  <p className="muted-note">Built and verified in a prior generation; satisfied by the pinned completion record.</p>
                </div>
              ) : (
              <div className="panel foundry-panel" key={slice.sliceId}>
                <div className="section-heading">
                  <h3>Slice {index + 1}: {slice.title}</h3>
                  <StatusBadge value={slice.status} />
                </div>
                <p className="muted-note">{slice.delivers}</p>
                {!!slice.workOrders.length && (
                  <p className="muted-note">
                    Work order {shortId(slice.workOrders[0]!.workOrderId)} · {slice.workOrders[0]!.applicableTestFilePaths.length} applicable test file(s) ·{" "}
                    <Link to={`/foundry/artifacts/${slice.workOrders[0]!.workOrderId}`}>raw →</Link>
                  </p>
                )}
                <BuilderSpeech slice={slice} onRecorded={resource.reload} />
                {slice.submissions.map((submission) => (
                  <SubmissionDetails
                    submission={submission}
                    onRecorded={resource.reload}
                    key={submission.submissionId}
                  />
                ))}
              </div>
              )
            ))}
          </>
        )}
      </section>
      </>)}
    </>
  );
}

export function FoundryArtifactPage() {
  const artifactId = usePathname().split("/")[3];
  const resource = useResource<FoundryStoredArtifact>(
    artifactId ? `/api/foundry/artifacts/${artifactId}` : null,
  );
  if (resource.loading) return <Loading />;
  if (resource.error || !resource.data) return <ErrorNotice message={resource.error ?? "Artifact not found"} />;
  const stored = resource.data;
  return (
    <>
      <PageHeader eyebrow="Raw foundry evidence" title={stored.kind}>
        <StatusBadge value={stored.kind} />
      </PageHeader>
      <p className="lede"><code>{artifactId}</code></p>
      {stored.kind === "test-suite" && (
        <div className="notice">
          This artifact includes <strong>holdout test content</strong>. It is never
          materialized for builders; it is shown here because the operator sees all evidence.
        </div>
      )}
      <details className="panel evidence-details" open>
        <summary>Complete raw artifact</summary>
        <pre className="evidence-json">{JSON.stringify(stored.artifact, null, 2)}</pre>
      </details>
    </>
  );
}
