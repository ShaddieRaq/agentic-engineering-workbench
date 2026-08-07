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

  it("consumes a revise decision through revise-from with lineage", async () => {
    const { service, briefService } = await createHarness({
      async run(request) {
        const brief = (request.input as { brief: never }).brief;
        return {
          artifactId: "agent-run-r",
          run: {
            succeeded: true,
            output: reconcileArchitecturePlanContent(planContentFor(brief), brief),
            failure: null,
          },
        };
      },
    });
    const brief = await approvedBrief(briefService);
    const first = await service.createPlan({ briefId: brief.briefId });

    await expect(
      service.createPlan({
        briefId: brief.briefId,
        reviseFromId: first.plan.planId,
      }),
    ).rejects.toThrowError(/no revise decision to consume/i);

    const revise = await service.recordPlanDecision({
      planId: first.plan.planId,
      decision: "revise",
      operatorId: "operator-1",
      rationale: "Tighten the slices.",
      requestedRevisions: ["Split the largest slice."],
    });
    const second = await service.createPlan({
      briefId: brief.briefId,
      reviseFromId: first.plan.planId,
    });
    expect(second.plan.revisedFromArtifactId).toBe(first.plan.planId);
    expect(second.plan.revisionDecisionId).toBe(revise.decision.decisionId);
  });

  it("runs an evolution round with Workbench-computed dispositions (Decision 088)", async () => {
    const { digestJsonEvidence } = await import(
      "../src/agents/agentEvidenceDigest.js"
    );
    // Chain: approved brief v1 -> approved-shape plan -> completion ->
    // reopen -> brief v2 with a new criterion -> evolution plan.
    let scripted: (input: unknown) => unknown = () => {
      throw new Error("not scripted yet");
    };
    const { service, briefService, store } = await createHarness({
      async run(request) {
        return {
          artifactId: `agent-run-${Math.random().toString(36).slice(2, 8)}`,
          run: {
            succeeded: true,
            output: scripted(request.input),
            failure: null,
          },
        };
      },
    });
    const brief = await approvedBrief(briefService);

    scripted = (input) => {
      const b = (input as { brief: never }).brief;
      return reconcileArchitecturePlanContent(planContentFor(b), b);
    };
    const gen1 = await service.createPlan({ briefId: brief.briefId });
    const builtSliceIds = gen1.plan.content.implementationSlices.map(
      ({ id }) => id,
    );
    const completion = {
      completionId: randomUUID(),
      briefId: brief.briefId,
      briefVersion: brief.version,
      planId: gen1.plan.planId,
      planDigest: digestJsonEvidence(gen1.plan),
      testSuiteId: randomUUID(),
      testSuiteDigest: "a".repeat(64),
      projectRoot: "/tmp/project",
      mainCommitSha: "0123456789abcdef0123456789abcdef01234567",
      treeDigest: "b".repeat(64),
      builtSliceIds,
      verification: {
        files: [
          {
            path: "acceptance-tests/a.test.ts",
            visibility: "visible" as const,
            exitCode: 0,
            passed: true,
          },
        ],
        passed: true,
        outputExcerpt: "green",
      },
      operatorId: "rashad",
      recordedRetroactively: false,
      createdAt: new Date().toISOString(),
    };
    await store.saveBuildCompletion(completion);

    // Evolution refuses while the brief version equals the completion's.
    await expect(
      service.createPlan({
        briefId: brief.briefId,
        evolvesFromCompletionId: completion.completionId,
      }),
    ).rejects.toThrow(/brief version newer than the completion/);

    await briefService.recordDecision({
      briefId: brief.briefId,
      version: brief.version,
      decision: "reopen",
      operatorId: "rashad",
      rationale: "Evolution round.",
    });
    const newCriterion = {
      id: randomUUID(),
      text: "Exports a weekly CSV summary.",
      source: "user-stated" as const,
      verification: "A tester runs export and inspects the CSV.",
    };
    const v2 = await briefService.appendBriefVersion(brief.briefId, {
      title: brief.title,
      ideaSummary: brief.ideaSummary,
      goals: brief.goals,
      users: brief.users,
      constraints: brief.constraints,
      risks: brief.risks,
      nonGoals: brief.nonGoals,
      assumptions: brief.assumptions,
      acceptanceCriteria: [...brief.acceptanceCriteria, newCriterion],
      openQuestions: [],
    });
    await briefService.recordDecision({
      briefId: brief.briefId,
      version: v2.brief.version,
      decision: "approve",
      operatorId: "rashad",
      rationale: "V2 approved.",
    });

    // A plan that ALTERS a built slice is rejected deterministically.
    const alteredSliceId = builtSliceIds[0]!;
    scripted = (input) => {
      const typed = input as {
        brief: never;
        evolution: { priorPlanContent: { implementationSlices: unknown[] } };
      };
      const prior = structuredClone(typed.evolution.priorPlanContent);
      const content = {
        ...prior,
        acceptancePlan: [
          ...(prior as unknown as { acceptancePlan: { criterionId: string }[] })
            .acceptancePlan,
          {
            criterionId: newCriterion.id,
            testType: "integration",
            verificationApproach: "Spawn the CLI and read the CSV.",
            independentOfImplementation: true,
          },
        ],
        implementationSlices: (
          prior as {
            implementationSlices: {
              id: string;
              title: string;
              delivers: string;
              dependsOnSliceIds: string[];
              verifiedByCriterionIds: string[];
            }[];
          }
        ).implementationSlices.map((slice) =>
          slice.id === alteredSliceId
            ? { ...slice, title: "Reworded history" }
            : slice,
        ),
      };
      return { ...content, reconciliation: null };
    };
    await expect(
      service.createPlan({
        briefId: brief.briefId,
        evolvesFromCompletionId: completion.completionId,
      }),
    ).rejects.toThrow(/differ from the prior approved plan/);

    // A faithful evolution plan carries built slices and adds a delta.
    const deltaSliceId = randomUUID();
    scripted = (input) => {
      const typed = input as {
        evolution: {
          priorPlanContent: {
            implementationSlices: { id: string }[];
            acceptancePlan: { criterionId: string }[];
          };
        };
      };
      const prior = structuredClone(typed.evolution.priorPlanContent) as {
        implementationSlices: { id: string }[];
        acceptancePlan: { criterionId: string }[];
        [key: string]: unknown;
      };
      return {
        ...prior,
        acceptancePlan: [
          ...prior.acceptancePlan,
          {
            criterionId: newCriterion.id,
            testType: "integration",
            verificationApproach: "Spawn the CLI and read the CSV.",
            independentOfImplementation: true,
          },
        ],
        implementationSlices: [
          ...prior.implementationSlices,
          {
            id: deltaSliceId,
            title: "Weekly CSV export",
            delivers: "An export command writing the weekly CSV.",
            dependsOnSliceIds: [builtSliceIds[0]!],
            verifiedByCriterionIds: [newCriterion.id],
          },
        ],
        reconciliation: null,
      };
    };
    const evolved = await service.createPlan({
      briefId: brief.briefId,
      evolvesFromCompletionId: completion.completionId,
    });
    expect(evolved.plan.evolvesFromCompletionId).toBe(completion.completionId);
    expect(evolved.plan.briefVersion).toBe(v2.brief.version);
    const dispositions = new Map(
      (evolved.plan.sliceDispositions ?? []).map(
        ({ sliceId, disposition }) => [sliceId, disposition],
      ),
    );
    for (const id of builtSliceIds) {
      expect(dispositions.get(id)).toBe("carried");
    }
    expect(dispositions.get(deltaSliceId)).toBe("delta");
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
