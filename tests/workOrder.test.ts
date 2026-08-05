import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { digestJsonEvidence } from "../src/agents/agentEvidenceDigest.js";
import type { ArchitecturePlan } from "../src/foundry/architecturePlan.js";
import { FoundryArtifactStore } from "../src/foundry/foundryArtifactStore.js";
import { createInitialProjectBrief } from "../src/foundry/projectBrief.js";
import {
  createSubmissionDecision,
  sliceSubmissionSchema,
} from "../src/foundry/sliceSubmission.js";
import { testSuiteSchema, type TestSuite } from "../src/foundry/testSuite.js";
import { workOrderSchema } from "../src/foundry/workOrder.js";
import {
  WorkOrderService,
  type WorkOrderDependencies,
} from "../src/foundry/workOrderService.js";
import { validTestFileContent } from "./testSuite.test.js";

const createdDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    createdDirectories.map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
  createdDirectories.length = 0;
});

export interface ChainFixture {
  brief: ReturnType<typeof createInitialProjectBrief>;
  plan: ArchitecturePlan;
  suite: TestSuite;
  sliceIds: { first: string; second: string };
  criterionIds: [string, string, string, string];
  filePaths: { visibleOnly: string; crossSlice: string; holdout: string };
}

// A two-slice chain: slice 1 verifies criteria 1-2, slice 2 (depending on
// slice 1) verifies criteria 3-4. One visible file covers criterion 1, one
// visible file spans criteria 2-3 across the slices, one holdout covers 4.
export function chainFixture(): ChainFixture {
  const criterionIds: [string, string, string, string] = [
    randomUUID(),
    randomUUID(),
    randomUUID(),
    randomUUID(),
  ];
  const brief = createInitialProjectBrief({
    title: "Habit tracker",
    ideaSummary: "A CLI habit tracker.",
    goals: [
      { id: randomUUID(), text: "Track daily habits.", source: "user-stated" },
    ],
    acceptanceCriteria: criterionIds.map((id, index) => ({
      id,
      text: `Criterion ${index + 1}.`,
      source: "user-stated" as const,
      verification: `Verify criterion ${index + 1} with a fixture.`,
    })),
  });

  const firstSliceId = randomUUID();
  const secondSliceId = randomUUID();
  const plan: ArchitecturePlan = {
    planId: randomUUID(),
    briefId: brief.briefId,
    briefVersion: brief.version,
    briefArtifactId: `${brief.briefId}-v${brief.version}`,
    briefDigest: "a".repeat(64),
    agentRunArtifactId: null,
    content: {
      overview: "A small CLI with local JSON persistence.",
      components: [
        {
          id: randomUUID(),
          name: "Habit store",
          responsibility: "Persist habits in a local JSON file.",
          dependsOnComponentIds: [],
        },
      ],
      decisions: [
        {
          id: randomUUID(),
          decision: "Use a single local JSON file for persistence.",
          rationale: "Matches the local-only constraint in the brief.",
          relatedBriefEntryIds: [brief.goals[0]!.id],
        },
      ],
      acceptancePlan: brief.acceptanceCriteria.map((criterion) => ({
        criterionId: criterion.id,
        testType: "integration" as const,
        verificationApproach: `Automated check: ${criterion.verification}`,
        independentOfImplementation: true,
      })),
      implementationSlices: [
        {
          id: firstSliceId,
          title: "Command routing",
          delivers: "CLI shell that routes commands.",
          dependsOnSliceIds: [],
          verifiedByCriterionIds: [criterionIds[0], criterionIds[1]],
        },
        {
          id: secondSliceId,
          title: "Streak tracking",
          delivers: "Streak computation over the stored history.",
          dependsOnSliceIds: [firstSliceId],
          verifiedByCriterionIds: [criterionIds[2], criterionIds[3]],
        },
      ],
      concerns: [],
    },
    reconciliation: null,
    createdAt: "2026-08-05T00:00:00.000Z",
  };

  const filePaths = {
    visibleOnly: "acceptance-tests/routing.test.ts",
    crossSlice: "acceptance-tests/history.test.ts",
    holdout: "acceptance-tests/holdout-streaks.test.ts",
  };
  const suite = testSuiteSchema.parse({
    testSuiteId: randomUUID(),
    capabilityPlanId: randomUUID(),
    capabilityPlanDigest: "b".repeat(64),
    planId: plan.planId,
    briefId: brief.briefId,
    briefVersion: brief.version,
    agentRunArtifactId: null,
    content: {
      interfaceContract:
        "CLI invoked as `node ./dist/index.js <command>`; exit code 0 on success.",
      testFiles: [
        {
          path: filePaths.visibleOnly,
          content: validTestFileContent(),
          visibility: "visible" as const,
          coveredCriterionIds: [criterionIds[0]],
          testType: "integration" as const,
        },
        {
          path: filePaths.crossSlice,
          content: validTestFileContent(),
          visibility: "visible" as const,
          coveredCriterionIds: [criterionIds[1], criterionIds[2]],
          testType: "integration" as const,
        },
        {
          path: filePaths.holdout,
          content: validTestFileContent(),
          visibility: "holdout" as const,
          coveredCriterionIds: [criterionIds[3]],
          testType: "integration" as const,
        },
      ],
      manualChecks: [],
      concerns: [],
    },
    reconciliation: null,
    createdAt: "2026-08-05T00:00:00.000Z",
  });

  return {
    brief,
    plan,
    suite,
    sliceIds: { first: firstSliceId, second: secondSliceId },
    criterionIds,
    filePaths,
  };
}

export function chainDependencies(
  fixture: ChainFixture,
  store: FoundryArtifactStore,
  options: {
    suiteStatus?: "draft" | "approved" | "rejected" | "revision-requested";
  } = {},
): WorkOrderDependencies {
  return {
    testDesign: {
      async loadTestSuite() {
        return fixture.suite;
      },
      async deriveTestSuiteStatus() {
        return options.suiteStatus ?? "approved";
      },
    },
    architect: {
      async loadPlan() {
        return fixture.plan;
      },
    },
    briefs: {
      async loadBrief() {
        return fixture.brief;
      },
    },
    store,
  };
}

export async function approveSliceInStore(
  fixture: ChainFixture,
  store: FoundryArtifactStore,
  sliceId: string,
): Promise<void> {
  const submission = sliceSubmissionSchema.parse({
    submissionId: randomUUID(),
    workOrderId: randomUUID(),
    workOrderDigest: "c".repeat(64),
    testSuiteId: fixture.suite.testSuiteId,
    sliceId,
    briefId: fixture.brief.briefId,
    briefVersion: fixture.brief.version,
    projectRoot: "/tmp/example-project",
    scopeCheck: { passed: true, failures: [] },
    testRun: { files: [], passed: true, outputExcerpt: "" },
    status: "passed",
    createdAt: new Date().toISOString(),
  });
  await store.saveSliceSubmission(submission);
  await store.saveSubmissionDecision(
    createSubmissionDecision({
      submission,
      decision: "approve",
      operatorId: "rashad",
      rationale: "Verified in fixture.",
    }),
  );
}

async function temporaryStore(): Promise<FoundryArtifactStore> {
  const directory = await mkdtemp(join(tmpdir(), "work-order-"));
  createdDirectories.push(directory);
  return new FoundryArtifactStore(directory);
}

describe("workOrderSchema", () => {
  it("rejects unknown fields", () => {
    const fixture = chainFixture();
    expect(() =>
      workOrderSchema.parse({
        workOrderId: randomUUID(),
        testSuiteId: fixture.suite.testSuiteId,
        testSuiteDigest: digestJsonEvidence(fixture.suite),
        planId: fixture.plan.planId,
        briefId: fixture.brief.briefId,
        briefVersion: 1,
        sliceId: fixture.sliceIds.first,
        sliceTitle: "Command routing",
        sliceDelivers: "CLI shell.",
        dependsOnSliceIds: [],
        criteria: [],
        applicableTestFilePaths: [],
        interfaceContract: "CLI.",
        builderInstructions: ["Implement to the contract."],
        forbiddenPaths: ["acceptance-tests/"],
        createdAt: new Date().toISOString(),
        surprise: true,
      }),
    ).toThrowError(/unrecognized/i);
  });
});

describe("WorkOrderService.createWorkOrder", () => {
  it("refuses to issue work orders from an unapproved suite", async () => {
    const fixture = chainFixture();
    const store = await temporaryStore();
    const service = new WorkOrderService(
      chainDependencies(fixture, store, { suiteStatus: "draft" }),
    );

    await expect(
      service.createWorkOrder({
        testSuiteId: fixture.suite.testSuiteId,
        sliceId: fixture.sliceIds.first,
      }),
    ).rejects.toThrowError(/draft.*approved suite/i);
  });

  it("assembles slice 1 with only the fully-due test files", async () => {
    const fixture = chainFixture();
    const store = await temporaryStore();
    const service = new WorkOrderService(chainDependencies(fixture, store));

    const { workOrder } = await service.createWorkOrder({
      testSuiteId: fixture.suite.testSuiteId,
      sliceId: fixture.sliceIds.first,
    });

    // The cross-slice file covers criterion 3, which is not due until slice 2
    // is in scope, and the holdout covers criterion 4 — both excluded.
    expect(workOrder.applicableTestFilePaths).toEqual([
      fixture.filePaths.visibleOnly,
    ]);
    expect(workOrder.testSuiteDigest).toBe(digestJsonEvidence(fixture.suite));
    expect(workOrder.criteria.map(({ id }) => id)).toEqual([
      fixture.criterionIds[0],
      fixture.criterionIds[1],
    ]);
    expect(workOrder.criteria[0]!.text).toBe("Criterion 1.");
    expect(workOrder.forbiddenPaths).toEqual(["acceptance-tests/"]);
    expect(workOrder.builderInstructions.length).toBeGreaterThan(3);

    const stored = await store.load(workOrder.workOrderId);
    expect(stored.kind).toBe("work-order");
  });

  it("blocks a slice until its dependencies have approved submissions", async () => {
    const fixture = chainFixture();
    const store = await temporaryStore();
    const service = new WorkOrderService(chainDependencies(fixture, store));

    await expect(
      service.createWorkOrder({
        testSuiteId: fixture.suite.testSuiteId,
        sliceId: fixture.sliceIds.second,
      }),
    ).rejects.toThrowError(/no approved submission/i);

    await approveSliceInStore(fixture, store, fixture.sliceIds.first);

    const { workOrder } = await service.createWorkOrder({
      testSuiteId: fixture.suite.testSuiteId,
      sliceId: fixture.sliceIds.second,
    });
    // With slice 1 approved, every criterion is due: all files apply,
    // including the cross-slice visible file and the holdout.
    expect(workOrder.applicableTestFilePaths.sort()).toEqual(
      [
        fixture.filePaths.crossSlice,
        fixture.filePaths.holdout,
        fixture.filePaths.visibleOnly,
      ].sort(),
    );
  });

  it("rejects a slice id that is not in the plan", async () => {
    const fixture = chainFixture();
    const store = await temporaryStore();
    const service = new WorkOrderService(chainDependencies(fixture, store));

    await expect(
      service.createWorkOrder({
        testSuiteId: fixture.suite.testSuiteId,
        sliceId: randomUUID(),
      }),
    ).rejects.toThrowError(/does not exist in plan/i);
  });
});

describe("WorkOrderService.nextSlice", () => {
  it("walks the plan in dependency order and ends with null", async () => {
    const fixture = chainFixture();
    const store = await temporaryStore();
    const service = new WorkOrderService(chainDependencies(fixture, store));

    expect(await service.nextSlice({ testSuiteId: fixture.suite.testSuiteId }))
      .toEqual({ sliceId: fixture.sliceIds.first, sliceTitle: "Command routing" });

    await approveSliceInStore(fixture, store, fixture.sliceIds.first);
    expect(await service.nextSlice({ testSuiteId: fixture.suite.testSuiteId }))
      .toEqual({ sliceId: fixture.sliceIds.second, sliceTitle: "Streak tracking" });

    await approveSliceInStore(fixture, store, fixture.sliceIds.second);
    expect(
      await service.nextSlice({ testSuiteId: fixture.suite.testSuiteId }),
    ).toBeNull();
  });
});

describe("WorkOrderService.materializeVisibleTests", () => {
  it("writes visible files canonically and never the holdout", async () => {
    const fixture = chainFixture();
    const store = await temporaryStore();
    const service = new WorkOrderService(chainDependencies(fixture, store));
    const projectRoot = await mkdtemp(join(tmpdir(), "materialize-"));
    createdDirectories.push(projectRoot);

    const { workOrder } = await service.createWorkOrder({
      testSuiteId: fixture.suite.testSuiteId,
      sliceId: fixture.sliceIds.first,
    });
    const written = await service.materializeVisibleTests({
      workOrderId: workOrder.workOrderId,
      projectRoot,
    });

    expect(written.sort()).toEqual(
      [fixture.filePaths.visibleOnly, fixture.filePaths.crossSlice].sort(),
    );
    const onDisk = await readFile(
      join(projectRoot, fixture.filePaths.visibleOnly),
      "utf8",
    );
    expect(onDisk).toBe(validTestFileContent());
    const entries = await readdir(join(projectRoot, "acceptance-tests"));
    expect(entries).not.toContain("holdout-streaks.test.ts");
  });
});
