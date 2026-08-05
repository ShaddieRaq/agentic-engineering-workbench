import {
  type FoundryChainView,
  type FoundryDecisionView,
  type FoundryProjectIndex,
  type FoundryStoredArtifact,
  type FoundrySubmissionView,
} from "./api.js";
import { EmptyState, ErrorNotice, Loading, PageHeader, StatusBadge } from "./components.js";
import { useResource } from "./hooks.js";
import { LocalLink as Link, usePathname } from "./router.js";

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
    </>
  );
}

function SubmissionDetails({ submission }: { submission: FoundrySubmissionView }) {
  return (
    <div className="submission-block">
      <div className="section-heading">
        <h4>Submission {shortId(submission.submissionId)} · {when(submission.createdAt)}</h4>
        <StatusBadge value={submission.status} />
      </div>
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
      <Link to={`/foundry/artifacts/${submission.submissionId}`}>Raw submission evidence →</Link>
    </div>
  );
}

export function FoundryProjectPage() {
  const briefId = usePathname().split("/")[2];
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

      <section className="foundry-stage">
        <div className="section-heading"><div><span className="eyebrow">Stage 1</span><h2>Project brief</h2></div></div>
        {chain.briefVersions.map((version) => (
          <div className="panel foundry-panel" key={version.artifactId}>
            <div className="section-heading">
              <h3>Version {version.version} · {when(version.createdAt)}</h3>
              <StatusBadge value={version.status} />
            </div>
            <DecisionList decisions={version.decisions} />
            <Link to={`/foundry/artifacts/${version.artifactId}`}>Raw brief →</Link>
          </div>
        ))}
      </section>

      <section className="foundry-stage">
        <div className="section-heading"><div><span className="eyebrow">Stage 2</span><h2>Architecture plans</h2></div></div>
        {!chain.plans.length && <EmptyState>No architecture plan yet.</EmptyState>}
        {chain.plans.map((plan) => (
          <div className="panel foundry-panel" key={plan.planId}>
            <div className="section-heading">
              <h3>Plan {shortId(plan.planId)} · {when(plan.createdAt)}</h3>
              <StatusBadge value={plan.status} />
            </div>
            <p className="muted-note">
              {plan.componentCount} component(s) · {plan.sliceCount} slice(s) · {plan.blockingConcerns} blocking / {plan.advisoryConcerns} advisory concern(s)
              {plan.revisedFromArtifactId && <> · revision of {shortId(plan.revisedFromArtifactId)}</>}
            </p>
            <DecisionList decisions={plan.decisions} />
            <Link to={`/foundry/artifacts/${plan.planId}`}>Raw plan →</Link>
          </div>
        ))}
      </section>

      <section className="foundry-stage">
        <div className="section-heading"><div><span className="eyebrow">Stage 3</span><h2>Capability plans</h2></div></div>
        {!chain.capabilityPlans.length && <EmptyState>No capability plan yet.</EmptyState>}
        {chain.capabilityPlans.map((plan) => (
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
            <Link to={`/foundry/artifacts/${plan.capabilityPlanId}`}>Raw capability plan →</Link>
          </div>
        ))}
      </section>

      <section className="foundry-stage">
        <div className="section-heading"><div><span className="eyebrow">Stage 4</span><h2>Acceptance test suites</h2></div></div>
        {!chain.testSuites.length && <EmptyState>No test suite yet.</EmptyState>}
        {chain.testSuites.map((suite) => (
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
            <Link to={`/foundry/artifacts/${suite.testSuiteId}`}>Raw suite (includes holdout content) →</Link>
          </div>
        ))}
      </section>

      <section className="foundry-stage">
        <div className="section-heading"><div><span className="eyebrow">Stage 5</span><h2>Governed build</h2></div></div>
        {chain.buildNote && <div className="notice">{chain.buildNote}</div>}
        {chain.build && chain.build.planAvailable && (
          <>
            <p className="muted-note">
              Anchored on approved suite {shortId(chain.build.anchorTestSuiteId)} · {chain.build.approvedSliceCount}/{chain.build.slices.length} slices approved
            </p>
            {chain.build.slices.map((slice, index) => (
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
                {slice.submissions.map((submission) => (
                  <SubmissionDetails submission={submission} key={submission.submissionId} />
                ))}
              </div>
            ))}
          </>
        )}
      </section>
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
