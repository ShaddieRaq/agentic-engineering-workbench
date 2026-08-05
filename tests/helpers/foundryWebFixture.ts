import { randomUUID } from "node:crypto";
import { digestJsonEvidence } from "../../src/agents/agentEvidenceDigest.js";
import {
  architecturePlanSchema,
  type ArchitecturePlan,
} from "../../src/foundry/architecturePlan.js";
import { createArchitecturePlanDecision } from "../../src/foundry/architecturePlanDecision.js";
import {
  capabilityPlanSchema,
  type CapabilityPlan,
} from "../../src/foundry/capabilityPlan.js";
import { createCapabilityPlanDecision } from "../../src/foundry/capabilityPlanDecision.js";
import type { FoundryArtifactStore } from "../../src/foundry/foundryArtifactStore.js";
import { createInitialProjectBrief } from "../../src/foundry/projectBrief.js";
import { createProjectBriefDecision } from "../../src/foundry/projectBriefDecision.js";
import {
  createSubmissionDecision,
  sliceSubmissionSchema,
} from "../../src/foundry/sliceSubmission.js";
import { testSuiteSchema, type TestSuite } from "../../src/foundry/testSuite.js";
import { createTestSuiteDecision } from "../../src/foundry/testSuiteDecision.js";
import { BUILDER_INSTRUCTIONS, workOrderSchema } from "../../src/foundry/workOrder.js";
import { chainFixture, type ChainFixture } from "../workOrder.test.js";

export interface PersistedFoundryChain {
  fixture: ChainFixture;
  briefArtifactId: string;
  planAId: string;
  planBId: string;
  capabilityPlanId: string;
  testSuiteId: string;
  workOrderId: string;
  submissionId: string;
}

// Persists a complete, internally-linked chain: approved brief, revised plan A,
// approved plan B carrying revision lineage, approved capability plan whose id
// matches the suite's reference, approved suite rebuilt onto plan B, and a
// slice-1 work order + passed submission + approve decision. Slice 2 is left
// untouched so per-slice status derivation has a not-started case.
export async function persistFoundryChain(
  store: FoundryArtifactStore,
): Promise<PersistedFoundryChain> {
  const fixture = chainFixture();
  const stamp = (index: number): string =>
    `2026-08-05T10:0${index}:00.000Z`;

  const briefReference = await store.saveProjectBrief(fixture.brief);
  await store.saveProjectBriefDecision(
    createProjectBriefDecision({
      brief: fixture.brief,
      briefArtifactId: briefReference.id,
      decision: "approve",
      operatorId: "rashad",
      rationale: "Brief covers the goal.",
      decidedAt: stamp(1),
    }),
  );

  const planA = fixture.plan;
  const planAReference = await store.saveArchitecturePlan(planA);
  const planReviseDecision = createArchitecturePlanDecision({
    plan: planA,
    planArtifactId: planAReference.id,
    decision: "revise",
    operatorId: "rashad",
    rationale: "Acceptance mappings need automated test types.",
    requestedRevisions: ["Set every acceptance mapping testType to integration."],
    decidedAt: stamp(2),
  });
  await store.saveArchitecturePlanDecision(planReviseDecision);

  const planB: ArchitecturePlan = architecturePlanSchema.parse({
    ...planA,
    planId: randomUUID(),
    createdAt: stamp(3),
    revisedFromArtifactId: planAReference.id,
    revisionDecisionId: planReviseDecision.decisionId,
  });
  const planBReference = await store.saveArchitecturePlan(planB);
  await store.saveArchitecturePlanDecision(
    createArchitecturePlanDecision({
      plan: planB,
      planArtifactId: planBReference.id,
      decision: "approve",
      operatorId: "rashad",
      rationale: "Revision applied.",
      decidedAt: stamp(4),
    }),
  );

  const capabilityPlan: CapabilityPlan = capabilityPlanSchema.parse({
    capabilityPlanId: fixture.suite.capabilityPlanId,
    planId: planB.planId,
    planArtifactId: planBReference.id,
    planDigest: "c".repeat(64),
    briefId: fixture.brief.briefId,
    briefVersion: fixture.brief.version,
    agentRunArtifactId: null,
    catalog: { agents: [], tools: [] },
    content: {
      overview: "All slices are ordinary project code.",
      needs: [
        {
          id: randomUUID(),
          need: "Implement the CLI routing and streak logic.",
          resolution: "project-code",
          capabilityId: null,
          rationale: "No existing capability covers project-specific code.",
          relatedSliceIds: [fixture.sliceIds.first, fixture.sliceIds.second],
        },
      ],
      proposedCapabilities: [],
      concerns: [],
    },
    reconciliation: null,
    createdAt: stamp(5),
  });
  const capabilityReference = await store.saveCapabilityPlan(capabilityPlan);
  await store.saveCapabilityPlanDecision(
    createCapabilityPlanDecision({
      capabilityPlan,
      capabilityPlanArtifactId: capabilityReference.id,
      decision: "approve",
      operatorId: "rashad",
      rationale: "Coverage is complete.",
      decidedAt: stamp(6),
    }),
  );

  const suite: TestSuite = testSuiteSchema.parse({
    ...fixture.suite,
    planId: planB.planId,
    createdAt: stamp(7),
  });
  const suiteReference = await store.saveTestSuite(suite);
  await store.saveTestSuiteDecision(
    createTestSuiteDecision({
      testSuite: suite,
      testSuiteArtifactId: suiteReference.id,
      decision: "approve",
      operatorId: "rashad",
      rationale: "Files cover every automated mapping.",
      decidedAt: stamp(8),
    }),
  );

  const firstSlice = planB.content.implementationSlices[0]!;
  const workOrder = workOrderSchema.parse({
    workOrderId: randomUUID(),
    testSuiteId: suite.testSuiteId,
    testSuiteDigest: digestJsonEvidence(suite),
    planId: planB.planId,
    briefId: fixture.brief.briefId,
    briefVersion: fixture.brief.version,
    sliceId: firstSlice.id,
    sliceTitle: firstSlice.title,
    sliceDelivers: firstSlice.delivers,
    dependsOnSliceIds: firstSlice.dependsOnSliceIds,
    criteria: [
      {
        id: fixture.criterionIds[0],
        text: "Criterion 1.",
        verification: "Verify criterion 1 with a fixture.",
      },
    ],
    applicableTestFilePaths: [fixture.filePaths.visibleOnly],
    interfaceContract: suite.content.interfaceContract,
    builderInstructions: BUILDER_INSTRUCTIONS,
    forbiddenPaths: ["acceptance-tests/"],
    createdAt: stamp(9),
  });
  await store.saveWorkOrder(workOrder);

  const submission = sliceSubmissionSchema.parse({
    submissionId: randomUUID(),
    workOrderId: workOrder.workOrderId,
    workOrderDigest: digestJsonEvidence(workOrder),
    testSuiteId: suite.testSuiteId,
    sliceId: firstSlice.id,
    briefId: fixture.brief.briefId,
    briefVersion: fixture.brief.version,
    projectRoot: "/tmp/generated/example-project",
    scopeCheck: { passed: true, failures: [] },
    testRun: {
      files: [
        {
          path: fixture.filePaths.visibleOnly,
          visibility: "visible",
          exitCode: 0,
          passed: true,
        },
      ],
      passed: true,
      outputExcerpt: "PASS acceptance-tests/routing.test.ts",
    },
    status: "passed",
    createdAt: "2026-08-05T10:10:00.000Z",
  });
  await store.saveSliceSubmission(submission);
  await store.saveSubmissionDecision(
    createSubmissionDecision({
      submission,
      decision: "approve",
      operatorId: "rashad",
      rationale: "Scope clean and the applicable file passed.",
      decidedAt: "2026-08-05T10:11:00.000Z",
    }),
  );

  return {
    fixture,
    briefArtifactId: briefReference.id,
    planAId: planA.planId,
    planBId: planB.planId,
    capabilityPlanId: capabilityPlan.capabilityPlanId,
    testSuiteId: suite.testSuiteId,
    workOrderId: workOrder.workOrderId,
    submissionId: submission.submissionId,
  };
}

// A slice-2 work order on top of a persisted chain whose applicable set
// includes every file — visible and holdout — pinned to the STORED suite's
// digest. The redaction test bed for the builder channel.
export async function persistSliceTwoWorkOrder(
  store: FoundryArtifactStore,
  chain: PersistedFoundryChain,
  overrides: { testSuiteDigest?: string; createdAt?: string } = {},
): Promise<{ workOrderId: string }> {
  const storedSuite = await store.load(chain.testSuiteId);
  if (storedSuite.kind !== "test-suite") {
    throw new Error("Fixture chain is missing its test suite.");
  }
  const secondSlice = chain.fixture.plan.content.implementationSlices[1]!;
  const workOrder = workOrderSchema.parse({
    workOrderId: randomUUID(),
    testSuiteId: chain.testSuiteId,
    testSuiteDigest:
      overrides.testSuiteDigest ?? digestJsonEvidence(storedSuite.artifact),
    planId: chain.planBId,
    briefId: chain.fixture.brief.briefId,
    briefVersion: chain.fixture.brief.version,
    sliceId: secondSlice.id,
    sliceTitle: secondSlice.title,
    sliceDelivers: secondSlice.delivers,
    dependsOnSliceIds: secondSlice.dependsOnSliceIds,
    criteria: [
      {
        id: chain.fixture.criterionIds[2],
        text: "Criterion 3.",
        verification: "Verify criterion 3 with a fixture.",
      },
      {
        id: chain.fixture.criterionIds[3],
        text: "Criterion 4.",
        verification: "Verify criterion 4 with a fixture.",
      },
    ],
    applicableTestFilePaths: [
      chain.fixture.filePaths.visibleOnly,
      chain.fixture.filePaths.crossSlice,
      chain.fixture.filePaths.holdout,
    ],
    interfaceContract: chain.fixture.suite.content.interfaceContract,
    builderInstructions: BUILDER_INSTRUCTIONS,
    forbiddenPaths: ["acceptance-tests/"],
    createdAt: overrides.createdAt ?? "2026-08-05T12:00:00.000Z",
  });
  await store.saveWorkOrder(workOrder);
  return { workOrderId: workOrder.workOrderId };
}

// A brief plus an APPROVED suite whose planId references a plan that was
// never persisted — exercises the dangling-anchor tolerance of the chain view.
export async function persistDanglingSuite(
  store: FoundryArtifactStore,
): Promise<{ briefId: string; testSuiteId: string }> {
  const fixture = chainFixture();
  await store.saveProjectBrief(fixture.brief);
  const suiteReference = await store.saveTestSuite(fixture.suite);
  await store.saveTestSuiteDecision(
    createTestSuiteDecision({
      testSuite: fixture.suite,
      testSuiteArtifactId: suiteReference.id,
      decision: "approve",
      operatorId: "rashad",
      rationale: "Approved without its plan being stored.",
      decidedAt: "2026-08-05T09:30:00.000Z",
    }),
  );
  return {
    briefId: fixture.brief.briefId,
    testSuiteId: fixture.suite.testSuiteId,
  };
}

export async function persistBriefOnly(
  store: FoundryArtifactStore,
): Promise<{ briefId: string; briefArtifactId: string }> {
  const brief = createInitialProjectBrief({
    title: "Idea without downstream stages",
    ideaSummary: "A brief that has not been decided or planned yet.",
    createdAt: "2026-08-05T09:00:00.000Z",
  });
  const reference = await store.saveProjectBrief(brief);
  return { briefId: brief.briefId, briefArtifactId: reference.id };
}
