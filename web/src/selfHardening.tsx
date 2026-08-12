import type {
  SelfHardeningComparisonView,
  SelfHardeningCycleView,
  SelfHardeningIndex,
  SelfHardeningSignalView,
} from "./api.js";
import {
  EmptyState,
  ErrorNotice,
  Loading,
  PageHeader,
  RawDrawer,
  StatusBadge,
  Stepper,
  type StepperStep,
} from "./components.js";
import { useResource } from "./hooks.js";
import { LocalLink as Link, usePathname } from "./router.js";

function agentLabel(agentId: string, agentVersion: string): string {
  return `${agentId}@${agentVersion}`;
}

const DECISION_VERB: Record<SelfHardeningCycleView["decision"], string> = {
  approve: "Approved",
  reject: "Rejected",
  revise: "Revision requested",
};

function proposalStatus(signal: SelfHardeningSignalView | null): StepperStep["status"] {
  if (!signal) return "neutral";
  if (signal.policyValid === true) return "pass";
  if (signal.policyValid === false) return "fail";
  return "warn";
}

function decisionStatus(decision: SelfHardeningCycleView["decision"]): StepperStep["status"] {
  if (decision === "approve") return "pass";
  if (decision === "reject") return "fail";
  return "warn";
}

function ProposalDetail({ signal }: { signal: SelfHardeningSignalView }) {
  return (
    <>
      <dl className="cycle-facts">
        <div><dt>Disposition</dt><dd>{signal.disposition ?? "—"}</dd></div>
        <div><dt>Recommendations</dt><dd>{signal.recommendationCount}</dd></div>
        <div><dt>Candidate policy patch</dt><dd>{signal.hasPolicyPatch ? "present" : "none"}</dd></div>
        <div><dt>Citation / policy check</dt><dd>{signal.policyValid === null ? "—" : signal.policyValid ? "valid" : "invalid"}</dd></div>
      </dl>
      <Link className="cycle-link" to={`/runs/${signal.proposalArtifactId}`}>Open the full proposal →</Link>
    </>
  );
}

function ComparisonDetail({ comparison }: { comparison: SelfHardeningComparisonView }) {
  return (
    <>
      <div className="cycle-counts">
        <span className="count-improved">{comparison.improvedCases} improved</span>
        <span className="count-regressed">{comparison.regressedCases} regressed</span>
        <span className="count-muted">{comparison.unchangedCases} unchanged</span>
        {comparison.insufficientEvidenceCases > 0 ? (
          <span className="count-muted">{comparison.insufficientEvidenceCases} insufficient</span>
        ) : null}
      </div>
      <ul className="gate-list">
        {comparison.gates.map((gate) => (
          <li key={gate.gateId}>
            <StatusBadge value={gate.status} />
            <span className="gate-name">{gate.gateId}</span>
            <span className="gate-message">{gate.message}</span>
          </li>
        ))}
      </ul>
      <Link className="cycle-link" to={`/runs/${comparison.candidateEvaluationArtifactId}`}>
        Open the gated comparison →
      </Link>
    </>
  );
}

function cycleSteps(cycle: SelfHardeningCycleView): StepperStep[] {
  return [
    {
      key: "proposal",
      title: "Analyst proposal",
      status: proposalStatus(cycle.signal),
      summary: cycle.signal
        ? `${cycle.signal.disposition ?? "proposal"} · analyzed on ${cycle.signal.model} at ${cycle.signal.repetitions}× reps`
        : "The linked proposal artifact is unavailable.",
      detail: cycle.signal ? <ProposalDetail signal={cycle.signal} /> : undefined,
    },
    {
      key: "comparison",
      title: "Gated comparison",
      status: cycle.comparison ? (cycle.comparison.gatesPassed ? "pass" : "fail") : "neutral",
      summary: cycle.comparison
        ? `${cycle.comparison.improvedCases} improved · ${cycle.comparison.regressedCases} regressed — promotion gates ${cycle.comparison.gatesPassed ? "passed" : "failed"}`
        : "The linked candidate evaluation is unavailable.",
      detail: cycle.comparison ? <ComparisonDetail comparison={cycle.comparison} /> : undefined,
    },
    {
      key: "decision",
      title: "Operator decision",
      status: decisionStatus(cycle.decision),
      summary: `${DECISION_VERB[cycle.decision]} by ${cycle.operatorId}`,
      detail: (
        <>
          <p className="cycle-rationale">{cycle.rationale}</p>
          {cycle.released ? (
            <div className="cycle-release">
              <span className="eyebrow">Released — source-controlled agent update</span>
              {cycle.releaseActions.length > 0 ? (
                <ol className="cycle-actions">
                  {cycle.releaseActions.map((action) => <li key={action}>{action}</li>)}
                </ol>
              ) : null}
            </div>
          ) : null}
        </>
      ),
    },
  ];
}

export function SelfHardeningListPage() {
  const resource = useResource<SelfHardeningIndex>("/api/self-hardening");
  if (resource.loading) return <Loading />;
  if (resource.error) return <ErrorNotice message={resource.error} />;
  const cycles = resource.data?.cycles ?? [];

  return (
    <>
      <PageHeader eyebrow="The platform improving itself" title="Self-hardening" />
      <p className="lede">
        Every time the improvement loop turned a located weakness into a candidate fix, gated it
        against the baseline, and the operator disposed of it. Nothing is promoted without passing
        the gates and an explicit decision.
      </p>
      {cycles.length === 0 ? (
        <EmptyState>
          No self-hardening cycles recorded yet. Run <code>npm run auto-improve &lt;agent&gt;</code>{" "}
          to produce a candidate, then approve or reject it.
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Agent</th>
                <th>Decision</th>
                <th>Gates</th>
                <th>Outcome</th>
                <th>Decided</th>
              </tr>
            </thead>
            <tbody>
              {cycles.map((cycle) => (
                <tr key={cycle.decisionId}>
                  <td>
                    <Link to={`/self-hardening/${cycle.decisionId}`}>
                      {agentLabel(cycle.subjectAgentId, cycle.subjectAgentVersion)}
                    </Link>
                  </td>
                  <td><StatusBadge value={cycle.decision} /></td>
                  <td>{cycle.gatesPassed ? "passed" : "failed"}</td>
                  <td>{cycle.released ? <span className="status status-approved">released</span> : "held"}</td>
                  <td>{new Date(cycle.decidedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export function SelfHardeningDetailPage() {
  const decisionId = usePathname().split("/")[2];
  const resource = useResource<SelfHardeningCycleView>(
    decisionId ? `/api/self-hardening/${decisionId}` : null,
  );
  if (resource.loading) return <Loading />;
  if (resource.error || !resource.data) {
    return <ErrorNotice message={resource.error ?? "Cycle not found"} />;
  }
  const cycle = resource.data;

  return (
    <>
      <PageHeader
        eyebrow={agentLabel(cycle.subjectAgentId, cycle.subjectAgentVersion)}
        title="Self-hardening cycle"
      >
        <StatusBadge value={cycle.decision} />
      </PageHeader>
      <p className="lede">
        A located weakness became a candidate fix, was gated against the baseline, and the operator
        {" "}
        {cycle.decision === "approve"
          ? "approved and released it"
          : cycle.decision === "revise"
            ? "sent it back for revision"
            : "rejected it"}
        . The gates — not plausibility — decided whether it could ship.
      </p>

      <Stepper steps={cycleSteps(cycle)} />

      <RawDrawer label="Raw cycle view" value={cycle} />
    </>
  );
}
