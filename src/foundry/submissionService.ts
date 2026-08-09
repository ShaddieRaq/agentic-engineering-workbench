import { randomUUID } from "node:crypto";
import {
  cp,
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { digestJsonEvidence } from "../agents/agentEvidenceDigest.js";
import type {
  FoundryArtifactReference,
  FoundryArtifactStore,
} from "./foundryArtifactStore.js";
import {
  createSubmissionDecision,
  sliceSubmissionSchema,
  type SliceSubmission,
  type SubmissionDecision,
  type SubmissionDecisionKind,
} from "./sliceSubmission.js";
import { createVerificationCommandTool } from "../tools/verificationCommandTool.js";
import type { GitInspector } from "./buildCompletionService.js";
import type { TestDesignService } from "./testDesignService.js";
import type { WorkOrderService } from "./workOrderService.js";

export interface SubmissionTestRunner {
  runTestFile(input: {
    projectRoot: string;
    testFile: string;
  }): Promise<{ exitCode: number; passed: boolean; output: string }>;
}

// Runs targeted test files through the hardened controlled npm runner:
// restricted environment, bounded output, workspace escape rejection.
export function createProcessSubmissionRunner(): SubmissionTestRunner {
  return {
    async runTestFile({ projectRoot, testFile }) {
      const tool = createVerificationCommandTool({ allowedRoot: projectRoot });
      const result = await tool.execute({
        command: "test-file",
        testFile,
        maxOutputBytes: 65_536,
      });
      return {
        exitCode: result.exitCode ?? -1,
        passed: result.passed,
        output: `${result.stdout}\n${result.stderr}`.trim(),
      };
    },
  };
}

export interface SavedSliceSubmission {
  submission: SliceSubmission;
  reference: FoundryArtifactReference;
}

export interface SavedSubmissionDecision {
  decision: SubmissionDecision;
  reference: FoundryArtifactReference;
}

const MAXIMUM_EXCERPT_BYTES = 20_000;

export class SubmissionService {
  readonly #workOrders: Pick<WorkOrderService, "loadWorkOrder">;
  readonly #testDesign: Pick<TestDesignService, "loadTestSuite">;
  readonly #store: FoundryArtifactStore;
  readonly #runner: SubmissionTestRunner;
  readonly #isolationRoot: string | null;
  readonly #git: GitInspector | null;

  constructor(dependencies: {
    workOrders: Pick<WorkOrderService, "loadWorkOrder">;
    testDesign: Pick<TestDesignService, "loadTestSuite">;
    store: FoundryArtifactStore;
    runner: SubmissionTestRunner;
    // When set, every verification runs against a frozen copy of the
    // project placed under this root (Decision 087: keep it under the
    // Workbench tree the builder session cannot read), so builder-authored
    // code never executes with holdout files inside the builder's own
    // workspace. Omit for in-place verification (unit tests, legacy).
    isolationRoot?: string;
    // Required for evolution work orders (Decision 088): verification of a
    // baseline-pinned work order refuses a HEAD that does not descend from
    // the pinned commit.
    git?: GitInspector;
  }) {
    this.#workOrders = dependencies.workOrders;
    this.#testDesign = dependencies.testDesign;
    this.#store = dependencies.store;
    this.#runner = dependencies.runner;
    this.#isolationRoot = dependencies.isolationRoot
      ? resolve(dependencies.isolationRoot)
      : null;
    this.#git = dependencies.git ?? null;
  }

  async submitSlice(input: {
    workOrderId: string;
    projectRoot: string;
    // Builder-authored, unverified (Decision 090); stored with the
    // submission for the operator's decision, never used by gates.
    builderReport?: string;
  }): Promise<SavedSliceSubmission> {
    const workOrder = await this.#workOrders.loadWorkOrder(input.workOrderId);
    const suite = await this.#testDesign.loadTestSuite(workOrder.testSuiteId);
    if (digestJsonEvidence(suite) !== workOrder.testSuiteDigest) {
      throw new Error(
        "Chain integrity failure: the test suite no longer matches the digest pinned by the work order.",
      );
    }
    const builderRoot = resolve(input.projectRoot);
    const submissionId = randomUUID();

    // Decision 088 descent check: a baseline-pinned (evolution) work order
    // verifies only builder trees whose HEAD descends from the pinned
    // commit. Failures are recorded as scope evidence, not thrown away.
    let headCommitSha: string | null = null;
    const baselineFailures: string[] = [];
    if (workOrder.baselineCommitSha) {
      if (!this.#git) {
        throw new Error(
          "This work order pins a baseline commit but the submission service has no git inspector configured.",
        );
      }
      try {
        headCommitSha = await this.#git.headCommit(builderRoot);
        const descends = await this.#git.isAncestor(
          builderRoot,
          workOrder.baselineCommitSha,
          headCommitSha,
        );
        if (!descends) {
          baselineFailures.push(
            `HEAD ${headCommitSha.slice(0, 12)} does not descend from the pinned baseline commit ${workOrder.baselineCommitSha.slice(0, 12)}.`,
          );
        }
      } catch (error: unknown) {
        baselineFailures.push(
          `Baseline descent check failed: ${error instanceof Error ? error.message : String(error)}.`,
        );
      }
    }

    // Out-of-tree isolation: freeze the workspace into a copy the builder
    // session cannot read, then scope-check and run everything against the
    // frozen copy. Holdout files never touch the builder's tree, and code
    // edited after submission cannot affect the run.
    let isolationCopy: string | null = null;
    if (this.#isolationRoot) {
      isolationCopy = join(this.#isolationRoot, submissionId);
      await mkdir(this.#isolationRoot, { recursive: true });
      await cp(builderRoot, isolationCopy, {
        recursive: true,
        filter: (source) => basename(source) !== ".git",
      });
    }
    try {
      return await this.#verify({
        workOrder,
        suite,
        submissionId,
        builderRoot,
        verificationRoot: isolationCopy ?? builderRoot,
        baselineFailures,
        headCommitSha,
        builderReport: input.builderReport?.trim() || null,
      });
    } finally {
      if (isolationCopy) {
        await rm(isolationCopy, { recursive: true, force: true });
      }
    }
  }

  async #verify(context: {
    workOrder: Awaited<ReturnType<WorkOrderService["loadWorkOrder"]>>;
    suite: Awaited<ReturnType<TestDesignService["loadTestSuite"]>>;
    submissionId: string;
    builderRoot: string;
    verificationRoot: string;
    baselineFailures: string[];
    headCommitSha: string | null;
    builderReport: string | null;
  }): Promise<SavedSliceSubmission> {
    const { workOrder, suite, submissionId, builderRoot } = context;
    const projectRoot = context.verificationRoot;

    const scopeFailures: string[] = [...context.baselineFailures];
    const visibleFiles = suite.content.testFiles.filter(
      ({ visibility }) => visibility === "visible",
    );
    const holdoutFiles = suite.content.testFiles.filter(
      ({ visibility }) => visibility === "holdout",
    );
    const canonicalPaths = new Set(
      suite.content.testFiles.map(({ path }) => path),
    );

    for (const file of visibleFiles) {
      try {
        const onDisk = await readFile(join(projectRoot, file.path), "utf8");
        if (onDisk !== file.content) {
          scopeFailures.push(
            `Visible test file ${file.path} does not match the approved suite.`,
          );
        }
      } catch {
        scopeFailures.push(`Visible test file ${file.path} is missing.`);
      }
    }
    for (const file of holdoutFiles) {
      try {
        await readFile(join(projectRoot, file.path), "utf8");
        scopeFailures.push(
          `Holdout test file ${file.path} is present in the project before verification.`,
        );
      } catch {
        // Absent is correct.
      }
    }
    const actualPaths = await listAcceptanceTestFiles(projectRoot);
    for (const actual of actualPaths) {
      if (!canonicalPaths.has(actual)) {
        scopeFailures.push(
          `Unexpected file under acceptance-tests/: ${actual}.`,
        );
      }
    }

    const applicable = new Set(workOrder.applicableTestFilePaths);
    const filesToRun = suite.content.testFiles.filter(({ path }) =>
      applicable.has(path),
    );

    const results: SliceSubmission["testRun"]["files"] = [];
    const outputs: string[] = [];
    const materializedHoldouts: string[] = [];
    let testsPassed = true;

    if (scopeFailures.length === 0) {
      try {
        for (const file of filesToRun) {
          if (file.visibility === "holdout") {
            const target = join(projectRoot, file.path);
            await mkdir(dirname(target), { recursive: true });
            await writeFile(target, file.content, "utf8");
            materializedHoldouts.push(target);
          }
        }
        for (const file of filesToRun) {
          const run = await this.#runner.runTestFile({
            projectRoot,
            testFile: file.path,
          });
          results.push({
            path: file.path,
            visibility: file.visibility,
            exitCode: run.exitCode,
            passed: run.passed,
          });
          outputs.push(`--- ${file.path}\n${run.output}`);
          if (!run.passed) testsPassed = false;
        }
      } finally {
        for (const target of materializedHoldouts) {
          await rm(target, { force: true });
        }
      }
    } else {
      testsPassed = false;
    }

    const submission = sliceSubmissionSchema.parse({
      submissionId,
      workOrderId: workOrder.workOrderId,
      workOrderDigest: digestJsonEvidence(workOrder),
      testSuiteId: workOrder.testSuiteId,
      sliceId: workOrder.sliceId,
      briefId: workOrder.briefId,
      briefVersion: workOrder.briefVersion,
      projectRoot: builderRoot,
      ...(workOrder.baselineCommitSha
        ? { baselineCommitSha: workOrder.baselineCommitSha }
        : {}),
      ...(context.headCommitSha
        ? { headCommitSha: context.headCommitSha }
        : {}),
      verificationMode: this.#isolationRoot ? "out-of-tree" : "in-place",
      scopeCheck: { passed: scopeFailures.length === 0, failures: scopeFailures },
      testRun: {
        files: results,
        passed: testsPassed && scopeFailures.length === 0,
        outputExcerpt: outputs.join("\n").slice(0, MAXIMUM_EXCERPT_BYTES),
      },
      status:
        scopeFailures.length === 0 && testsPassed ? "passed" : "failed",
      createdAt: new Date().toISOString(),
      ...(context.builderReport ? { builderReport: context.builderReport } : {}),
    });
    const reference = await this.#store.saveSliceSubmission(submission);
    return { submission, reference };
  }

  async loadSubmission(submissionId: string): Promise<SliceSubmission> {
    const stored = await this.#store.load(submissionId);
    if (stored.kind !== "slice-submission") {
      throw new Error(`Artifact ${submissionId} is not a slice submission.`);
    }
    return stored.artifact;
  }

  async recordSubmissionDecision(input: {
    submissionId: string;
    decision: SubmissionDecisionKind;
    operatorId: string;
    rationale: string;
    requestedRevisions?: string[] | null;
  }): Promise<SavedSubmissionDecision> {
    const submission = await this.loadSubmission(input.submissionId);
    const decision = createSubmissionDecision({
      submission,
      decision: input.decision,
      operatorId: input.operatorId,
      rationale: input.rationale,
      requestedRevisions: input.requestedRevisions ?? null,
    });
    const reference = await this.#store.saveSubmissionDecision(decision);
    return { decision, reference };
  }
}

async function listAcceptanceTestFiles(projectRoot: string): Promise<string[]> {
  const root = join(resolve(projectRoot), "acceptance-tests");
  const collected: string[] = [];

  async function walk(directory: string, prefix: string): Promise<void> {
    let entries: string[];
    try {
      entries = await readdir(directory);
    } catch {
      return;
    }
    for (const entry of entries.sort()) {
      const path = join(directory, entry);
      const relative = `${prefix}${entry}`;
      const metadata = await stat(path);
      if (metadata.isDirectory()) {
        await walk(path, `${relative}/`);
      } else {
        collected.push(`acceptance-tests/${relative}`);
      }
    }
  }

  await walk(root, "");
  return collected;
}
