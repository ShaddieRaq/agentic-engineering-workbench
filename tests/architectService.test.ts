import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ArchitectService,
  type ArchitectAgentRunService,
} from "../src/foundry/architectService.js";
import { reconcileArchitecturePlanContent } from "../src/foundry/architectureReconciliation.js";
import { FoundryArtifactStore } from "../src/foundry/foundryArtifactStore.js";
import { ProjectBriefService } from "../src/foundry/projectBriefService.js";
import { briefWithCriteria, planContentFor } from "./architecturePlan.test.js";

const createdDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    createdDirectories.map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
  createdDirectories.length = 0;
});

async function createHarness(agentService?: ArchitectAgentRunService) {
  const root = await mkdtemp(join(tmpdir(), "architect-service-"));
  createdDirectories.push(root);
  const store = new FoundryArtifactStore(root);
  const briefService = new ProjectBriefService(store);
  const service = new ArchitectService({
    agentService:
      agentService ??
      ({
        async run() {
          throw new Error("No architect run scripted.");
        },
      } satisfies ArchitectAgentRunService),
    briefService,
    store,
  });
  return { service, briefService, store };
}

async function approvedBrief(briefService: ProjectBriefService) {
  const template = briefWithCriteria();
  const { brief } = await briefService.initiateBrief({
    title: template.title,
    ideaSummary: template.ideaSummary,
    goals: template.goals,
    acceptanceCriteria: template.acceptanceCriteria,
  });
  await briefService.recordDecision({
    briefId: brief.briefId,
    version: brief.version,
    decision: "approve",
    operatorId: "operator-1",
    rationale: "Complete and confirmed.",
  });
  return brief;
}

describe("ArchitectService", () => {
  it("refuses to plan from an unapproved brief before any model call", async () => {
    const { service, briefService } = await createHarness();
    const { brief } = await briefService.initiateBrief({
      title: "Unapproved",
      ideaSummary: "Never decided.",
    });

    await expect(
      service.createPlan({ briefId: brief.briefId }),
    ).rejects.toThrowError(/only an approved brief can be planned/i);
  });

  it("plans an approved brief and pins its digest", async () => {
    let plannedBriefId: string | null = null;
    const { service, briefService, store } = await createHarness({
      async run(request) {
        const input = request.input as { brief: { briefId: string } };
        plannedBriefId = input.brief.briefId;
        const brief = (request.input as { brief: never }).brief;
        return {
          artifactId: "agent-run-1",
          run: {
            succeeded: true,
            output: reconcileArchitecturePlanContent(
              planContentFor(brief),
              brief,
            ),
            failure: null,
          },
        };
      },
    });
    const brief = await approvedBrief(briefService);

    const saved = await service.createPlan({ briefId: brief.briefId });
    expect(plannedBriefId).toBe(brief.briefId);
    expect(saved.plan.briefArtifactId).toBe(`${brief.briefId}-v1`);
    expect(saved.plan.agentRunArtifactId).toBe("agent-run-1");

    const listed = await store.list({ kind: "architecture-plan" });
    expect(listed.artifacts).toHaveLength(1);
    expect(listed.artifacts[0]?.briefId).toBe(brief.briefId);
  });

  it("records plan decisions and blocks approval on blocking concerns", async () => {
    const { service, briefService } = await createHarness({
      async run(request) {
        const brief = (request.input as { brief: never }).brief;
        const content = planContentFor(brief);
        content.concerns.push({
          id: randomUUID(),
          description: "The brief has no persistence durability requirement.",
          severity: "blocking",
          relatedBriefEntryIds: [],
        });
        return {
          artifactId: "agent-run-2",
          run: {
            succeeded: true,
            output: reconcileArchitecturePlanContent(content, brief),
            failure: null,
          },
        };
      },
    });
    const brief = await approvedBrief(briefService);
    const saved = await service.createPlan({ briefId: brief.briefId });

    await expect(
      service.recordPlanDecision({
        planId: saved.plan.planId,
        decision: "approve",
        operatorId: "operator-1",
        rationale: "Ship it.",
      }),
    ).rejects.toThrowError(/blocking concerns cannot be approved/i);

    const revised = await service.recordPlanDecision({
      planId: saved.plan.planId,
      decision: "revise",
      operatorId: "operator-1",
      rationale: "Resolve the durability concern.",
      requestedRevisions: ["Address the blocking durability concern."],
    });
    expect(revised.decision.decision).toBe("revise");
    expect(await service.derivePlanStatus(saved.plan.planId)).toBe(
      "revision-requested",
    );
  });
});
