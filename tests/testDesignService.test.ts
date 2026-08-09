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
import type { TestSuiteContentShape } from "../src/foundry/testSuite.js";
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

async function createHarness(
  options: {
    withBlockingConcern?: boolean;
    designerScript?: (input: unknown) => TestSuiteContentShape;
    vacuityCheck?: (files: { path: string; content: string }[]) => Promise<string[]>;
  } = {},
) {
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
      const content = options.designerScript
        ? options.designerScript(request.input)
        : suiteContentFor(brief);
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
    ...(options.vacuityCheck ? { vacuityCheck: options.vacuityCheck } : {}),
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
  it("rejects suites whose files pass against an empty project (null-implementation gate)", async () => {
    const flagged: { path: string; content: string }[][] = [];
    const harness = await createHarness({
      vacuityCheck: async (files) => {
        flagged.push(files);
        // Pretend the first file passed in the empty stub project.
        return [files[0]!.path];
      },
    });
    const { capabilityPlanId } = await approvedCapabilityPlan(harness);
    await harness.capability.recordCapabilityDecision({
      capabilityPlanId,
      decision: "approve",
      operatorId: "operator-1",
      rationale: "Coverage complete.",
    });
    await expect(
      harness.testDesign.createTestSuite({ capabilityPlanId }),
    ).rejects.toThrow(/null-implementation gate/);
    // The check received the full suite, holdouts included.
    expect(flagged[0]!.length).toBeGreaterThan(1);

    // A suite with no vacuous files passes through untouched.
    const clean = await createHarness({ vacuityCheck: async () => [] });
    const cleanPlan = await approvedCapabilityPlan(clean);
    await clean.capability.recordCapabilityDecision({
      capabilityPlanId: cleanPlan.capabilityPlanId,
      decision: "approve",
      operatorId: "operator-1",
      rationale: "Coverage complete.",
    });
    const saved = await clean.testDesign.createTestSuite({
      capabilityPlanId: cleanPlan.capabilityPlanId,
    });
    expect(saved.testSuite.testSuiteId).toBeTruthy();
  });

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

  it("runs an evolution round with validated suite succession (Decision 088)", async () => {
    const { digestJsonEvidence } = await import(
      "../src/agents/agentEvidenceDigest.js"
    );
    const harness = await createHarness({
      designerScript: (input) => {
        const typed = input as {
          brief: {
            acceptanceCriteria: { id: string }[];
          };
          evolution?: {
            priorSuiteContent: TestSuiteContentShape;
            newCriterionIds: string[];
            changedCriterionIds: string[];
          };
        };
        if (!typed.evolution) {
          return suiteContentFor(typed.brief as never);
        }
        // Faithful successor: carry unchanged files byte-exact, re-derive
        // files touching changed criteria (mandatory since the stale-carry
        // rule), add a new visible file for the new criterion + one new
        // holdout.
        const newId = typed.evolution.newCriterionIds[0]!;
        const changedIds = new Set(typed.evolution.changedCriterionIds);
        const carried = typed.evolution.priorSuiteContent.testFiles.map((file) =>
          file.coveredCriterionIds.some((id) => changedIds.has(id))
            ? { ...file, content: `${file.content}\n// re-derived\n` }
            : file,
        );
        return {
          ...typed.evolution.priorSuiteContent,
          testFiles: [
            ...carried,
            {
              path: "acceptance-tests/export.test.ts",
              content: carried[0]!.content,
              visibility: "visible" as const,
              coveredCriterionIds: [newId],
              testType: "integration" as const,
            },
            {
              path: "acceptance-tests/export-holdout.test.ts",
              content: carried[0]!.content,
              visibility: "holdout" as const,
              coveredCriterionIds: [newId],
              testType: "integration" as const,
            },
          ],
        };
      },
    });

    // Generation 1: approved chain -> prior suite -> completion.
    const capabilityPlan = await approvedCapabilityPlan(harness);
    await harness.capability.recordCapabilityDecision({
      capabilityPlanId: capabilityPlan.capabilityPlanId,
      decision: "approve",
      operatorId: "rashad",
      rationale: "Mapped.",
    });
    const prior = await harness.testDesign.createTestSuite({
      capabilityPlanId: capabilityPlan.capabilityPlanId,
    });
    const gen1Plan = await harness.architect.loadPlan(capabilityPlan.planId);
    const briefV1 = await harness.briefService.loadBrief(
      capabilityPlan.briefId,
      1,
    );
    const completionId = randomUUID();
    await harness.store.saveBuildCompletion({
      completionId,
      briefId: capabilityPlan.briefId,
      briefVersion: 1,
      planId: gen1Plan.planId,
      planDigest: digestJsonEvidence(gen1Plan),
      testSuiteId: prior.testSuite.testSuiteId,
      testSuiteDigest: digestJsonEvidence(prior.testSuite),
      projectRoot: "/tmp/project",
      mainCommitSha: "0123456789abcdef0123456789abcdef01234567",
      treeDigest: "b".repeat(64),
      builtSliceIds: gen1Plan.content.implementationSlices.map(({ id }) => id),
      verification: {
        files: [
          {
            path: "acceptance-tests/criterion-1.test.ts",
            visibility: "visible",
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
    });

    // Reopen -> v2 (one criterion reworded in place, one new) -> approve.
    await harness.briefService.recordDecision({
      briefId: capabilityPlan.briefId,
      version: 1,
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
    const v2 = await harness.briefService.appendBriefVersion(
      capabilityPlan.briefId,
      {
        title: briefV1.title,
        ideaSummary: briefV1.ideaSummary,
        goals: briefV1.goals,
        users: briefV1.users,
        constraints: briefV1.constraints,
        risks: briefV1.risks,
        nonGoals: briefV1.nonGoals,
        assumptions: briefV1.assumptions,
        acceptanceCriteria: [
          {
            ...briefV1.acceptanceCriteria[0]!,
            text: "A weekly plan covers seven days, Monday first.",
          },
          briefV1.acceptanceCriteria[1]!,
          newCriterion,
        ],
        openQuestions: [],
      },
    );
    await harness.briefService.recordDecision({
      briefId: capabilityPlan.briefId,
      version: v2.brief.version,
      decision: "approve",
      operatorId: "rashad",
      rationale: "V2 approved.",
    });

    // Evolution plan (hand-made, pinned to the completion) -> capability.
    const evolutionPlanContent = planContentFor(v2.brief as never);
    const evolutionPlan = {
      planId: randomUUID(),
      briefId: capabilityPlan.briefId,
      briefVersion: v2.brief.version,
      briefArtifactId: `${capabilityPlan.briefId}-v${v2.brief.version}`,
      briefDigest: digestJsonEvidence(v2.brief),
      agentRunArtifactId: null,
      content: evolutionPlanContent,
      reconciliation: null,
      createdAt: new Date().toISOString(),
      evolvesFromCompletionId: completionId,
    };
    await harness.store.saveArchitecturePlan(evolutionPlan);
    await harness.architect.recordPlanDecision({
      planId: evolutionPlan.planId,
      decision: "approve",
      operatorId: "rashad",
      rationale: "Evolution plan approved.",
    });
    const evolutionCapability = await harness.capability.createCapabilityPlan({
      planId: evolutionPlan.planId,
    });
    await harness.capability.recordCapabilityDecision({
      capabilityPlanId: evolutionCapability.capabilityPlan.capabilityPlanId,
      decision: "approve",
      operatorId: "rashad",
      rationale: "Mapped.",
    });

    const evolved = await harness.testDesign.createTestSuite({
      capabilityPlanId: evolutionCapability.capabilityPlan.capabilityPlanId,
    });
    expect(evolved.testSuite.evolvesFromTestSuiteId).toBe(
      prior.testSuite.testSuiteId,
    );
    const lineage = new Map(
      (evolved.testSuite.fileLineage ?? []).map(({ path, lineage: kind }) => [
        path,
        kind,
      ]),
    );
    expect(lineage.get("acceptance-tests/criterion-1.test.ts")).toBe("revised");
    expect(lineage.get("acceptance-tests/criterion-2.test.ts")).toBe("carried");
    expect(lineage.get("acceptance-tests/export.test.ts")).toBe("new");
    expect(lineage.get("acceptance-tests/export-holdout.test.ts")).toBe("new");
    expect(evolved.testSuite.retiredFilePaths).toEqual([]);
    // The designer received the prior suite and the enumerated diff.
    const evolutionInput = harness.capturedInputs.find(
      (captured) => (captured as { evolution?: unknown }).evolution,
    ) as {
      evolution: {
        requiredHoldoutCount: number;
        changedCriterionIds: string[];
        newCriterionIds: string[];
      };
    };
    expect(evolutionInput.evolution.requiredHoldoutCount).toBe(1);
    expect(evolutionInput.evolution.changedCriterionIds).toEqual([
      briefV1.acceptanceCriteria[0]!.id,
    ]);
    expect(evolutionInput.evolution.newCriterionIds).toEqual([newCriterion.id]);
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
