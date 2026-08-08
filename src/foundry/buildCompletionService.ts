import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { digestJsonEvidence } from "../agents/agentEvidenceDigest.js";
import {
  buildCompletionSchema,
  type BuildCompletion,
} from "./buildCompletion.js";
import type {
  FoundryArtifactReference,
  FoundryArtifactStore,
} from "./foundryArtifactStore.js";
import type { SubmissionTestRunner } from "./submissionService.js";
import type { ArchitectService } from "./architectService.js";
import type { TestDesignService } from "./testDesignService.js";

// Read-only git introspection, injectable for tests. The completion's
// trust anchor is the Workbench-computed tree digest; git supplies the
// human-meaningful commit identity and the clean-tree gate.
export interface GitInspector {
  headCommit(root: string): Promise<string>;
  isClean(root: string): Promise<boolean>;
  // True when `ancestor` is an ancestor of (or equal to) `descendant` —
  // the Decision 088 descent check for delta submissions.
  isAncestor(
    root: string,
    ancestor: string,
    descendant: string,
  ): Promise<boolean>;
}

export function createProcessGitInspector(): GitInspector {
  function git(root: string, args: string[]): string {
    const run = spawnSync("git", args, {
      cwd: root,
      encoding: "utf8",
      timeout: 10_000,
    });
    if (run.status !== 0) {
      throw new Error(
        `git ${args.join(" ")} failed in ${root}: ${(run.stderr || "").trim()}`,
      );
    }
    return run.stdout.trim();
  }
  return {
    async headCommit(root) {
      return git(root, ["rev-parse", "HEAD"]);
    },
    async isClean(root) {
      return git(root, ["status", "--porcelain"]) === "";
    },
    async isAncestor(root, ancestor, descendant) {
      const run = spawnSync(
        "git",
        ["merge-base", "--is-ancestor", ancestor, descendant],
        { cwd: root, encoding: "utf8", timeout: 10_000 },
      );
      if (run.status === 0) return true;
      if (run.status === 1) return false;
      throw new Error(
        `git merge-base --is-ancestor failed in ${root}: ${(run.stderr || "").trim()}`,
      );
    },
  };
}

const TREE_DIGEST_EXCLUDED = new Set([".git", "node_modules"]);

// Deterministic digest over relative paths and contents, sorted. Excludes
// version-control internals and installed dependencies; everything the
// project ships (including committed build output) counts.
export async function computeTreeDigest(root: string): Promise<string> {
  const resolvedRoot = resolve(root);
  const files: string[] = [];

  async function walk(directory: string, prefix: string): Promise<void> {
    const entries = (await readdir(directory)).sort();
    for (const entry of entries) {
      if (prefix === "" && TREE_DIGEST_EXCLUDED.has(entry)) continue;
      const path = join(directory, entry);
      const relative = `${prefix}${entry}`;
      const metadata = await stat(path);
      if (metadata.isDirectory()) {
        await walk(path, `${relative}/`);
      } else {
        files.push(relative);
      }
    }
  }

  await walk(resolvedRoot, "");
  const digest = createHash("sha256");
  for (const relative of files) {
    const content = await readFile(join(resolvedRoot, relative));
    digest.update(relative);
    digest.update("\0");
    digest.update(content);
    digest.update("\0");
  }
  return digest.digest("hex");
}

export interface SavedBuildCompletion {
  completion: BuildCompletion;
  reference: FoundryArtifactReference;
}

const MAXIMUM_EXCERPT_BYTES = 20_000;

export class BuildCompletionService {
  readonly #testDesign: Pick<
    TestDesignService,
    "loadTestSuite" | "deriveTestSuiteStatus"
  >;
  readonly #architect: Pick<ArchitectService, "loadPlan">;
  readonly #store: FoundryArtifactStore;
  readonly #runner: SubmissionTestRunner;
  readonly #git: GitInspector;
  readonly #isolationRoot: string | null;

  constructor(dependencies: {
    testDesign: Pick<TestDesignService, "loadTestSuite" | "deriveTestSuiteStatus">;
    architect: Pick<ArchitectService, "loadPlan">;
    store: FoundryArtifactStore;
    runner: SubmissionTestRunner;
    git: GitInspector;
    isolationRoot?: string;
  }) {
    this.#testDesign = dependencies.testDesign;
    this.#architect = dependencies.architect;
    this.#store = dependencies.store;
    this.#runner = dependencies.runner;
    this.#git = dependencies.git;
    this.#isolationRoot = dependencies.isolationRoot
      ? resolve(dependencies.isolationRoot)
      : null;
  }

  // Records the operator-signed close of a build generation. Refuses —
  // loudly, persisting nothing — unless: the suite is approved, every plan
  // slice has an approving submission decision, the working tree is clean,
  // the on-disk suite matches the approved content byte-for-byte, and the
  // FULL suite (holdouts included) passes out-of-tree.
  async recordCompletion(input: {
    testSuiteId: string;
    projectRoot: string;
    operatorId: string;
    retroactive?: boolean;
  }): Promise<SavedBuildCompletion> {
    const suite = await this.#testDesign.loadTestSuite(input.testSuiteId);
    const status = await this.#testDesign.deriveTestSuiteStatus(
      input.testSuiteId,
    );
    if (status !== "approved") {
      throw new Error(
        `Test suite ${input.testSuiteId} is ${status}; a completion requires an approved suite.`,
      );
    }
    const plan = await this.#architect.loadPlan(suite.planId);

    const approvedSliceIds = await this.#approvedSliceIds(input.testSuiteId);
    // Evolution rounds (Decision 088): carried slices are satisfied by the
    // prior generation's completion — cross-checked against its built set,
    // never trusted from the plan alone.
    const carriedSliceIds = await this.#carriedSliceIds(plan);
    const unapproved = plan.content.implementationSlices
      .map(({ id }) => id)
      .filter((id) => !approvedSliceIds.has(id) && !carriedSliceIds.has(id));
    if (unapproved.length > 0) {
      throw new Error(
        `Cannot record completion: slice(s) without an approving submission decision: ${unapproved.join(", ")}.`,
      );
    }

    const builderRoot = resolve(input.projectRoot.trim());
    if (!(await this.#git.isClean(builderRoot))) {
      throw new Error(
        "Cannot record completion: the project working tree has uncommitted changes.",
      );
    }
    const mainCommitSha = await this.#git.headCommit(builderRoot);
    const treeDigest = await computeTreeDigest(builderRoot);

    const completionId = randomUUID();
    let verificationRoot = builderRoot;
    let isolationCopy: string | null = null;
    if (this.#isolationRoot) {
      isolationCopy = join(this.#isolationRoot, completionId);
      await mkdir(this.#isolationRoot, { recursive: true });
      await cp(builderRoot, isolationCopy, {
        recursive: true,
        filter: (source) => basename(source) !== ".git",
      });
      verificationRoot = isolationCopy;
    }

    try {
      const { files, outputExcerpt } = await this.#runFullSuite({
        suite,
        verificationRoot,
      });
      const completion = buildCompletionSchema.parse({
        completionId,
        briefId: suite.briefId,
        briefVersion: suite.briefVersion,
        planId: plan.planId,
        planDigest: digestJsonEvidence(plan),
        testSuiteId: suite.testSuiteId,
        testSuiteDigest: digestJsonEvidence(suite),
        projectRoot: builderRoot,
        mainCommitSha,
        treeDigest,
        builtSliceIds: plan.content.implementationSlices.map(({ id }) => id),
        verification: { files, passed: true, outputExcerpt },
        operatorId: input.operatorId,
        recordedRetroactively: input.retroactive ?? false,
        createdAt: new Date().toISOString(),
      });
      const reference = await this.#store.saveBuildCompletion(completion);
      return { completion, reference };
    } finally {
      if (isolationCopy) {
        await rm(isolationCopy, { recursive: true, force: true });
      }
    }
  }

  async loadCompletion(completionId: string): Promise<BuildCompletion> {
    const stored = await this.#store.load(completionId);
    if (stored.kind !== "build-completion") {
      throw new Error(`Artifact ${completionId} is not a build completion.`);
    }
    return stored.artifact;
  }

  async #runFullSuite(context: {
    suite: Awaited<ReturnType<TestDesignService["loadTestSuite"]>>;
    verificationRoot: string;
  }): Promise<{
    files: BuildCompletion["verification"]["files"];
    outputExcerpt: string;
  }> {
    const { suite, verificationRoot } = context;
    const scopeFailures: string[] = [];

    for (const file of suite.content.testFiles) {
      if (file.visibility === "visible") {
        try {
          const onDisk = await readFile(
            join(verificationRoot, file.path),
            "utf8",
          );
          if (onDisk !== file.content) {
            scopeFailures.push(
              `Visible test file ${file.path} does not match the approved suite.`,
            );
          }
        } catch {
          scopeFailures.push(`Visible test file ${file.path} is missing.`);
        }
      } else {
        try {
          await readFile(join(verificationRoot, file.path), "utf8");
          scopeFailures.push(
            `Holdout test file ${file.path} is present before verification.`,
          );
        } catch {
          // Absent is correct.
        }
      }
    }
    if (scopeFailures.length > 0) {
      throw new Error(
        `Cannot record completion; scope check failed: ${scopeFailures.join(" ")}`,
      );
    }

    const files: BuildCompletion["verification"]["files"] = [];
    const visibleOutputs: string[] = [];
    const failures: string[] = [];
    const materialized: string[] = [];
    try {
      for (const file of suite.content.testFiles) {
        if (file.visibility === "holdout") {
          const target = join(verificationRoot, file.path);
          await mkdir(dirname(target), { recursive: true });
          await writeFile(target, file.content, "utf8");
          materialized.push(target);
        }
      }
      for (const file of suite.content.testFiles) {
        const run = await this.#runner.runTestFile({
          projectRoot: verificationRoot,
          testFile: file.path,
        });
        files.push({
          path: file.path,
          visibility: file.visibility,
          exitCode: run.exitCode,
          passed: run.passed,
        });
        if (file.visibility === "visible") {
          visibleOutputs.push(`--- ${file.path}\n${run.output}`);
        }
        if (!run.passed) failures.push(file.path);
      }
    } finally {
      for (const target of materialized) {
        await rm(target, { force: true });
      }
    }
    if (failures.length > 0) {
      throw new Error(
        `Cannot record completion; the suite is not green: ${failures.join(", ")} failed.`,
      );
    }
    return {
      files,
      outputExcerpt: visibleOutputs.join("\n").slice(0, MAXIMUM_EXCERPT_BYTES),
    };
  }

  async #carriedSliceIds(plan: {
    evolvesFromCompletionId?: string | undefined;
    sliceDispositions?:
      | { sliceId: string; disposition: "carried" | "delta" }[]
      | undefined;
  }): Promise<Set<string>> {
    const carried = new Set<string>();
    if (!plan.evolvesFromCompletionId) return carried;
    const stored = await this.#store.load(plan.evolvesFromCompletionId);
    if (stored.kind !== "build-completion") {
      throw new Error(
        `Artifact ${plan.evolvesFromCompletionId} is not a build completion.`,
      );
    }
    const built = new Set(stored.artifact.builtSliceIds);
    for (const { sliceId, disposition } of plan.sliceDispositions ?? []) {
      if (disposition !== "carried") continue;
      if (!built.has(sliceId)) {
        throw new Error(
          `Chain integrity failure: slice ${sliceId} is marked carried but is not in completion ${stored.artifact.completionId}'s built set.`,
        );
      }
      carried.add(sliceId);
    }
    return carried;
  }

  async #approvedSliceIds(testSuiteId: string): Promise<Set<string>> {
    const approved = new Set<string>();
    const { artifacts } = await this.#store.list({
      kind: "submission-decision",
      limit: 500,
    });
    for (const summary of artifacts) {
      const stored = await this.#store.load(summary.id);
      if (stored.kind !== "submission-decision") continue;
      if (stored.artifact.decision !== "approve") continue;
      if (stored.artifact.testSuiteId !== testSuiteId) continue;
      approved.add(stored.artifact.sliceId);
    }
    return approved;
  }
}
