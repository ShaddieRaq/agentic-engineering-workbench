import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { digestJsonEvidence } from "../src/agents/agentEvidenceDigest.js";
import { buildCompletionSchema } from "../src/foundry/buildCompletion.js";
import {
  BuildCompletionService,
  computeTreeDigest,
  type GitInspector,
} from "../src/foundry/buildCompletionService.js";
import { FoundryArtifactStore } from "../src/foundry/foundryArtifactStore.js";

const COMMIT = "0123456789abcdef0123456789abcdef01234567";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

async function temporaryDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "completion-"));
  roots.push(dir);
  return dir;
}

function scriptedGit(overrides: Partial<GitInspector> = {}): GitInspector {
  return {
    headCommit: async () => COMMIT,
    isClean: async () => true,
    isAncestor: async () => true,
    ...overrides,
  };
}

const VISIBLE_PATH = "acceptance-tests/save.test.ts";
const HOLDOUT_PATH = "acceptance-tests/save-holdout.test.ts";
const VISIBLE_CONTENT = "import { it } from 'vitest';\nit('saves', () => {});\n";
const HOLDOUT_CONTENT = "import { it } from 'vitest';\nit('hidden', () => {});\n";

function suiteFixture() {
  const criterionId = randomUUID();
  const sliceId = randomUUID();
  return {
    criterionId,
    sliceId,
    suite: {
      testSuiteId: randomUUID(),
      capabilityPlanId: randomUUID(),
      capabilityPlanDigest: "b".repeat(64),
      planId: randomUUID(),
      briefId: randomUUID(),
      briefVersion: 3,
      agentRunArtifactId: null,
      content: {
        interfaceContract: "node ./dist/cli.js save; exit 0.",
        testFiles: [
          {
            path: VISIBLE_PATH,
            content: VISIBLE_CONTENT,
            visibility: "visible" as const,
            coveredCriterionIds: [criterionId],
            testType: "integration" as const,
          },
          {
            path: HOLDOUT_PATH,
            content: HOLDOUT_CONTENT,
            visibility: "holdout" as const,
            coveredCriterionIds: [criterionId],
            testType: "integration" as const,
          },
        ],
        manualChecks: [],
        concerns: [],
      },
      reconciliation: null,
      createdAt: "2026-08-07T00:00:00.000Z",
    },
  };
}

function planFixture(suite: ReturnType<typeof suiteFixture>) {
  return {
    planId: suite.suite.planId,
    briefId: suite.suite.briefId,
    briefVersion: suite.suite.briefVersion,
    briefArtifactId: "brief-artifact",
    briefDigest: "c".repeat(64),
    agentRunArtifactId: null,
    content: {
      overview: "One CLI component.",
      components: [
        {
          id: randomUUID(),
          name: "CLI",
          responsibility: "Everything.",
          dependsOnComponentIds: [],
        },
      ],
      decisions: [],
      acceptancePlan: [
        {
          criterionId: suite.criterionId,
          testType: "integration" as const,
          verificationApproach: "Spawn the CLI.",
          independentOfImplementation: true,
        },
      ],
      implementationSlices: [
        {
          id: suite.sliceId,
          title: "Everything",
          delivers: "The CLI.",
          dependsOnSliceIds: [],
          verifiedByCriterionIds: [suite.criterionId],
        },
      ],
      concerns: [],
    },
    reconciliation: null,
    createdAt: "2026-08-07T00:00:00.000Z",
  };
}

async function serviceFixture(options: {
  approveSlice?: boolean;
  git?: GitInspector;
  runnerPasses?: (path: string) => boolean;
} = {}) {
  const storeRoot = await temporaryDir();
  const projectRoot = await temporaryDir();
  const store = new FoundryArtifactStore(storeRoot);
  const fixture = suiteFixture();
  const plan = planFixture(fixture);

  await mkdir(join(projectRoot, "acceptance-tests"), { recursive: true });
  await writeFile(join(projectRoot, VISIBLE_PATH), VISIBLE_CONTENT, "utf8");

  const ranFiles: { path: string; root: string }[] = [];
  const service = new BuildCompletionService({
    testDesign: {
      loadTestSuite: async () => fixture.suite,
      deriveTestSuiteStatus: async () => "approved" as const,
    },
    architect: { loadPlan: async () => plan },
    store,
    runner: {
      async runTestFile({ projectRoot: root, testFile }) {
        ranFiles.push({ path: testFile, root });
        const passed = options.runnerPasses?.(testFile) ?? true;
        return { exitCode: passed ? 0 : 1, passed, output: `ran ${testFile}` };
      },
    },
    git: options.git ?? scriptedGit(),
  });

  if (options.approveSlice !== false) {
    const submissionId = randomUUID();
    await store.saveSubmissionDecision({
      decisionId: randomUUID(),
      submissionId,
      submissionDigest: "d".repeat(64),
      workOrderId: randomUUID(),
      testSuiteId: fixture.suite.testSuiteId,
      sliceId: fixture.sliceId,
      briefId: fixture.suite.briefId,
      briefVersion: fixture.suite.briefVersion,
      decision: "approve",
      operatorId: "rashad",
      rationale: "Verified.",
      requestedRevisions: null,
      decidedAt: "2026-08-07T00:00:00.000Z",
    });
  }

  return { service, store, fixture, plan, projectRoot, ranFiles };
}

describe("buildCompletionSchema", () => {
  it("rejects failing verifications", () => {
    const base = {
      completionId: randomUUID(),
      briefId: randomUUID(),
      briefVersion: 1,
      planId: randomUUID(),
      planDigest: "a".repeat(64),
      testSuiteId: randomUUID(),
      testSuiteDigest: "a".repeat(64),
      projectRoot: "/tmp/project",
      mainCommitSha: COMMIT,
      treeDigest: "a".repeat(64),
      builtSliceIds: [randomUUID()],
      verification: {
        files: [
          {
            path: "acceptance-tests/a.test.ts",
            visibility: "visible",
            exitCode: 1,
            passed: false,
          },
        ],
        passed: false,
        outputExcerpt: "failed",
      },
      operatorId: "rashad",
      recordedRetroactively: false,
      createdAt: "2026-08-07T00:00:00.000Z",
    };
    expect(() => buildCompletionSchema.parse(base)).toThrowError(
      /cannot record a failing verification/,
    );
  });
});

describe("BuildCompletionService", () => {
  it("records a green completion with pinned digests and redacted holdout output", async () => {
    const { service, fixture, plan, projectRoot, ranFiles } =
      await serviceFixture();
    const saved = await service.recordCompletion({
      testSuiteId: fixture.suite.testSuiteId,
      projectRoot,
      operatorId: "rashad",
    });

    expect(saved.completion.mainCommitSha).toBe(COMMIT);
    expect(saved.completion.treeDigest).toBe(
      await computeTreeDigest(projectRoot),
    );
    expect(saved.completion.planDigest).toBe(digestJsonEvidence(plan));
    expect(saved.completion.testSuiteDigest).toBe(
      digestJsonEvidence(fixture.suite),
    );
    expect(saved.completion.builtSliceIds).toEqual([fixture.sliceId]);
    // Both files ran — including the holdout — but only visible output is
    // recorded (Decision 088 redaction).
    expect(ranFiles.map(({ path }) => path).sort()).toEqual(
      [HOLDOUT_PATH, VISIBLE_PATH].sort(),
    );
    expect(saved.completion.verification.files).toHaveLength(2);
    expect(saved.completion.verification.outputExcerpt).toContain(VISIBLE_PATH);
    expect(saved.completion.verification.outputExcerpt).not.toContain(
      HOLDOUT_PATH,
    );
    // The holdout was cleaned out of the verification root afterwards.
    const { readFile } = await import("node:fs/promises");
    await expect(
      readFile(join(projectRoot, HOLDOUT_PATH), "utf8"),
    ).rejects.toThrow();
  });

  it("refuses when a slice lacks an approving submission decision", async () => {
    const { service, fixture, projectRoot } = await serviceFixture({
      approveSlice: false,
    });
    await expect(
      service.recordCompletion({
        testSuiteId: fixture.suite.testSuiteId,
        projectRoot,
        operatorId: "rashad",
      }),
    ).rejects.toThrow(/without an approving submission decision/);
  });

  it("refuses a dirty working tree and a red suite, persisting nothing", async () => {
    const dirty = await serviceFixture({
      git: scriptedGit({ isClean: async () => false }),
    });
    await expect(
      dirty.service.recordCompletion({
        testSuiteId: dirty.fixture.suite.testSuiteId,
        projectRoot: dirty.projectRoot,
        operatorId: "rashad",
      }),
    ).rejects.toThrow(/uncommitted changes/);

    const red = await serviceFixture({
      runnerPasses: (path) => path !== HOLDOUT_PATH,
    });
    await expect(
      red.service.recordCompletion({
        testSuiteId: red.fixture.suite.testSuiteId,
        projectRoot: red.projectRoot,
        operatorId: "rashad",
      }),
    ).rejects.toThrow(/not green/);
    const { artifacts } = await red.store.list({
      kind: "build-completion",
      limit: 10,
    });
    expect(artifacts).toEqual([]);
  });

  it("flags retroactive records and computes stable tree digests", async () => {
    const { service, fixture, projectRoot } = await serviceFixture();
    const before = await computeTreeDigest(projectRoot);
    const saved = await service.recordCompletion({
      testSuiteId: fixture.suite.testSuiteId,
      projectRoot,
      operatorId: "rashad",
      retroactive: true,
    });
    expect(saved.completion.recordedRetroactively).toBe(true);
    // Digest is stable across recomputation and ignores node_modules.
    await mkdir(join(projectRoot, "node_modules", "junk"), { recursive: true });
    await writeFile(
      join(projectRoot, "node_modules", "junk", "index.js"),
      "x",
      "utf8",
    );
    expect(await computeTreeDigest(projectRoot)).toBe(before);
  });
});
