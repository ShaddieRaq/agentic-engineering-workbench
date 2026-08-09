import { randomUUID } from "node:crypto";
import type {
  FoundryArtifactStore,
} from "../foundry/foundryArtifactStore.js";
import {
  builderNoteSchema,
  builderQuestionSchema,
  type OperatorAnswer,
} from "../foundry/builderMessage.js";
import type {
  SliceSubmission,
  SubmissionDecision,
} from "../foundry/sliceSubmission.js";
import type { SubmissionService } from "../foundry/submissionService.js";
import type { TestDesignService } from "../foundry/testDesignService.js";
import type { TestSuite } from "../foundry/testSuite.js";
import type { WorkOrder } from "../foundry/workOrder.js";
import type { WorkOrderService } from "../foundry/workOrderService.js";
import { digestJsonEvidence } from "../agents/agentEvidenceDigest.js";

// The builder channel is an allowlist projection (Decision 087): every
// response is hand-built from named fields, the pinned test suite is the
// visibility authority for every path-shaped value, and holdout paths and
// output never cross the boundary. Redaction failures must fall toward
// over-redaction.

export interface BuilderMcpDependencies {
  store: FoundryArtifactStore;
  workOrders: Pick<WorkOrderService, "loadWorkOrder" | "materializeVisibleTests">;
  submissions: Pick<SubmissionService, "submitSlice" | "loadSubmission">;
  testDesign: Pick<TestDesignService, "loadTestSuite">;
  projectRoot: string;
  // When set, every tool call first verifies the workspace's isolation
  // guardrails (settings + sandbox + root pin) and fails closed if they
  // were tampered with or lost (v1.2 structural confinement).
  workbenchRoot?: string;
  // When set, list_open_work_orders serves only this project's orders.
  // Live leak 2026-08-09: a drill builder was served a stale job-tracker
  // order from the shared store.
  briefId?: string;
}

export interface BuilderWorkOrderView {
  workOrderId: string;
  sliceId: string;
  sliceTitle: string;
  sliceDelivers: string;
  dependsOnSliceIds: string[];
  criteria: { id: string; text: string; verification: string }[];
  interfaceContract: string;
  builderInstructions: string[];
  forbiddenPaths: string[];
  visibleTestFilePaths: string[];
  holdoutTestFileCount: number;
  createdAt: string;
}

export interface BuilderSubmissionView {
  submissionId: string;
  workOrderId: string;
  sliceId: string;
  status: "passed" | "failed";
  scopeCheck: { passed: boolean; failures: string[] };
  files: {
    path: string;
    visibility: "visible" | "holdout";
    exitCode: number;
    passed: boolean;
  }[];
  visibleOutputExcerpt: string;
  createdAt: string;
  latestDecision: {
    decision: "approve" | "reject" | "revise";
    operatorId: string;
    rationale: string;
    requestedRevisions: string[] | null;
    decidedAt: string;
  } | null;
}

function visibilityIndex(suite: TestSuite): {
  visible: Set<string>;
  holdout: Map<string, number>;
} {
  const visible = new Set<string>();
  const holdout = new Map<string, number>();
  for (const file of suite.content.testFiles) {
    if (file.visibility === "visible") {
      visible.add(file.path);
    } else {
      holdout.set(file.path, holdout.size + 1);
    }
  }
  return { visible, holdout };
}

export function redactWorkOrder(
  workOrder: WorkOrder,
  suite: TestSuite,
): BuilderWorkOrderView {
  const { visible, holdout } = visibilityIndex(suite);
  const visiblePaths = workOrder.applicableTestFilePaths.filter((path) =>
    visible.has(path),
  );
  const holdoutCount = workOrder.applicableTestFilePaths.filter((path) =>
    holdout.has(path),
  ).length;

  return {
    workOrderId: workOrder.workOrderId,
    sliceId: workOrder.sliceId,
    sliceTitle: workOrder.sliceTitle,
    sliceDelivers: workOrder.sliceDelivers,
    dependsOnSliceIds: workOrder.dependsOnSliceIds,
    criteria: workOrder.criteria,
    interfaceContract: workOrder.interfaceContract,
    builderInstructions: workOrder.builderInstructions,
    forbiddenPaths: workOrder.forbiddenPaths,
    visibleTestFilePaths: visiblePaths,
    holdoutTestFileCount: holdoutCount,
    createdAt: workOrder.createdAt,
  };
}

// Sections start only at a line beginning "--- " whose remainder exactly
// equals a canonical suite path; anything else (test-runner diff noise)
// attaches to the current section. Holdout sections are withheld wholesale.
function redactOutputExcerpt(excerpt: string, suite: TestSuite): string {
  const { visible, holdout } = visibilityIndex(suite);
  const canonical = new Set([...visible, ...holdout.keys()]);

  const kept: string[] = [];
  let keepCurrent = false;
  for (const line of excerpt.split("\n")) {
    if (line.startsWith("--- ")) {
      const path = line.slice(4);
      if (canonical.has(path)) {
        if (visible.has(path)) {
          keepCurrent = true;
          kept.push(line);
        } else {
          keepCurrent = false;
          kept.push(`--- holdout-${holdout.get(path)} [output withheld]`);
        }
        continue;
      }
    }
    if (keepCurrent) kept.push(line);
  }
  return kept.join("\n");
}

function redactScopeFailures(
  failures: string[],
  suite: TestSuite,
): string[] {
  const { holdout } = visibilityIndex(suite);
  const holdoutPaths = [...holdout.keys()];
  const safe: string[] = [];
  let withheldCount = 0;
  for (const failure of failures) {
    if (holdoutPaths.some((path) => failure.includes(path))) {
      withheldCount += 1;
    } else {
      safe.push(failure);
    }
  }
  if (withheldCount > 0) {
    safe.push(
      `${withheldCount} withheld holdout test file(s) were already present under acceptance-tests/ before verification; delete every file there that the Workbench did not materialize, then resubmit.`,
    );
  }
  return safe;
}

export function redactSubmission(
  submission: SliceSubmission,
  suite: TestSuite,
  decisions: SubmissionDecision[],
): BuilderSubmissionView {
  const { holdout } = visibilityIndex(suite);
  const latest = [...decisions].sort(
    (left, right) =>
      right.decidedAt.localeCompare(left.decidedAt) ||
      right.decisionId.localeCompare(left.decisionId),
  )[0];

  return {
    submissionId: submission.submissionId,
    workOrderId: submission.workOrderId,
    sliceId: submission.sliceId,
    status: submission.status,
    scopeCheck: {
      passed: submission.scopeCheck.passed,
      failures: redactScopeFailures(submission.scopeCheck.failures, suite),
    },
    files: submission.testRun.files.map((file) => ({
      path: holdout.has(file.path)
        ? `holdout-${holdout.get(file.path)}`
        : file.path,
      visibility: file.visibility,
      exitCode: file.exitCode,
      passed: file.passed,
    })),
    visibleOutputExcerpt: redactOutputExcerpt(
      submission.testRun.outputExcerpt,
      suite,
    ),
    createdAt: submission.createdAt,
    latestDecision: latest
      ? {
          decision: latest.decision,
          operatorId: latest.operatorId,
          rationale: latest.rationale,
          requestedRevisions: latest.requestedRevisions,
          decidedAt: latest.decidedAt,
        }
      : null,
  };
}

export function createBuilderMcpTools(deps: BuilderMcpDependencies) {
  const loadSuiteFor = async (workOrder: WorkOrder): Promise<TestSuite> =>
    deps.testDesign.loadTestSuite(workOrder.testSuiteId);

  // The channel is only served into an intact cage. A tampered workspace
  // loses its sanctioned channel instead of operating unconfined.
  const ensureIntegrity = async (): Promise<void> => {
    if (!deps.workbenchRoot) return;
    const { verifyWorkspaceIntegrity } = await import(
      "../foundry/builderWorkspace.js"
    );
    const result = await verifyWorkspaceIntegrity({
      projectRoot: deps.projectRoot,
      workbenchRoot: deps.workbenchRoot,
    });
    if (!result.ok) {
      throw new Error(
        `Workspace integrity check failed; the builder channel is closed until the operator re-runs builder-workspace. Problems: ${result.problems.join(" ")}`,
      );
    }
  };

  return {
    // Open = no approve decision for the (suite, slice) pair (mirrors
    // WorkOrderService.#approvedSliceIds), the pinned suite digest still
    // matches the stored suite, and only the newest order per slice.
    async listOpenWorkOrders() {
      await ensureIntegrity();
      const { artifacts } = await deps.store.list({
        kind: "work-order",
        limit: 500,
      });
      const approved = new Set<string>();
      const { artifacts: decisionSummaries } = await deps.store.list({
        kind: "submission-decision",
        limit: 500,
      });
      for (const summary of decisionSummaries) {
        const stored = await deps.store.load(summary.id);
        if (stored.kind !== "submission-decision") continue;
        if (stored.artifact.decision !== "approve") continue;
        approved.add(`${stored.artifact.testSuiteId}:${stored.artifact.sliceId}`);
      }

      const newestPerSlice = new Map<
        string,
        { workOrderId: string; sliceTitle: string; sliceDelivers: string; createdAt: string }
      >();
      // Latest-decision-wins suite status, derived from the store so a
      // superseded (revision-requested/rejected) suite's orders never
      // surface as open (live leak 2026-08-09).
      const suiteStatuses = new Map<string, string>();
      const { artifacts: suiteDecisionSummaries } = await deps.store.list({
        kind: "test-suite-decision",
        limit: 500,
      });
      const suiteDecisions: {
        testSuiteId: string;
        decision: string;
        decidedAt: string;
        decisionId: string;
      }[] = [];
      for (const summary of suiteDecisionSummaries) {
        const stored = await deps.store.load(summary.id);
        if (stored.kind !== "test-suite-decision") continue;
        suiteDecisions.push(stored.artifact);
      }
      for (const decision of suiteDecisions.sort(
        (left, right) =>
          left.decidedAt.localeCompare(right.decidedAt) ||
          left.decisionId.localeCompare(right.decisionId),
      )) {
        suiteStatuses.set(decision.testSuiteId, decision.decision);
      }

      for (const summary of artifacts) {
        const stored = await deps.store.load(summary.id);
        if (stored.kind !== "work-order") continue;
        const workOrder = stored.artifact;
        if (deps.briefId && workOrder.briefId !== deps.briefId) continue;
        if (suiteStatuses.get(workOrder.testSuiteId) !== "approve") continue;
        const key = `${workOrder.testSuiteId}:${workOrder.sliceId}`;
        if (approved.has(key)) continue;
        let suite: TestSuite;
        try {
          suite = await loadSuiteFor(workOrder);
        } catch {
          continue;
        }
        if (digestJsonEvidence(suite) !== workOrder.testSuiteDigest) continue;
        const existing = newestPerSlice.get(key);
        if (!existing || workOrder.createdAt.localeCompare(existing.createdAt) > 0) {
          newestPerSlice.set(key, {
            workOrderId: workOrder.workOrderId,
            sliceTitle: workOrder.sliceTitle,
            sliceDelivers: workOrder.sliceDelivers,
            createdAt: workOrder.createdAt,
          });
        }
      }
      return {
        workOrders: [...newestPerSlice.values()].sort((left, right) =>
          right.createdAt.localeCompare(left.createdAt),
        ),
      };
    },

    async getWorkOrder(input: { workOrderId: string }) {
      await ensureIntegrity();
      const workOrder = await deps.workOrders.loadWorkOrder(input.workOrderId);
      const suite = await loadSuiteFor(workOrder);
      return redactWorkOrder(workOrder, suite);
    },

    async materializeTests(input: { workOrderId: string }) {
      await ensureIntegrity();
      const written = await deps.workOrders.materializeVisibleTests({
        workOrderId: input.workOrderId,
        projectRoot: deps.projectRoot,
      });
      return { written, projectRoot: deps.projectRoot };
    },

    async submitSlice(input: { workOrderId: string; report?: string | undefined }) {
      await ensureIntegrity();
      const workOrder = await deps.workOrders.loadWorkOrder(input.workOrderId);
      const suite = await loadSuiteFor(workOrder);
      const { submission } = await deps.submissions.submitSlice({
        workOrderId: input.workOrderId,
        projectRoot: deps.projectRoot,
        ...(input.report ? { builderReport: input.report } : {}),
      });
      return redactSubmission(submission, suite, []);
    },

    // Builder speech channel (Decision 090): notes inform, questions ask.
    // Chain identity comes from the work order, never from the builder.
    async postBuilderNote(input: { workOrderId: string; note: string }) {
      await ensureIntegrity();
      const workOrder = await deps.workOrders.loadWorkOrder(input.workOrderId);
      const note = builderNoteSchema.parse({
        noteId: randomUUID(),
        workOrderId: workOrder.workOrderId,
        testSuiteId: workOrder.testSuiteId,
        sliceId: workOrder.sliceId,
        briefId: workOrder.briefId,
        briefVersion: workOrder.briefVersion,
        note: input.note,
        createdAt: new Date().toISOString(),
      });
      await deps.store.saveBuilderNote(note);
      return { noteId: note.noteId, recordedAt: note.createdAt };
    },

    async askOperator(input: { workOrderId: string; question: string }) {
      await ensureIntegrity();
      const workOrder = await deps.workOrders.loadWorkOrder(input.workOrderId);
      const question = builderQuestionSchema.parse({
        questionId: randomUUID(),
        workOrderId: workOrder.workOrderId,
        testSuiteId: workOrder.testSuiteId,
        sliceId: workOrder.sliceId,
        briefId: workOrder.briefId,
        briefVersion: workOrder.briefVersion,
        question: input.question,
        createdAt: new Date().toISOString(),
      });
      await deps.store.saveBuilderQuestion(question);
      return {
        questionId: question.questionId,
        status: "pending" as const,
        guidance:
          "The operator sees this question in the console. Poll get_operator_answer with this questionId; continue other work meanwhile if possible.",
      };
    },

    async getOperatorAnswer(input: { questionId: string }) {
      await ensureIntegrity();
      const stored = await deps.store.load(input.questionId);
      if (stored.kind !== "builder-question") {
        throw new Error(`Artifact ${input.questionId} is not a builder question.`);
      }
      const { artifacts } = await deps.store.list({
        kind: "operator-answer",
        limit: 500,
      });
      let latest: OperatorAnswer | null = null;
      for (const summary of artifacts) {
        const answerStored = await deps.store.load(summary.id);
        if (answerStored.kind !== "operator-answer") continue;
        if (answerStored.artifact.questionId !== input.questionId) continue;
        if (
          !latest ||
          answerStored.artifact.answeredAt.localeCompare(latest.answeredAt) > 0
        ) {
          latest = answerStored.artifact;
        }
      }
      return latest
        ? {
            status: "answered" as const,
            answer: latest.answer,
            operatorId: latest.operatorId,
            answeredAt: latest.answeredAt,
          }
        : { status: "pending" as const };
    },

    async getSubmission(input: { submissionId: string }) {
      await ensureIntegrity();
      const submission = await deps.submissions.loadSubmission(
        input.submissionId,
      );
      const workOrder = await deps.workOrders.loadWorkOrder(
        submission.workOrderId,
      );
      const suite = await loadSuiteFor(workOrder);
      const decisions: SubmissionDecision[] = [];
      const { artifacts } = await deps.store.list({
        kind: "submission-decision",
        limit: 500,
      });
      for (const summary of artifacts) {
        const stored = await deps.store.load(summary.id);
        if (stored.kind !== "submission-decision") continue;
        if (stored.artifact.submissionId !== submission.submissionId) continue;
        decisions.push(stored.artifact);
      }
      return redactSubmission(submission, suite, decisions);
    },
  };
}

export type BuilderMcpTools = ReturnType<typeof createBuilderMcpTools>;
