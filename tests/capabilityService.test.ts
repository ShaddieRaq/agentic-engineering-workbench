import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ArchitectService } from "../src/foundry/architectService.js";
import { reconcileArchitecturePlanContent } from "../src/foundry/architectureReconciliation.js";
import { reconcileCapabilityPlanContent } from "../src/foundry/capabilityReconciliation.js";
import {
  CapabilityService,
  type CapabilityAgentRunService,
} from "../src/foundry/capabilityService.js";
import { FoundryArtifactStore } from "../src/foundry/foundryArtifactStore.js";
import { ProjectBriefService } from "../src/foundry/projectBriefService.js";
import { briefWithCriteria, planContentFor } from "./architecturePlan.test.js";
import { capabilityContentFor, catalogFixture } from "./capabilityPlan.test.js";

const createdDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    createdDirectories.map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
  createdDirectories.length = 0;
});

async function createHarness(options: {
  capabilityRunner?: CapabilityAgentRunService;
  withBlockingConcern?: boolean;
} = {}) {
  const root = await mkdtemp(join(tmpdir(), "capability-service-"));
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
    agentService:
      options.capabilityRunner ??
      ({
        async run(request) {
          const { plan, catalog } = request.input as {
            plan: never;
            catalog: never;
          };
          const content = capabilityContentFor(plan);
          if (options.withBlockingConcern) {
            content.concerns.push({
              id: randomUUID(),
              description: "One slice has no viable capability.",
              severity: "blocking",
              relatedSliceIds: [],
            });
          }
          return {
            artifactId: "capability-run-1",
            run: {
              succeeded: true,
              output: reconcileCapabilityPlanContent(content, plan, catalog),
              failure: null,
            },
          };
        },
      } satisfies CapabilityAgentRunService),
    architect,
    store,
    catalogFactory: catalogFixture,
  });
  return { store, briefService, architect, capability };
}

async function approvedArchitecturePlan(harness: {
  briefService: ProjectBriefService;
  architect: ArchitectService;
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
  return plan;
}

describe("CapabilityService", () => {
  it("refuses to map an unapproved architecture plan", async () => {
    const harness = await createHarness();
    const plan = await approvedArchitecturePlan(harness);

    await expect(
      harness.capability.createCapabilityPlan({ planId: plan.planId }),
    ).rejects.toThrowError(/only an approved plan can be capability-mapped/i);
  });

  it("maps an approved plan and pins its digest with the frozen catalog", async () => {
    const harness = await createHarness();
    const plan = await approvedArchitecturePlan(harness);
    await harness.architect.recordPlanDecision({
      planId: plan.planId,
      decision: "approve",
      operatorId: "operator-1",
      rationale: "Buildable.",
    });

    const saved = await harness.capability.createCapabilityPlan({
      planId: plan.planId,
    });
    expect(saved.capabilityPlan.planId).toBe(plan.planId);
    expect(saved.capabilityPlan.catalog).toEqual(catalogFixture());
    expect(saved.capabilityPlan.agentRunArtifactId).toBe("capability-run-1");

    const listed = await harness.store.list({ kind: "capability-plan" });
    expect(listed.artifacts).toHaveLength(1);
  });

  it("blocks approval on blocking concerns and derives status", async () => {
    const harness = await createHarness({ withBlockingConcern: true });
    const plan = await approvedArchitecturePlan(harness);
    await harness.architect.recordPlanDecision({
      planId: plan.planId,
      decision: "approve",
      operatorId: "operator-1",
      rationale: "Buildable.",
    });
    const saved = await harness.capability.createCapabilityPlan({
      planId: plan.planId,
    });

    await expect(
      harness.capability.recordCapabilityDecision({
        capabilityPlanId: saved.capabilityPlan.capabilityPlanId,
        decision: "approve",
        operatorId: "operator-1",
        rationale: "Ship it.",
      }),
    ).rejects.toThrowError(/blocking concerns cannot be approved/i);

    await harness.capability.recordCapabilityDecision({
      capabilityPlanId: saved.capabilityPlan.capabilityPlanId,
      decision: "revise",
      operatorId: "operator-1",
      rationale: "Resolve the unmapped slice.",
      requestedRevisions: ["Resolve the blocking capability gap."],
    });
    expect(
      await harness.capability.deriveCapabilityPlanStatus(
        saved.capabilityPlan.capabilityPlanId,
      ),
    ).toBe("revision-requested");
  });
});
