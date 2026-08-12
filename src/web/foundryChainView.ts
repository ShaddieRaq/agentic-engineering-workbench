import type { ArchitecturePlan } from "../foundry/architecturePlan.js";
import type { ArchitecturePlanDecision } from "../foundry/architecturePlanDecision.js";
import type { CapabilityPlan } from "../foundry/capabilityPlan.js";
import type { CapabilityPlanDecision } from "../foundry/capabilityPlanDecision.js";
import type {
  FoundryArtifactStore,
  FoundryStoredArtifact,
} from "../foundry/foundryArtifactStore.js";
import type { BuildCompletion } from "../foundry/buildCompletion.js";
import type {
  BuilderNote,
  BuilderQuestion,
  OperatorAnswer,
} from "../foundry/builderMessage.js";
import type { FieldReport } from "../foundry/fieldReport.js";
import type { IntakeTurnRecord } from "../foundry/intakeTurn.js";
import type { ProjectBrief } from "../foundry/projectBrief.js";
import type { ProjectBriefDecision } from "../foundry/projectBriefDecision.js";
import { collectStandingAdvisories } from "../foundry/standingAdvisories.js";
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
  | "carried"
  | "ordered"
  | "submitted-passed"
  | "submitted-failed"
  | "approved"
  | "rejected"
  | "revision-requested";

export interface FoundryDecisionView {
  decisionId: string;
  decision: "approve" | "reject" | "revise" | "reopen";
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
  // The acceptance criteria carried across the view-model boundary: each one
  // gates every downstream stage, and its `source` provenance (user-stated /
  // agent-inferred / unresolved) is the guarantee that a vague answer was
  // never silently promoted to a fact. Rendered as scannable cards, not JSON.
  acceptanceCriteria: {
    id: string;
    text: string;
    source: "user-stated" | "agent-inferred" | "unresolved";
    verification: string;
  }[];
  openQuestions: { id: string; question: string }[];
  decisions: FoundryDecisionView[];
  // Criterion delta vs the previous version (Decision 088: the operator
  // judges criterion rewrites at approval, where the diff is displayed).
  criterionChanges?: {
    added: string[];
    changed: string[];
    retired: string[];
  };
}

export interface FoundryPlanView {
  planId: string;
  briefVersion: number;
  createdAt: string;
  status: FoundryStageStatus;
  componentCount: number;
  sliceCount: number;
  // Acceptance-mapping test types by count (e.g. {integration: 7}). The
  // all-manual defect slipped past operator approval twice because the
  // summary hid this; "manual" here is a red flag the panel must show.
  mappingTestTypes: Record<string, number>;
  blockingConcerns: number;
  advisoryConcerns: number;
  // Slice contents for the decision panel (field-trial verdict: operators
  // approved plans without ever seeing what the slices contain).
  slices: {
    sliceId: string;
    title: string;
    delivers: string;
    dependsOnSliceIds: string[];
    verifiedByCriterionIds: string[];
    disposition: "carried" | "delta" | null;
  }[];
  decisions: FoundryDecisionView[];
  revisedFromArtifactId?: string;
  // Present on evolution plans; re-runs must carry it (Decision 088).
  evolvesFromCompletionId?: string;
  carriedSliceCount?: number;
}

export interface FoundryCapabilityPlanView {
  capabilityPlanId: string;
  planId: string;
  briefVersion: number;
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
  briefVersion: number;
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
  // Builder-authored, unverified (Decision 090). Rendered labeled as such;
  // never part of gate evaluation.
  builderReport: string | null;
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
  // Builder speech (Decision 090), oldest first so it reads as a timeline.
  builderNotes: { noteId: string; note: string; createdAt: string }[];
  builderQuestions: {
    questionId: string;
    question: string;
    createdAt: string;
    answer: {
      operatorId: string;
      answer: string;
      answeredAt: string;
    } | null;
  }[];
}

export interface FoundryBuildView {
  anchorTestSuiteId: string;
  anchorPlanId: string;
  planAvailable: boolean;
  approvedSliceCount: number;
  // approved + carried (Decision 088): carried slices are satisfied by the
  // prior generation's completion, not by submissions.
  satisfiedSliceCount: number;
  // Builder questions with no operator answer yet (Decision 090); the
  // next-step ladder surfaces these ahead of everything else in the build.
  unansweredQuestionCount: number;
  slices: FoundrySliceRow[];
}

// The single server-computed answer to "what should the operator do now?"
// (console UX settlement, 2026-08-08). Exactly one state at a time; the
// client renders it, never derives it — divergence between banner and
// gates was a known failure class.
export interface FoundryNextStep {
  kind: "run" | "decide" | "answer" | "form" | "blocked" | "done";
  headline: string;
  detail: string;
  // Stage section the banner scrolls to for decide/answer/form kinds.
  anchor: "brief" | "plan" | "capability" | "tests" | "build" | null;
  // For run kinds the banner hosts the button; the server builds the
  // request so client and gates can never disagree.
  action: { label: string; endpoint: string; body: Record<string, unknown> } | null;
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
  // True whenever the controller would accept another turn — including
  // awaiting-answers turns that asked NO questions (observed live: the
  // model can stall with stale brief openQuestions and nothing to ask, and
  // the operator needs the context box to instruct it).
  intakeCanContinue: boolean;
  briefVersions: FoundryBriefVersionView[];
  plans: FoundryPlanView[];
  capabilityPlans: FoundryCapabilityPlanView[];
  testSuites: FoundryTestSuiteView[];
  build: FoundryBuildView | null;
  buildNote?: string;
  // Advisory lifecycle: open edges from approved artifacts across all
  // generations — the system's own defect predictions, kept alive until a
  // criterion resolves them. Most-repeated first.
  standingAdvisories: {
    stage: "architect" | "capability" | "test-designer";
    description: string;
    firstRecordedAt: string;
    occurrences: number;
  }[];
  nextStep: FoundryNextStep;
  // Generation closures (Decision 088): operator-signed records that the
  // full suite passed against a pinned commit. Newest first.
  completions: {
    completionId: string;
    testSuiteId: string;
    briefVersion: number;
    mainCommitSha: string;
    treeDigest: string;
    builtSliceCount: number;
    recordedRetroactively: boolean;
    operatorId: string;
    createdAt: string;
    // Usage findings recorded against this generation (Decision 090),
    // newest first; injected into the next reopened interview.
    fieldReports: {
      fieldReportId: string;
      operatorId: string;
      report: string;
      createdAt: string;
    }[];
  }[];
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
  completions: BuildCompletion[];
  builderNotes: BuilderNote[];
  builderQuestions: BuilderQuestion[];
  operatorAnswers: OperatorAnswer[];
  fieldReports: FieldReport[];
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
  // A reopen (Decision 088) returns the stage to draft for a new round.
  if (latest.decision === "reopen") return "draft";
  return "revision-requested";
}

function decisionViews(
  decisions: {
    decisionId: string;
    decision: "approve" | "reject" | "revise" | "reopen";
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
    completions: [],
    builderNotes: [],
    builderQuestions: [],
    operatorAnswers: [],
    fieldReports: [],
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
      case "build-completion":
        buckets.completions.push(entry.artifact);
        break;
      case "builder-note":
        buckets.builderNotes.push(entry.artifact);
        break;
      case "builder-question":
        buckets.builderQuestions.push(entry.artifact);
        break;
      case "operator-answer":
        buckets.operatorAnswers.push(entry.artifact);
        break;
      case "field-report":
        buckets.fieldReports.push(entry.artifact);
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
  standingAdvisories: FoundryChainView["standingAdvisories"] = [],
): Omit<FoundryChainView, "nextStep"> {
  const sortedBriefs = [...buckets.briefs].sort(
    (left, right) => left.artifact.version - right.artifact.version,
  );
  const briefVersions = sortedBriefs.map(({ artifactId, artifact }, index) => {
    const decisions = buckets.briefDecisions.filter(
      (decision) => decision.briefVersion === artifact.version,
    );
    // Criterion delta vs the previous version, keyed by criterion text so
    // the operator can judge rewrites at the approval gate (Decision 088).
    const previous = sortedBriefs[index - 1]?.artifact;
    let criterionChanges:
      | { added: string[]; changed: string[]; retired: string[] }
      | undefined;
    if (previous) {
      const before = new Map(
        previous.acceptanceCriteria.map((criterion) => [
          criterion.id,
          criterion,
        ]),
      );
      const added: string[] = [];
      const changed: string[] = [];
      for (const criterion of artifact.acceptanceCriteria) {
        const prior = before.get(criterion.id);
        if (!prior) {
          added.push(criterion.text);
        } else if (
          prior.text !== criterion.text ||
          prior.verification !== criterion.verification
        ) {
          changed.push(criterion.text);
        }
      }
      const currentIds = new Set(
        artifact.acceptanceCriteria.map(({ id }) => id),
      );
      const retired = previous.acceptanceCriteria
        .filter(({ id }) => !currentIds.has(id))
        .map(({ text }) => text);
      if (added.length + changed.length + retired.length > 0) {
        criterionChanges = { added, changed, retired };
      }
    }
    return {
      version: artifact.version,
      artifactId,
      title: artifact.title,
      createdAt: artifact.createdAt,
      status: statusFromDecisions(decisions),
      acceptanceCriteria: artifact.acceptanceCriteria.map(
        ({ id, text, source, verification }) => ({
          id,
          text,
          source,
          verification,
        }),
      ),
      openQuestions: artifact.openQuestions.map(({ id, question }) => ({
        id,
        question,
      })),
      decisions: decisionViews(decisions),
      ...(criterionChanges ? { criterionChanges } : {}),
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
    const mappingTestTypes: Record<string, number> = {};
    for (const mapping of plan.content.acceptancePlan) {
      mappingTestTypes[mapping.testType] =
        (mappingTestTypes[mapping.testType] ?? 0) + 1;
    }
    const dispositionBySlice = new Map(
      (plan.sliceDispositions ?? []).map(({ sliceId, disposition }) => [
        sliceId,
        disposition,
      ]),
    );
    return {
      planId: plan.planId,
      briefVersion: plan.briefVersion,
      createdAt: plan.createdAt,
      status: statusFromDecisions(decisions),
      componentCount: plan.content.components.length,
      sliceCount: plan.content.implementationSlices.length,
      slices: plan.content.implementationSlices.map((slice) => ({
        sliceId: slice.id,
        title: slice.title,
        delivers: slice.delivers,
        dependsOnSliceIds: slice.dependsOnSliceIds,
        verifiedByCriterionIds: slice.verifiedByCriterionIds,
        disposition: dispositionBySlice.get(slice.id) ?? null,
      })),
      mappingTestTypes,
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
      ...(plan.evolvesFromCompletionId
        ? {
            evolvesFromCompletionId: plan.evolvesFromCompletionId,
            carriedSliceCount: (plan.sliceDispositions ?? []).filter(
              ({ disposition }) => disposition === "carried",
            ).length,
          }
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
      briefVersion: plan.briefVersion,
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
      briefVersion: suite.briefVersion,
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

  const completions = [...buckets.completions]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map((completion) => ({
      completionId: completion.completionId,
      testSuiteId: completion.testSuiteId,
      briefVersion: completion.briefVersion,
      mainCommitSha: completion.mainCommitSha,
      treeDigest: completion.treeDigest,
      builtSliceCount: completion.builtSliceIds.length,
      recordedRetroactively: completion.recordedRetroactively,
      operatorId: completion.operatorId,
      createdAt: completion.createdAt,
      fieldReports: [...buckets.fieldReports]
        .filter((report) => report.completionId === completion.completionId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .map(({ fieldReportId, operatorId, report, createdAt }) => ({
          fieldReportId,
          operatorId,
          report,
          createdAt,
        })),
    }));

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
  // Mirrors IntakeSessionController.runTurn's status guard, including the
  // reopen re-arm (Decision 088): a reopen on the latest version makes the
  // interview continuable even after a closed turn.
  const latestVersionDecisions = sortDecisionsDesc(
    buckets.briefDecisions.filter(
      (decision) => decision.briefVersion === latestBrief.version,
    ),
  );
  const reopened = latestVersionDecisions[0]?.decision === "reopen";
  const intakeCanContinue =
    latestTurn?.status === "awaiting-answers" ||
    latestTurn?.status === "model-failure" ||
    reopened;

  return {
    briefId,
    title: latestBrief.title,
    latestVersion: latestBrief.version,
    status: latestBrief.status,
    latestActivityAt: buckets.latestActivityAt,
    intakeTurnCount: buckets.intakeTurns.length,
    intakeQuestions,
    intakeCanContinue: Boolean(intakeCanContinue),
    standingAdvisories,
    briefVersions,
    plans,
    capabilityPlans,
    testSuites,
    build,
    completions,
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
        satisfiedSliceCount: 0,
        unansweredQuestionCount: 0,
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
  const suiteNotes = buckets.builderNotes.filter(
    (note) => note.testSuiteId === approvedSuite.testSuiteId,
  );
  const suiteQuestions = buckets.builderQuestions.filter(
    (question) => question.testSuiteId === approvedSuite.testSuiteId,
  );
  // Latest answer wins per question, mirroring latest-decision-wins.
  const answersByQuestion = new Map<string, OperatorAnswer>();
  for (const answer of buckets.operatorAnswers) {
    const existing = answersByQuestion.get(answer.questionId);
    if (!existing || answer.answeredAt.localeCompare(existing.answeredAt) > 0) {
      answersByQuestion.set(answer.questionId, answer);
    }
  }

  const carriedSliceIds = new Set(
    (anchorPlan.sliceDispositions ?? [])
      .filter(({ disposition }) => disposition === "carried")
      .map(({ sliceId }) => sliceId),
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
        builderReport: submission.builderReport ?? null,
        decisions: decisionViews(decisions),
      };
    });

    const builderNotes = [...suiteNotes]
      .filter((note) => note.sliceId === slice.id)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map(({ noteId, note, createdAt }) => ({ noteId, note, createdAt }));
    const builderQuestions = [...suiteQuestions]
      .filter((question) => question.sliceId === slice.id)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map((question) => {
        const answer = answersByQuestion.get(question.questionId);
        return {
          questionId: question.questionId,
          question: question.question,
          createdAt: question.createdAt,
          answer: answer
            ? {
                operatorId: answer.operatorId,
                answer: answer.answer,
                answeredAt: answer.answeredAt,
              }
            : null,
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
      status: carriedSliceIds.has(slice.id)
        ? ("carried" as const)
        : sliceStatus(sliceDecisions, submissions, workOrders.length > 0),
      workOrders,
      submissions,
      builderNotes,
      builderQuestions,
    };
  });

  return {
    build: {
      anchorTestSuiteId: approvedSuite.testSuiteId,
      anchorPlanId: anchorPlan.planId,
      planAvailable: true,
      approvedSliceCount: slices.filter(({ status }) => status === "approved")
        .length,
      satisfiedSliceCount: slices.filter(
        ({ status }) => status === "approved" || status === "carried",
      ).length,
      unansweredQuestionCount: slices
        .flatMap(({ builderQuestions }) => builderQuestions)
        .filter(({ answer }) => answer === null).length,
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


// Walks the chain's gate ladder generation-aware: each stage's current
// artifact is the one matching the LATEST brief version (older generations
// are history, not work). Exported for deterministic tests.
export function computeNextStep(
  view: Omit<FoundryChainView, "nextStep">,
): FoundryNextStep {
  const latest = view.briefVersions[view.briefVersions.length - 1];
  if (!latest) {
    return {
      kind: "blocked",
      headline: "No brief found",
      detail: "This chain has no brief versions in the store.",
      anchor: null,
      action: null,
    };
  }

  if (view.intakeCanContinue) {
    const count = view.intakeQuestions.length;
    return {
      kind: "answer",
      headline:
        count > 0
          ? `Answer ${count} open intake question(s)`
          : "Continue the interview",
      detail:
        count > 0
          ? "The interview cannot close until these are answered."
          : "The interview is waiting; use the context box to instruct it.",
      anchor: "brief",
      action: null,
    };
  }
  if (latest.status === "draft") {
    return {
      kind: "decide",
      headline: `Decide on brief v${latest.version}`,
      detail: "The interview is closed. Approve, reject, or revise.",
      anchor: "brief",
      action: null,
    };
  }
  if (latest.status !== "approved") {
    return {
      kind: "blocked",
      headline: `Brief v${latest.version} is ${latest.status}`,
      detail:
        "Record another decision on the brief, or start a new project.",
      anchor: "brief",
      action: null,
    };
  }

  // Brief approved. Evolution context: a completion older than the brief
  // means the next plan descends from it (Decision 088).
  const completion = view.completions[0];
  const evolveFrom =
    completion && view.latestVersion > completion.briefVersion
      ? completion.completionId
      : undefined;

  const plan = view.plans.find(
    ({ briefVersion }) => briefVersion === view.latestVersion,
  );
  if (!plan || plan.status === "rejected") {
    return {
      kind: "run",
      headline: evolveFrom
        ? "Generate the evolution plan"
        : plan
          ? "Generate a new architecture plan"
          : "Generate the architecture plan",
      detail: evolveFrom
        ? `Descends from completion ${completion!.completionId.slice(0, 8)}; built slices are carried byte-identical.`
        : "The architect maps the approved brief into components, slices, and acceptance mappings.",
      anchor: "plan",
      action: {
        label: evolveFrom ? "Generate evolution plan" : "Generate plan",
        endpoint: "/api/foundry/plans",
        body: {
          briefId: view.briefId,
          ...(evolveFrom ? { evolveFrom } : {}),
        },
      },
    };
  }
  if (plan.status === "draft") {
    return {
      kind: "decide",
      headline: `Decide on architecture plan ${plan.planId.slice(0, 8)}`,
      detail: `${plan.sliceCount} slice(s) · ${plan.blockingConcerns} blocking concern(s)${plan.mappingTestTypes["manual"] ? " · has MANUAL mappings" : ""}.`,
      anchor: "plan",
      action: null,
    };
  }
  if (plan.status === "revision-requested") {
    return {
      kind: "run",
      headline: "Re-run the architect with the requested revisions",
      detail: "The revise decision's requests feed the next run.",
      anchor: "plan",
      action: {
        label: "Re-run architect",
        endpoint: "/api/foundry/plans",
        body: {
          briefId: view.briefId,
          reviseFrom: plan.planId,
          ...(plan.evolvesFromCompletionId
            ? { evolveFrom: plan.evolvesFromCompletionId }
            : {}),
        },
      },
    };
  }

  const capability = view.capabilityPlans.find(
    ({ planId }) => planId === plan.planId,
  );
  if (!capability || capability.status === "rejected") {
    return {
      kind: "run",
      headline: "Generate the capability plan",
      detail: "Maps every slice's needs to project code, existing tools, or proposed capabilities.",
      anchor: "capability",
      action: {
        label: "Generate capability plan",
        endpoint: "/api/foundry/capability-plans",
        body: { planId: plan.planId },
      },
    };
  }
  if (capability.status === "draft") {
    return {
      kind: "decide",
      headline: `Decide on capability plan ${capability.capabilityPlanId.slice(0, 8)}`,
      detail: `${capability.needCount} need(s) · ${capability.blockingConcerns} blocking concern(s).`,
      anchor: "capability",
      action: null,
    };
  }
  if (capability.status === "revision-requested") {
    return {
      kind: "run",
      headline: "Re-run the capability planner with the requested revisions",
      detail: "The revise decision's requests feed the next run.",
      anchor: "capability",
      action: {
        label: "Re-run capability planner",
        endpoint: "/api/foundry/capability-plans",
        body: { planId: plan.planId, reviseFrom: capability.capabilityPlanId },
      },
    };
  }

  const suite = view.testSuites.find(
    ({ capabilityPlanId }) => capabilityPlanId === capability.capabilityPlanId,
  );
  if (!suite || suite.status === "rejected") {
    return {
      kind: "run",
      headline: "Design the acceptance tests",
      detail: "Executable tests plus a withheld holdout; the slow stage — allow a few minutes.",
      anchor: "tests",
      action: {
        label: "Design acceptance tests",
        endpoint: "/api/foundry/test-suites",
        body: { capabilityPlanId: capability.capabilityPlanId },
      },
    };
  }
  if (suite.status === "draft") {
    const holdouts = suite.files.filter(
      ({ visibility }) => visibility === "holdout",
    ).length;
    return {
      kind: "decide",
      headline: `Decide on test suite ${suite.testSuiteId.slice(0, 8)}`,
      detail: `${suite.files.length} file(s), ${holdouts} holdout(s).`,
      anchor: "tests",
      action: null,
    };
  }
  if (suite.status === "revision-requested") {
    return {
      kind: "run",
      headline: "Re-run the test designer with the requested revisions",
      detail: "The revise decision's requests feed the next run.",
      anchor: "tests",
      action: {
        label: "Re-run test designer",
        endpoint: "/api/foundry/test-suites",
        body: {
          capabilityPlanId: capability.capabilityPlanId,
          reviseFrom: suite.testSuiteId,
        },
      },
    };
  }

  // Suite approved: the governed build.
  const build = view.build;
  if (!build || !build.planAvailable) {
    return {
      kind: "blocked",
      headline: "Build state unavailable",
      detail: view.buildNote ?? "The build section could not be derived.",
      anchor: "build",
      action: null,
    };
  }
  // An explicit builder question outranks everything else in the build:
  // the builder said it is blocked, and only the operator can unblock it
  // (Decision 090).
  const askedSlice = build.slices.find(({ builderQuestions }) =>
    builderQuestions.some(({ answer }) => answer === null),
  );
  if (askedSlice) {
    const pending = askedSlice.builderQuestions.find(
      ({ answer }) => answer === null,
    )!;
    const excerpt =
      pending.question.length > 140
        ? `${pending.question.slice(0, 140)}…`
        : pending.question;
    return {
      kind: "answer",
      headline: `Answer the builder's question on "${askedSlice.title}"`,
      detail: excerpt,
      anchor: "build",
      action: null,
    };
  }
  const undecided = build.slices.find(
    ({ status }) => status === "submitted-passed" || status === "submitted-failed",
  );
  if (undecided) {
    return {
      kind: "decide",
      headline: `Decide on the submission for "${undecided.title}"`,
      detail:
        undecided.status === "submitted-passed"
          ? "Verification passed — approve to authorize the merge."
          : "Verification FAILED — reject or request revisions.",
      anchor: "build",
      action: null,
    };
  }
  const ordered = build.slices.find(({ status }) => status === "ordered");
  if (ordered) {
    return {
      kind: "blocked",
      headline: `Waiting on the builder — "${ordered.title}"`,
      detail:
        "Use 'Prepare builder workspace' on the build page for the one-paste handoff; verification runs when the builder submits.",
      anchor: "build",
      action: null,
    };
  }
  if (build.satisfiedSliceCount < build.slices.length) {
    return {
      kind: "run",
      headline: "Issue the next work order",
      detail: `${build.satisfiedSliceCount}/${build.slices.length} slices satisfied; the next buildable slice is selected automatically.`,
      anchor: "build",
      action: {
        label: "Issue next work order",
        endpoint: "/api/foundry/work-orders",
        body: { testSuiteId: build.anchorTestSuiteId },
      },
    };
  }
  const closed = view.completions.some(
    ({ testSuiteId }) => testSuiteId === build.anchorTestSuiteId,
  );
  if (!closed) {
    return {
      kind: "form",
      headline: "Record the build completion",
      detail:
        "Every slice is satisfied. Re-runs the full suite (holdouts included) and pins the commit — closes this generation.",
      anchor: "build",
      action: null,
    };
  }
  return {
    kind: "done",
    headline: "Generation closed — nothing to do",
    detail:
      "Reopen the brief (decision form on the latest version) to start an evolution round with new requirements.",
    anchor: "brief",
    action: null,
  };
}

export async function buildFoundryChainView(
  store: FoundryArtifactStore,
  briefId: string,
): Promise<FoundryChainView | null> {
  const buckets = await collectChainBuckets(store, briefId);
  if (!buckets) return null;
  const standingAdvisories = (
    await collectStandingAdvisories(store, briefId)
  ).map(({ stage, description, firstRecordedAt, occurrences }) => ({
    stage,
    description,
    firstRecordedAt,
    occurrences,
  }));
  const view = buildViewFromBuckets(briefId, buckets, standingAdvisories);
  return { ...view, nextStep: computeNextStep(view) };
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
