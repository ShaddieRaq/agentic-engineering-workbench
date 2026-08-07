import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { digestJsonEvidence } from "../agents/agentEvidenceDigest.js";
import type { ArchitectService } from "./architectService.js";
import type { BuildCompletion } from "./buildCompletion.js";
import type {
  FoundryArtifactReference,
  FoundryArtifactStore,
} from "./foundryArtifactStore.js";
import type { ProjectBriefService } from "./projectBriefService.js";
import type { TestDesignService } from "./testDesignService.js";
import type { TestSuite } from "./testSuite.js";
import {
  BUILDER_INSTRUCTIONS,
  workOrderSchema,
  type WorkOrder,
} from "./workOrder.js";

export interface SavedWorkOrder {
  workOrder: WorkOrder;
  reference: FoundryArtifactReference;
}

export interface WorkOrderDependencies {
  testDesign: Pick<TestDesignService, "loadTestSuite" | "deriveTestSuiteStatus">;
  architect: Pick<ArchitectService, "loadPlan">;
  briefs: Pick<ProjectBriefService, "loadBrief">;
  store: FoundryArtifactStore;
}

export class WorkOrderService {
  readonly #deps: WorkOrderDependencies;

  constructor(dependencies: WorkOrderDependencies) {
    this.#deps = dependencies;
  }

  async createWorkOrder(input: {
    testSuiteId: string;
    sliceId: string;
  }): Promise<SavedWorkOrder> {
    const { suite, plan, brief } = await this.#loadApprovedChain(
      input.testSuiteId,
    );

    const slice = plan.content.implementationSlices.find(
      ({ id }) => id === input.sliceId,
    );
    if (!slice) {
      throw new Error(`Slice ${input.sliceId} does not exist in plan ${plan.planId}.`);
    }

    // Evolution round (Decision 088): carried slices are already built —
    // they satisfy dependency gates from the pinned completion and never
    // receive work orders themselves.
    const evolution = await this.#loadEvolution(plan);
    if (evolution?.carriedSliceIds.has(slice.id)) {
      throw new Error(
        `Slice ${slice.id} is carried from completion ${evolution.completion.completionId} and is already built; only delta slices receive work orders.`,
      );
    }

    const approvedSliceIds = await this.#approvedSliceIds(suite.testSuiteId);
    const satisfiedSliceIds = new Set([
      ...approvedSliceIds,
      ...(evolution ? evolution.carriedSliceIds : []),
    ]);
    for (const dependencyId of slice.dependsOnSliceIds) {
      if (!satisfiedSliceIds.has(dependencyId)) {
        throw new Error(
          `Slice ${slice.id} depends on slice ${dependencyId}, which has no approved submission yet.`,
        );
      }
    }

    const criterionById = new Map(
      brief.acceptanceCriteria.map((criterion) => [criterion.id, criterion]),
    );
    const criteria = slice.verifiedByCriterionIds.map((criterionId) => {
      const criterion = criterionById.get(criterionId);
      if (!criterion) {
        throw new Error(
          `Slice ${slice.id} is verified by unknown criterion ${criterionId}.`,
        );
      }
      return {
        id: criterion.id,
        text: criterion.text,
        verification: criterion.verification,
      };
    });

    // Carried criteria are ALWAYS due: every carried file — visible and
    // holdout — runs against every delta slice (structural regression).
    const dueCriterionIds = this.#dueCriterionIds(
      plan.content.implementationSlices,
      satisfiedSliceIds,
      slice.id,
    );
    const applicableTestFilePaths = suite.content.testFiles
      .filter((file) =>
        file.coveredCriterionIds.every((criterionId) =>
          dueCriterionIds.has(criterionId),
        ),
      )
      .map(({ path }) => path);

    const workOrder = workOrderSchema.parse({
      workOrderId: randomUUID(),
      testSuiteId: suite.testSuiteId,
      testSuiteDigest: digestJsonEvidence(suite),
      planId: plan.planId,
      briefId: brief.briefId,
      briefVersion: brief.version,
      sliceId: slice.id,
      sliceTitle: slice.title,
      sliceDelivers: slice.delivers,
      dependsOnSliceIds: slice.dependsOnSliceIds,
      criteria,
      applicableTestFilePaths,
      interfaceContract: suite.content.interfaceContract,
      builderInstructions: BUILDER_INSTRUCTIONS,
      forbiddenPaths: ["acceptance-tests/"],
      createdAt: new Date().toISOString(),
      ...(evolution
        ? {
            evolvesFromCompletionId: evolution.completion.completionId,
            baselineCommitSha: evolution.completion.mainCommitSha,
            baselineTreeDigest: evolution.completion.treeDigest,
          }
        : {}),
    });
    const reference = await this.#deps.store.saveWorkOrder(workOrder);
    return { workOrder, reference };
  }

  async nextSlice(input: {
    testSuiteId: string;
  }): Promise<{ sliceId: string; sliceTitle: string } | null> {
    const { suite, plan } = await this.#loadApprovedChain(input.testSuiteId);
    const approvedSliceIds = await this.#approvedSliceIds(suite.testSuiteId);
    const evolution = await this.#loadEvolution(plan);
    const satisfiedSliceIds = new Set([
      ...approvedSliceIds,
      ...(evolution ? evolution.carriedSliceIds : []),
    ]);

    for (const slice of plan.content.implementationSlices) {
      if (satisfiedSliceIds.has(slice.id)) continue;
      const ready = slice.dependsOnSliceIds.every((dependencyId) =>
        satisfiedSliceIds.has(dependencyId),
      );
      if (ready) return { sliceId: slice.id, sliceTitle: slice.title };
    }
    return null;
  }

  // Loads and cross-checks the completion an evolution plan descends from
  // (Decision 088). Carried slice ids come from the plan's
  // Workbench-computed dispositions, cross-checked against the completion's
  // built set — a carried disposition outside the built set is a chain
  // integrity failure, never a trusted claim.
  async #loadEvolution(plan: {
    evolvesFromCompletionId?: string | undefined;
    sliceDispositions?:
      | { sliceId: string; disposition: "carried" | "delta" }[]
      | undefined;
  }): Promise<{
    completion: BuildCompletion;
    carriedSliceIds: Set<string>;
  } | null> {
    if (!plan.evolvesFromCompletionId) return null;
    const stored = await this.#deps.store.load(plan.evolvesFromCompletionId);
    if (stored.kind !== "build-completion") {
      throw new Error(
        `Artifact ${plan.evolvesFromCompletionId} is not a build completion.`,
      );
    }
    const completion = stored.artifact;
    const built = new Set(completion.builtSliceIds);
    const carriedSliceIds = new Set<string>();
    for (const { sliceId, disposition } of plan.sliceDispositions ?? []) {
      if (disposition !== "carried") continue;
      if (!built.has(sliceId)) {
        throw new Error(
          `Chain integrity failure: slice ${sliceId} is marked carried but is not in completion ${completion.completionId}'s built set.`,
        );
      }
      carriedSliceIds.add(sliceId);
    }
    return { completion, carriedSliceIds };
  }

  async loadWorkOrder(workOrderId: string): Promise<WorkOrder> {
    const stored = await this.#deps.store.load(workOrderId);
    if (stored.kind !== "work-order") {
      throw new Error(`Artifact ${workOrderId} is not a work order.`);
    }
    return stored.artifact;
  }

  async materializeVisibleTests(input: {
    workOrderId: string;
    projectRoot: string;
  }): Promise<string[]> {
    const workOrder = await this.loadWorkOrder(input.workOrderId);
    const suite = await this.#deps.testDesign.loadTestSuite(workOrder.testSuiteId);
    const root = resolve(input.projectRoot);

    const written: string[] = [];
    for (const file of suite.content.testFiles) {
      if (file.visibility !== "visible") continue;
      const target = join(root, file.path);
      if (!target.startsWith(root)) {
        throw new Error(`Test path escapes the project root: ${file.path}`);
      }
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, file.content, "utf8");
      written.push(file.path);
    }
    // Evolution reconcile (Decision 088): retired prior test files would
    // otherwise remain on disk from the previous generation and fail the
    // successor suite's scope check as unexpected files.
    for (const retired of suite.retiredFilePaths ?? []) {
      const target = join(root, retired);
      if (!target.startsWith(root)) {
        throw new Error(`Retired test path escapes the project root: ${retired}`);
      }
      await rm(target, { force: true });
    }
    return written;
  }

  async #loadApprovedChain(testSuiteId: string): Promise<{
    suite: TestSuite;
    plan: Awaited<ReturnType<ArchitectService["loadPlan"]>>;
    brief: Awaited<ReturnType<ProjectBriefService["loadBrief"]>>;
  }> {
    const status = await this.#deps.testDesign.deriveTestSuiteStatus(testSuiteId);
    if (status !== "approved") {
      throw new Error(
        `Test suite ${testSuiteId} is ${status}; only an approved suite can issue work orders.`,
      );
    }
    const suite = await this.#deps.testDesign.loadTestSuite(testSuiteId);
    const plan = await this.#deps.architect.loadPlan(suite.planId);
    const brief = await this.#deps.briefs.loadBrief(
      suite.briefId,
      suite.briefVersion,
    );
    return { suite, plan, brief };
  }

  #dueCriterionIds(
    slices: { id: string; verifiedByCriterionIds: string[] }[],
    approvedSliceIds: Set<string>,
    currentSliceId: string,
  ): Set<string> {
    const due = new Set<string>();
    for (const slice of slices) {
      if (slice.id === currentSliceId || approvedSliceIds.has(slice.id)) {
        for (const criterionId of slice.verifiedByCriterionIds) {
          due.add(criterionId);
        }
      }
    }
    return due;
  }

  async #approvedSliceIds(testSuiteId: string): Promise<Set<string>> {
    const approved = new Set<string>();
    const { artifacts } = await this.#deps.store.list({
      kind: "submission-decision",
      limit: 500,
    });
    for (const summary of artifacts) {
      const stored = await this.#deps.store.load(summary.id);
      if (stored.kind !== "submission-decision") continue;
      if (stored.artifact.decision !== "approve") continue;
      if (stored.artifact.testSuiteId !== testSuiteId) continue;
      approved.add(stored.artifact.sliceId);
    }
    return approved;
  }
}
