import type { ArchitecturePlan } from "../foundry/architecturePlan.js";
import type { ArchitecturePlanDecision } from "../foundry/architecturePlanDecision.js";
import type { CapabilityPlan } from "../foundry/capabilityPlan.js";
import type { CapabilityPlanDecision } from "../foundry/capabilityPlanDecision.js";
import type {
  FoundryArtifactStore,
  FoundryStoredArtifact,
} from "../foundry/foundryArtifactStore.js";
import type { IntakeTurnRecord } from "../foundry/intakeTurn.js";
import type { ProjectBrief } from "../foundry/projectBrief.js";
import type { ProjectBriefDecision } from "../foundry/projectBriefDecision.js";
import type {
  SliceSubmission,
  SubmissionDecision,
} from "../foundry/sliceSubmission.js";
import type { TestSuite } from "../foundry/testSuite.js";
import type { TestSuiteDecision } from "../foundry/testSuiteDecision.js";
import type { WorkOrder } from "../foundry/workOrder.js";

export type FoundryStageStatus =
  | "draft"
  | "approved"
  | "rejected"
  | "revision-requested";

export type FoundrySliceStatus =
  | "not-started"
  | "ordered"
  | "submitted-passed"
  | "submitted-failed"
  | "approved"
  | "rejected"
  | "revision-requested";

export interface FoundryDecisionView {
  decisionId: string;
  decision: "approve" | "reject" | "revise";
  operatorId: string;
  rationale: string;
  requestedRevisions: string[] | null;
  decidedAt: string;
}

export interface FoundryBriefVersionView {
  version: number;
  artifactId: string;
  title: string;
  createdAt: string;
  status: FoundryStageStatus;
  openQuestions: { id: string; question: string }[];
  decisions: FoundryDecisionView[];
}

export interface FoundryPlanView {
  planId: string;
  createdAt: string;
  status: FoundryStageStatus;
  componentCount: number;
  sliceCount: number;
  blockingConcerns: number;
  advisoryConcerns: number;
  decisions: FoundryDecisionView[];
  revisedFromArtifactId?: string;
}

export interface FoundryCapabilityPlanView {
  capabilityPlanId: string;
  planId: string;
  createdAt: string;
  status: FoundryStageStatus;
  needCount: number;
  proposedCapabilityCount: number;
  blockingConcerns: number;
  advisoryConcerns: number;
  decisions: FoundryDecisionView[];
  revisedFromArtifactId?: string;
}

export interface FoundryTestFileView {
  path: string;
  visibility: "visible" | "holdout";
  testType: string;
  coveredCriterionIds: string[];
}

export interface FoundryTestSuiteView {
  testSuiteId: string;
  planId: string;
  capabilityPlanId: string;
  createdAt: string;
  status: FoundryStageStatus;
  interfaceContract: string;
  files: FoundryTestFileView[];
  decisions: FoundryDecisionView[];
  revisedFromArtifactId?: string;
}

export interface FoundrySubmissionView {
  submissionId: string;
  createdAt: string;
  status: "passed" | "failed";
  scopeCheck: { passed: boolean; failures: string[] };
  files: {
    path: string;
    visibility: "visible" | "holdout";
    exitCode: number;
    passed: boolean;
  }[];
  outputExcerpt: string;
  decisions: FoundryDecisionView[];
}

export interface FoundrySliceRow {
  sliceId: string;
  title: string;
  delivers: string;
  dependsOnSliceIds: string[];
  status: FoundrySliceStatus;
  workOrders: {
    workOrderId: string;
    createdAt: string;
    applicableTestFilePaths: string[];
  }[];
  submissions: FoundrySubmissionView[];
}

export interface FoundryBuildView {
  anchorTestSuiteId: string;
  anchorPlanId: string;
  planAvailable: boolean;
  approvedSliceCount: number;
  slices: FoundrySliceRow[];
}

export interface FoundryChainView {
  briefId: string;
  title: string;
  latestVersion: number;
  status: FoundryStageStatus;
  latestActivityAt: string;
  intakeTurnCount: number;
  // Questions the interview is currently waiting on, keyed by the ids the
  // intake controller validates answers against (the latest turn record's
  // nextQuestions — NOT the brief's openQuestions, which live in a
  // different id space). Empty when the interview is not awaiting answers.
  intakeQuestions: { id: string; question: string }[];
  briefVersions: FoundryBriefVersionView[];
  plans: FoundryPlanView[];
  capabilityPlans: FoundryCapabilityPlanView[];
  testSuites: FoundryTestSuiteView[];
  build: FoundryBuildView | null;
  buildNote?: string;
}

export interface FoundryProjectSummary {
  briefId: string;
  title: string;
  latestVersion: number;
  status: FoundryStageStatus;
  latestActivityAt: string;
  stages: {
    plan: FoundryStageStatus | "missing";
    capability: FoundryStageStatus | "missing";
    tests: FoundryStageStatus | "missing";
    build: { approved: number; total: number } | null;
  };
}

export interface FoundryProjectIndex {
  projects: FoundryProjectSummary[];
  rejected: { path: string; reason: string }[];
}

interface ChainBuckets {
  briefs: { artifactId: string; artifact: ProjectBrief }[];
  briefDecisions: ProjectBriefDecision[];
  plans: ArchitecturePlan[];
  planDecisions: ArchitecturePlanDecision[];
  capabilityPlans: CapabilityPlan[];
  capabilityDecisions: CapabilityPlanDecision[];
  testSuites: TestSuite[];
  suiteDecisions: TestSuiteDecision[];
  workOrders: WorkOrder[];
  submissions: SliceSubmission[];
  submissionDecisions: SubmissionDecision[];
  intakeTurns: IntakeTurnRecord[];
  latestActivityAt: string;
}

// Newest decision first; decisionId is a stable tie-break so equal timestamps
// stay deterministic. Mirrors the ordering used by the foundry services.
function sortDecisionsDesc<T extends { decidedAt: string; decisionId: string }>(
  decisions: T[],
): T[] {
  return [...decisions].sort(
    (left, right) =>
      right.decidedAt.localeCompare(left.decidedAt) ||
      right.decisionId.localeCompare(left.decisionId),
  );
}

// Latest-decision-wins, mirroring derivePlanStatus / deriveCapabilityPlanStatus
// / deriveTestSuiteStatus / deriveBriefStatus in the foundry services.
function statusFromDecisions(
  decisions: { decidedAt: string; decisionId: string; decision: string }[],
): FoundryStageStatus {
  const latest = sortDecisionsDesc(
    decisions as { decidedAt: string; decisionId: string; decision: string }[],
  )[0];
  if (!latest) return "draft";
  if (latest.decision === "approve") return "approved";
  if (latest.decision === "reject") return "rejected";
  return "revision-requested";
}

function decisionViews(
  decisions: {
    decisionId: string;
    decision: "approve" | "reject" | "revise";
    operatorId: string;
    rationale: string;
    requestedRevisions: string[] | null;
    decidedAt: string;
  }[],
): FoundryDecisionView[] {
  return sortDecisionsDesc(decisions).map((decision) => ({
    decisionId: decision.decisionId,
    decision: decision.decision,
    operatorId: decision.operatorId,
    rationale: decision.rationale,
    requestedRevisions: decision.requestedRevisions,
    decidedAt: decision.decidedAt,
  }));
}

async function collectChainBuckets(
  store: FoundryArtifactStore,
  briefId: string,
): Promise<ChainBuckets | null> {
  // One list + load-everything bucket join. References are resolved only
  // within the bucket, so dangling ids render as stubs instead of throwing.
  // The 500-artifact cap silently truncates extraordinarily large chains.
  const { artifacts } = await store.list({ briefId, limit: 500 });
  if (!artifacts.some(({ kind }) => kind === "project-brief")) return null;

  const loaded = await Promise.all(
    artifacts.map(async (summary) => ({
      summary,
      stored: await store.load(summary.id),
    })),
  );

  const buckets: ChainBuckets = {
    briefs: [],
    briefDecisions: [],
    plans: [],
    planDecisions: [],
    capabilityPlans: [],
    capabilityDecisions: [],
    testSuites: [],
    suiteDecisions: [],
    workOrders: [],
    submissions: [],
    submissionDecisions: [],
    intakeTurns: [],
    latestActivityAt: "",
  };

  for (const { summary, stored } of loaded) {
    if (summary.createdAt.localeCompare(buckets.latestActivityAt) > 0) {
      buckets.latestActivityAt = summary.createdAt;
    }
    const entry: FoundryStoredArtifact = stored;
    switch (entry.kind) {
      case "project-brief":
        buckets.briefs.push({ artifactId: summary.id, artifact: entry.artifact });
        break;
      case "project-brief-decision":
        buckets.briefDecisions.push(entry.artifact);
        break;
      case "architecture-plan":
        buckets.plans.push(entry.artifact);
        break;
      case "architecture-plan-decision":
        buckets.planDecisions.push(entry.artifact);
        break;
      case "capability-plan":
        buckets.capabilityPlans.push(entry.artifact);
        break;
      case "capability-plan-decision":
        buckets.capabilityDecisions.push(entry.artifact);
        break;
      case "test-suite":
        buckets.testSuites.push(entry.artifact);
        break;
      case "test-suite-decision":
        buckets.suiteDecisions.push(entry.artifact);
        break;
      case "work-order":
        buckets.workOrders.push(entry.artifact);
        break;
      case "slice-submission":
        buckets.submissions.push(entry.artifact);
        break;
      case "submission-decision":
        buckets.submissionDecisions.push(entry.artifact);
        break;
      case "intake-turn":
        buckets.intakeTurns.push(entry.artifact);
        break;
      default:
        break;
    }
  }
  return buckets;
}

function newestFirst<T extends { createdAt: string }>(items: T[]): T[] {
  return [...items].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
}

function buildViewFromBuckets(
  briefId: string,
  buckets: ChainBuckets,
): FoundryChainView {
  const briefVersions = [...buckets.briefs]
    .sort((left, right) => left.artifact.version - right.artifact.version)
    .map(({ artifactId, artifact }) => {
      const decisions = buckets.briefDecisions.filter(
        (decision) => decision.briefVersion === artifact.version,
      );
      return {
        version: artifact.version,
        artifactId,
        title: artifact.title,
        createdAt: artifact.createdAt,
        status: statusFromDecisions(decisions),
        openQuestions: artifact.openQuestions.map(({ id, question }) => ({
          id,
          question,
        })),
        decisions: decisionViews(decisions),
      };
    });
  const latestBrief = briefVersions[briefVersions.length - 1];
  if (!latestBrief) {
    throw new Error(`No project brief found for ${briefId}.`);
  }

  const plans = newestFirst(buckets.plans).map((plan) => {
    const decisions = buckets.planDecisions.filter(
      (decision) => decision.planId === plan.planId,
    );
    return {
      planId: plan.planId,
      createdAt: plan.createdAt,
      status: statusFromDecisions(decisions),
      componentCount: plan.content.components.length,
      sliceCount: plan.content.implementationSlices.length,
      blockingConcerns: plan.content.concerns.filter(
        ({ severity }) => severity === "blocking",
      ).length,
      advisoryConcerns: plan.content.concerns.filter(
        ({ severity }) => severity === "advisory",
      ).length,
      decisions: decisionViews(decisions),
      ...(plan.revisedFromArtifactId
        ? { revisedFromArtifactId: plan.revisedFromArtifactId }
        : {}),
    };
  });

  const capabilityPlans = newestFirst(buckets.capabilityPlans).map((plan) => {
    const decisions = buckets.capabilityDecisions.filter(
      (decision) => decision.capabilityPlanId === plan.capabilityPlanId,
    );
    return {
      capabilityPlanId: plan.capabilityPlanId,
      planId: plan.planId,
      createdAt: plan.createdAt,
      status: statusFromDecisions(decisions),
      needCount: plan.content.needs.length,
      proposedCapabilityCount: plan.content.proposedCapabilities.length,
      blockingConcerns: plan.content.concerns.filter(
        ({ severity }) => severity === "blocking",
      ).length,
      advisoryConcerns: plan.content.concerns.filter(
        ({ severity }) => severity === "advisory",
      ).length,
      decisions: decisionViews(decisions),
      ...(plan.revisedFromArtifactId
        ? { revisedFromArtifactId: plan.revisedFromArtifactId }
        : {}),
    };
  });

  const testSuites = newestFirst(buckets.testSuites).map((suite) => {
    const decisions = buckets.suiteDecisions.filter(
      (decision) => decision.testSuiteId === suite.testSuiteId,
    );
    return {
      testSuiteId: suite.testSuiteId,
      planId: suite.planId,
      capabilityPlanId: suite.capabilityPlanId,
      createdAt: suite.createdAt,
      status: statusFromDecisions(decisions),
      interfaceContract: suite.content.interfaceContract,
      // File content is deliberately omitted: the chain view stays light and
      // paste-safe; full content (including holdouts) lives on the raw
      // artifact page.
      files: suite.content.testFiles.map((file) => ({
        path: file.path,
        visibility: file.visibility,
        testType: file.testType,
        coveredCriterionIds: file.coveredCriterionIds,
      })),
      decisions: decisionViews(decisions),
      ...(suite.revisedFromArtifactId
        ? { revisedFromArtifactId: suite.revisedFromArtifactId }
        : {}),
    };
  });

  const { build, buildNote } = buildSection(buckets, testSuites);

  // Answers are validated against the questions the interview last asked;
  // after a model failure the controller falls back to the last successful
  // turn, so the view mirrors that (IntakeSessionController.runTurn).
  const turnsAscending = [...buckets.intakeTurns].sort(
    (left, right) => left.turnNumber - right.turnNumber,
  );
  const latestTurn = turnsAscending[turnsAscending.length - 1];
  const questionSource =
    latestTurn?.status === "model-failure"
      ? [...turnsAscending]
          .reverse()
          .find(({ status }) => status === "awaiting-answers")
      : latestTurn;
  const intakeQuestions =
    questionSource?.status === "awaiting-answers"
      ? questionSource.nextQuestions.map(({ id, question }) => ({
          id,
          question,
        }))
      : [];

  return {
    briefId,
    title: latestBrief.title,
    latestVersion: latestBrief.version,
    status: latestBrief.status,
    latestActivityAt: buckets.latestActivityAt,
    intakeTurnCount: buckets.intakeTurns.length,
    intakeQuestions,
    briefVersions,
    plans,
    capabilityPlans,
    testSuites,
    build,
    ...(buildNote ? { buildNote } : {}),
  };
}

function buildSection(
  buckets: ChainBuckets,
  testSuites: FoundryTestSuiteView[],
): { build: FoundryBuildView | null; buildNote?: string } {
  const approvedSuite = testSuites.find(({ status }) => status === "approved");
  if (!approvedSuite) {
    return { build: null, buildNote: "No approved test suite yet." };
  }

  const anchorPlan = buckets.plans.find(
    (plan) => plan.planId === approvedSuite.planId,
  );
  if (!anchorPlan) {
    return {
      build: {
        anchorTestSuiteId: approvedSuite.testSuiteId,
        anchorPlanId: approvedSuite.planId,
        planAvailable: false,
        approvedSliceCount: 0,
        slices: [],
      },
      buildNote:
        "The approved suite references a plan that is not in the store.",
    };
  }

  const suiteWorkOrders = buckets.workOrders.filter(
    (workOrder) => workOrder.testSuiteId === approvedSuite.testSuiteId,
  );
  const suiteSubmissions = buckets.submissions.filter(
    (submission) => submission.testSuiteId === approvedSuite.testSuiteId,
  );
  const suiteSubmissionDecisions = buckets.submissionDecisions.filter(
    (decision) => decision.testSuiteId === approvedSuite.testSuiteId,
  );

  const slices = anchorPlan.content.implementationSlices.map((slice) => {
    const workOrders = newestFirst(
      suiteWorkOrders.filter(({ sliceId }) => sliceId === slice.id),
    ).map((workOrder) => ({
      workOrderId: workOrder.workOrderId,
      createdAt: workOrder.createdAt,
      applicableTestFilePaths: workOrder.applicableTestFilePaths,
    }));

    const submissions = newestFirst(
      suiteSubmissions.filter(({ sliceId }) => sliceId === slice.id),
    ).map((submission) => {
      const decisions = suiteSubmissionDecisions.filter(
        (decision) => decision.submissionId === submission.submissionId,
      );
      return {
        submissionId: submission.submissionId,
        createdAt: submission.createdAt,
        status: submission.status,
        scopeCheck: submission.scopeCheck,
        files: submission.testRun.files,
        outputExcerpt: submission.testRun.outputExcerpt,
        decisions: decisionViews(decisions),
      };
    });

    const sliceDecisions = suiteSubmissionDecisions.filter(
      (decision) => decision.sliceId === slice.id,
    );
    return {
      sliceId: slice.id,
      title: slice.title,
      delivers: slice.delivers,
      dependsOnSliceIds: slice.dependsOnSliceIds,
      status: sliceStatus(sliceDecisions, submissions, workOrders.length > 0),
      workOrders,
      submissions,
    };
  });

  return {
    build: {
      anchorTestSuiteId: approvedSuite.testSuiteId,
      anchorPlanId: anchorPlan.planId,
      planAvailable: true,
      approvedSliceCount: slices.filter(({ status }) => status === "approved")
        .length,
      slices,
    },
  };
}

// Mirrors WorkOrderService.#approvedSliceIds: ANY approve decision for the
// (suite, slice) pair marks the slice approved, regardless of later
// decisions on other submissions of the same slice.
function sliceStatus(
  decisions: SubmissionDecision[],
  submissions: { status: "passed" | "failed" }[],
  hasWorkOrder: boolean,
): FoundrySliceStatus {
  if (decisions.some(({ decision }) => decision === "approve")) {
    return "approved";
  }
  const latestDecision = sortDecisionsDesc(decisions)[0];
  if (latestDecision) {
    return latestDecision.decision === "reject"
      ? "rejected"
      : "revision-requested";
  }
  const latestSubmission = submissions[0];
  if (latestSubmission) {
    return latestSubmission.status === "passed"
      ? "submitted-passed"
      : "submitted-failed";
  }
  return hasWorkOrder ? "ordered" : "not-started";
}

export async function buildFoundryChainView(
  store: FoundryArtifactStore,
  briefId: string,
): Promise<FoundryChainView | null> {
  const buckets = await collectChainBuckets(store, briefId);
  if (!buckets) return null;
  return buildViewFromBuckets(briefId, buckets);
}

export async function buildFoundryProjectIndex(
  store: FoundryArtifactStore,
): Promise<FoundryProjectIndex> {
  const { artifacts, rejected } = await store.list({
    kind: "project-brief",
    limit: 500,
  });
  const briefIds = [...new Set(artifacts.map(({ briefId }) => briefId))];

  const projects: FoundryProjectSummary[] = [];
  for (const briefId of briefIds) {
    const chain = await buildFoundryChainView(store, briefId);
    if (!chain) continue;
    projects.push({
      briefId: chain.briefId,
      title: chain.title,
      latestVersion: chain.latestVersion,
      status: chain.status,
      latestActivityAt: chain.latestActivityAt,
      stages: {
        plan: chain.plans[0]?.status ?? "missing",
        capability: chain.capabilityPlans[0]?.status ?? "missing",
        tests: chain.testSuites[0]?.status ?? "missing",
        build: chain.build
          ? {
              approved: chain.build.approvedSliceCount,
              total: chain.build.slices.length,
            }
          : null,
      },
    });
  }
  projects.sort((left, right) =>
    right.latestActivityAt.localeCompare(left.latestActivityAt),
  );
  // rejected[] is store-wide, not per-brief; surfaced here once on the index.
  return { projects, rejected };
}
