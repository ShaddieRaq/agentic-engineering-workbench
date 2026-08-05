import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FoundryArtifactStore } from "../src/foundry/foundryArtifactStore.js";
import {
  SubmissionService,
  type SubmissionTestRunner,
} from "../src/foundry/submissionService.js";
import { WorkOrderService } from "../src/foundry/workOrderService.js";
import {
  approveSliceInStore,
  chainDependencies,
  chainFixture,
  type ChainFixture,
} from "./workOrder.test.js";

const createdDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    createdDirectories.map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
  createdDirectories.length = 0;
});

interface RunnerScript {
  failing?: Set<string>;
}

function scriptedRunner(script: RunnerScript = {}): {
  runner: SubmissionTestRunner;
  ranFiles: string[];
  presentDuringRun: Map<string, boolean>;
} {
  const ranFiles: string[] = [];
  const presentDuringRun = new Map<string, boolean>();
  return {
    ranFiles,
    presentDuringRun,
    runner: {
      async runTestFile({ projectRoot, testFile }) {
        ranFiles.push(testFile);
        presentDuringRun.set(
          testFile,
          await access(join(projectRoot, testFile)).then(
            () => true,
            () => false,
          ),
        );
        const failed = script.failing?.has(testFile) ?? false;
        return {
          exitCode: failed ? 1 : 0,
          passed: !failed,
          output: failed ? `FAIL ${testFile}` : `PASS ${testFile}`,
        };
      },
    },
  };
}

async function submissionHarness(options: {
  fixture?: ChainFixture;
  script?: RunnerScript;
} = {}) {
  const fixture = options.fixture ?? chainFixture();
  const storeDirectory = await mkdtemp(join(tmpdir(), "submission-store-"));
  const projectRoot = await mkdtemp(join(tmpdir(), "submission-project-"));
  createdDirectories.push(storeDirectory, projectRoot);

  const store = new FoundryArtifactStore(storeDirectory);
  const workOrders = new WorkOrderService(chainDependencies(fixture, store));
  const { runner, ranFiles, presentDuringRun } = scriptedRunner(options.script);
  const submissions = new SubmissionService({
    workOrders,
    testDesign: {
      async loadTestSuite() {
        return fixture.suite;
      },
    },
    store,
    runner,
  });
  return {
    fixture,
    store,
    workOrders,
    submissions,
    projectRoot,
    ranFiles,
    presentDuringRun,
  };
}

async function issueSliceOneWorkOrder(
  harness: Awaited<ReturnType<typeof submissionHarness>>,
) {
  const { workOrder } = await harness.workOrders.createWorkOrder({
    testSuiteId: harness.fixture.suite.testSuiteId,
    sliceId: harness.fixture.sliceIds.first,
  });
  await harness.workOrders.materializeVisibleTests({
    workOrderId: workOrder.workOrderId,
    projectRoot: harness.projectRoot,
  });
  return workOrder;
}

describe("SubmissionService.submitSlice", () => {
  it("passes a clean slice-1 submission running only applicable files", async () => {
    const harness = await submissionHarness();
    const workOrder = await issueSliceOneWorkOrder(harness);

    const { submission } = await harness.submissions.submitSlice({
      workOrderId: workOrder.workOrderId,
      projectRoot: harness.projectRoot,
    });

    expect(submission.scopeCheck).toEqual({ passed: true, failures: [] });
    expect(submission.status).toBe("passed");
    expect(submission.testRun.files).toEqual([
      {
        path: harness.fixture.filePaths.visibleOnly,
        visibility: "visible",
        exitCode: 0,
        passed: true,
      },
    ]);
    expect(harness.ranFiles).toEqual([harness.fixture.filePaths.visibleOnly]);

    const stored = await harness.store.load(submission.submissionId);
    expect(stored.kind).toBe("slice-submission");
  });

  it("records a scope failure when a visible test file is tampered with", async () => {
    const harness = await submissionHarness();
    const workOrder = await issueSliceOneWorkOrder(harness);
    await writeFile(
      join(harness.projectRoot, harness.fixture.filePaths.visibleOnly),
      "// weakened test\n",
      "utf8",
    );

    const { submission } = await harness.submissions.submitSlice({
      workOrderId: workOrder.workOrderId,
      projectRoot: harness.projectRoot,
    });

    expect(submission.status).toBe("failed");
    expect(submission.scopeCheck.passed).toBe(false);
    expect(submission.scopeCheck.failures.join(" ")).toMatch(
      /does not match the approved suite/i,
    );
    // A failed scope check must block the run entirely.
    expect(submission.testRun.files).toEqual([]);
    expect(harness.ranFiles).toEqual([]);
  });

  it("flags unexpected files and pre-existing holdouts under acceptance-tests/", async () => {
    const harness = await submissionHarness();
    const workOrder = await issueSliceOneWorkOrder(harness);
    await writeFile(
      join(harness.projectRoot, "acceptance-tests/extra.test.ts"),
      "// smuggled\n",
      "utf8",
    );
    await writeFile(
      join(harness.projectRoot, harness.fixture.filePaths.holdout),
      "// leaked holdout\n",
      "utf8",
    );

    const { submission } = await harness.submissions.submitSlice({
      workOrderId: workOrder.workOrderId,
      projectRoot: harness.projectRoot,
    });

    expect(submission.status).toBe("failed");
    const failures = submission.scopeCheck.failures.join(" ");
    expect(failures).toMatch(/unexpected file under acceptance-tests\/: acceptance-tests\/extra\.test\.ts/i);
    expect(failures).toMatch(/holdout test file .* present in the project before verification/i);
  });

  it("materializes applicable holdouts for the run and removes them after", async () => {
    const harness = await submissionHarness();
    await approveSliceInStore(
      harness.fixture,
      harness.store,
      harness.fixture.sliceIds.first,
    );
    const { workOrder } = await harness.workOrders.createWorkOrder({
      testSuiteId: harness.fixture.suite.testSuiteId,
      sliceId: harness.fixture.sliceIds.second,
    });
    await harness.workOrders.materializeVisibleTests({
      workOrderId: workOrder.workOrderId,
      projectRoot: harness.projectRoot,
    });

    const { submission } = await harness.submissions.submitSlice({
      workOrderId: workOrder.workOrderId,
      projectRoot: harness.projectRoot,
    });

    expect(submission.status).toBe("passed");
    expect(submission.testRun.files.map(({ path }) => path).sort()).toEqual(
      [
        harness.fixture.filePaths.crossSlice,
        harness.fixture.filePaths.holdout,
        harness.fixture.filePaths.visibleOnly,
      ].sort(),
    );
    // The holdout existed while its test ran, and is gone afterwards.
    expect(
      harness.presentDuringRun.get(harness.fixture.filePaths.holdout),
    ).toBe(true);
    await expect(
      readFile(
        join(harness.projectRoot, harness.fixture.filePaths.holdout),
        "utf8",
      ),
    ).rejects.toThrowError();
  });

  it("fails the submission when any applicable file fails", async () => {
    const fixture = chainFixture();
    const harness = await submissionHarness({
      fixture,
      script: { failing: new Set([fixture.filePaths.visibleOnly]) },
    });
    const workOrder = await issueSliceOneWorkOrder(harness);

    const { submission } = await harness.submissions.submitSlice({
      workOrderId: workOrder.workOrderId,
      projectRoot: harness.projectRoot,
    });

    expect(submission.status).toBe("failed");
    expect(submission.scopeCheck.passed).toBe(true);
    expect(submission.testRun.passed).toBe(false);
    expect(submission.testRun.files).toEqual([
      {
        path: fixture.filePaths.visibleOnly,
        visibility: "visible",
        exitCode: 1,
        passed: false,
      },
    ]);
    expect(submission.testRun.outputExcerpt).toMatch(/FAIL/);
  });

  it("refuses to verify against a suite that no longer matches the pinned digest", async () => {
    const harness = await submissionHarness();
    const workOrder = await issueSliceOneWorkOrder(harness);

    harness.fixture.suite.content.interfaceContract =
      "A silently different contract.";

    await expect(
      harness.submissions.submitSlice({
        workOrderId: workOrder.workOrderId,
        projectRoot: harness.projectRoot,
      }),
    ).rejects.toThrowError(/chain integrity/i);
  });
});

describe("SubmissionService.recordSubmissionDecision", () => {
  it("blocks approval of a failed submission and allows revise", async () => {
    const harness = await submissionHarness();
    const workOrder = await issueSliceOneWorkOrder(harness);
    await writeFile(
      join(harness.projectRoot, harness.fixture.filePaths.visibleOnly),
      "// weakened test\n",
      "utf8",
    );
    const { submission } = await harness.submissions.submitSlice({
      workOrderId: workOrder.workOrderId,
      projectRoot: harness.projectRoot,
    });

    await expect(
      harness.submissions.recordSubmissionDecision({
        submissionId: submission.submissionId,
        decision: "approve",
        operatorId: "rashad",
        rationale: "Looks fine to me.",
      }),
    ).rejects.toThrowError(/did not pass cannot be approved/i);

    const revise = await harness.submissions.recordSubmissionDecision({
      submissionId: submission.submissionId,
      decision: "revise",
      operatorId: "rashad",
      rationale: "Restore the acceptance test to the approved content.",
      requestedRevisions: ["Restore acceptance-tests/routing.test.ts."],
    });
    expect(revise.decision.decision).toBe("revise");
  });

  it("approves a passed submission with a digest-pinned decision", async () => {
    const harness = await submissionHarness();
    const workOrder = await issueSliceOneWorkOrder(harness);
    const { submission } = await harness.submissions.submitSlice({
      workOrderId: workOrder.workOrderId,
      projectRoot: harness.projectRoot,
    });

    const { decision } = await harness.submissions.recordSubmissionDecision({
      submissionId: submission.submissionId,
      decision: "approve",
      operatorId: "rashad",
      rationale: "Scope clean and all applicable tests passed.",
    });

    expect(decision.decision).toBe("approve");
    expect(decision.sliceId).toBe(harness.fixture.sliceIds.first);
    expect(decision.submissionDigest).toMatch(/^[a-f0-9]{64}$/);

    // The approval unlocks the dependent slice's work order.
    const next = await harness.workOrders.nextSlice({
      testSuiteId: harness.fixture.suite.testSuiteId,
    });
    expect(next?.sliceId).toBe(harness.fixture.sliceIds.second);
  });
});
