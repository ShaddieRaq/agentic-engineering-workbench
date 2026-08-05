import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ArchitectService } from "../src/foundry/architectService.js";
import { reconcileArchitecturePlanContent } from "../src/foundry/architectureReconciliation.js";
import { reconcileCapabilityPlanContent } from "../src/foundry/capabilityReconciliation.js";
import { CapabilityService } from "../src/foundry/capabilityService.js";
import { FoundryArtifactStore } from "../src/foundry/foundryArtifactStore.js";
import { ProjectBriefService } from "../src/foundry/projectBriefService.js";
import {
  TestDesignService,
  type TestDesignAgentRunService,
} from "../src/foundry/testDesignService.js";
import { reconcileTestSuiteContent } from "../src/foundry/testSuiteReconciliation.js";
import { briefWithCriteria, planContentFor } from "./architecturePlan.test.js";
import { capabilityContentFor, catalogFixture } from "./capabilityPlan.test.js";
import { suiteContentFor } from "./testSuite.test.js";

const createdDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    createdDirectories.map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
  createdDirectories.length = 0;
});

async function createHarness(options: { withBlockingConcern?: boolean } = {}) {
  const root = await mkdtemp(join(tmpdir(), "test-design-service-"));
  createdDirectories.push(root);
  const store = new FoundryArtifactStore(root);
  const briefService = new ProjectBriefService(store);
  const architect = new ArchitectService({
    agentService: {
      async run(request) {
        const brief = (request.input as { brief: never }).brief;
        return {
          artifactId: "architect-run-1",
          run: {
            succeeded: true,
            output: reconcileArchitecturePlanContent(planContentFor(brief), brief),
            failure: null,
          },
        };
      },
    },
    briefService,
    store,
  });
  const capability = new CapabilityService({
    agentService: {
      async run(request) {
        const { plan, catalog } = request.input as { plan: never; catalog: never };
        return {
          artifactId: "capability-run-1",
          run: {
            succeeded: true,
            output: reconcileCapabilityPlanContent(
              capabilityContentFor(plan),
              plan,
              catalog,
            ),
            failure: null,
          },
        };
      },
    },
    architect,
    store,
    catalogFactory: catalogFixture,
  });
  const capturedInputs: unknown[] = [];
  const testDesignRunner: TestDesignAgentRunService = {
    async run(request) {
      capturedInputs.push(request.input);
      const { brief, plan } = request.input as { brief: never; plan: never };
      const content = suiteContentFor(brief);
      if (options.withBlockingConcern) {
        content.concerns.push({
          id: randomUUID(),
          description: "One criterion cannot be tested as specified.",
          severity: "blocking",
          relatedCriterionIds: [],
        });
      }
      return {
        artifactId: "test-design-run-1",
        run: {
          succeeded: true,
          output: reconcileTestSuiteContent(content, brief, plan),
          failure: null,
        },
      };
    },
  };
  const testDesign = new TestDesignService({
    agentService: testDesignRunner,
    capability,
    architect,
    briefs: briefService,
    store,
  });
  return { store, briefService, architect, capability, testDesign, capturedInputs };
}

async function approvedCapabilityPlan(harness: {
  briefService: ProjectBriefService;
  architect: ArchitectService;
  capability: CapabilityService;
}) {
  const template = briefWithCriteria();
  const { brief } = await harness.briefService.initiateBrief({
    title: template.title,
    ideaSummary: template.ideaSummary,
    goals: template.goals,
    acceptanceCriteria: template.acceptanceCriteria,
  });
  await harness.briefService.recordDecision({
    briefId: brief.briefId,
    version: brief.version,
    decision: "approve",
    operatorId: "operator-1",
    rationale: "Complete.",
  });
  const { plan } = await harness.architect.createPlan({ briefId: brief.briefId });
  await harness.architect.recordPlanDecision({
    planId: plan.planId,
    decision: "approve",
    operatorId: "operator-1",
    rationale: "Buildable.",
  });
  const { capabilityPlan } = await harness.capability.createCapabilityPlan({
    planId: plan.planId,
  });
  return capabilityPlan;
}

describe("TestDesignService", () => {
  it("refuses to design tests for an unapproved capability plan", async () => {
    const harness = await createHarness();
    const capabilityPlan = await approvedCapabilityPlan(harness);

    await expect(
      harness.testDesign.createTestSuite({
        capabilityPlanId: capabilityPlan.capabilityPlanId,
      }),
    ).rejects.toThrowError(/only an approved capability plan/i);
  });

  it("designs tests for an approved chain and pins digests", async () => {
    const harness = await createHarness();
    const capabilityPlan = await approvedCapabilityPlan(harness);
    await harness.capability.recordCapabilityDecision({
      capabilityPlanId: capabilityPlan.capabilityPlanId,
      decision: "approve",
      operatorId: "operator-1",
      rationale: "Mapped fully.",
    });

    const saved = await harness.testDesign.createTestSuite({
      capabilityPlanId: capabilityPlan.capabilityPlanId,
    });
    expect(saved.testSuite.capabilityPlanId).toBe(
      capabilityPlan.capabilityPlanId,
    );
    expect(saved.testSuite.planId).toBe(capabilityPlan.planId);
    expect(saved.testSuite.agentRunArtifactId).toBe("test-design-run-1");

    const listed = await harness.store.list({ kind: "test-suite" });
    expect(listed.artifacts).toHaveLength(1);
  });

  it("consumes a revise decision through revise-from with lineage", async () => {
    const harness = await createHarness();
    const capabilityPlan = await approvedCapabilityPlan(harness);
    await harness.capability.recordCapabilityDecision({
      capabilityPlanId: capabilityPlan.capabilityPlanId,
      decision: "approve",
      operatorId: "operator-1",
      rationale: "Mapped fully.",
    });
    const first = await harness.testDesign.createTestSuite({
      capabilityPlanId: capabilityPlan.capabilityPlanId,
    });

    await expect(
      harness.testDesign.createTestSuite({
        capabilityPlanId: capabilityPlan.capabilityPlanId,
        reviseFromId: first.testSuite.testSuiteId,
      }),
    ).rejects.toThrowError(/no revise decision to consume/i);

    const revise = await harness.testDesign.recordTestSuiteDecision({
      testSuiteId: first.testSuite.testSuiteId,
      decision: "revise",
      operatorId: "operator-1",
      rationale: "Fix the hook import.",
      requestedRevisions: ["Import every Vitest hook used."],
    });

    const second = await harness.testDesign.createTestSuite({
      capabilityPlanId: capabilityPlan.capabilityPlanId,
      reviseFromId: first.testSuite.testSuiteId,
    });
    expect(second.testSuite.revisedFromArtifactId).toBe(
      first.testSuite.testSuiteId,
    );
    expect(second.testSuite.revisionDecisionId).toBe(
      revise.decision.decisionId,
    );

    const lastInput = harness.capturedInputs.at(-1) as {
      revision?: { requestedRevisions: string[] };
    };
    expect(lastInput.revision?.requestedRevisions).toEqual([
      "Import every Vitest hook used.",
    ]);
  });

  it("blocks approval on blocking concerns and derives status", async () => {
    const harness = await createHarness({ withBlockingConcern: true });
    const capabilityPlan = await approvedCapabilityPlan(harness);
    await harness.capability.recordCapabilityDecision({
      capabilityPlanId: capabilityPlan.capabilityPlanId,
      decision: "approve",
      operatorId: "operator-1",
      rationale: "Mapped fully.",
    });
    const saved = await harness.testDesign.createTestSuite({
      capabilityPlanId: capabilityPlan.capabilityPlanId,
    });

    await expect(
      harness.testDesign.recordTestSuiteDecision({
        testSuiteId: saved.testSuite.testSuiteId,
        decision: "approve",
        operatorId: "operator-1",
        rationale: "Ship it.",
      }),
    ).rejects.toThrowError(/blocking concerns cannot be approved/i);

    await harness.testDesign.recordTestSuiteDecision({
      testSuiteId: saved.testSuite.testSuiteId,
      decision: "revise",
      operatorId: "operator-1",
      rationale: "Resolve the untestable criterion.",
      requestedRevisions: ["Address the blocking testability concern."],
    });
    expect(
      await harness.testDesign.deriveTestSuiteStatus(saved.testSuite.testSuiteId),
    ).toBe("revision-requested");
  });
});
