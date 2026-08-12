import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ArchitectService } from "../src/foundry/architectService.js";
import { FoundryArtifactStore } from "../src/foundry/foundryArtifactStore.js";
import { intakeTurnRecordSchema } from "../src/foundry/intakeTurn.js";
import type { IntakeSessionController } from "../src/foundry/intakeSessionController.js";
import { sliceSubmissionSchema } from "../src/foundry/sliceSubmission.js";
import { WorkOrderService } from "../src/foundry/workOrderService.js";
import {
  buildAgentWebServer,
  type FoundryActionServices,
} from "../src/web/agentWebServer.js";
import {
  buildFoundryChainView,
  buildFoundryProjectIndex,
  type FoundryChainView,
} from "../src/web/foundryChainView.js";
import { createConsoleTestService } from "./helpers/consoleTestService.js";
import {
  persistBriefOnly,
  persistDanglingSuite,
  persistFoundryChain,
} from "./helpers/foundryWebFixture.js";
import { chainDependencies } from "./workOrder.test.js";

const createdDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    createdDirectories.map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
  createdDirectories.length = 0;
});

async function temporaryStore(): Promise<FoundryArtifactStore> {
  const directory = await mkdtemp(join(tmpdir(), "foundry-web-"));
  createdDirectories.push(directory);
  return new FoundryArtifactStore(directory);
}

describe("buildFoundryChainView", () => {
  it("derives stage statuses, revision lineage, and build slice rows", async () => {
    const store = await temporaryStore();
    const chain = await persistFoundryChain(store);

    const view = await buildFoundryChainView(store, chain.fixture.brief.briefId);
    expect(view).not.toBeNull();
    const resolved = view as FoundryChainView;

    expect(resolved.title).toBe("Habit tracker");
    expect(resolved.status).toBe("approved");
    expect(resolved.briefVersions).toHaveLength(1);
    expect(resolved.briefVersions[0]!.artifactId).toBe(chain.briefArtifactId);

    // Plans are newest-first: plan B (approved, with lineage) then plan A
    // (revision-requested).
    expect(resolved.plans.map(({ planId }) => planId)).toEqual([
      chain.planBId,
      chain.planAId,
    ]);
    expect(resolved.plans[0]!.status).toBe("approved");
    expect(resolved.plans[0]!.revisedFromArtifactId).toBe(chain.planAId);
    // The mapping-type summary is what lets the operator catch the
    // all-manual defect at the approval gate.
    expect(resolved.plans[0]!.mappingTestTypes).toEqual({ integration: 4 });
    expect(resolved.plans[1]!.status).toBe("revision-requested");
    expect(resolved.plans[1]!.decisions[0]!.requestedRevisions).toEqual([
      "Set every acceptance mapping testType to integration.",
    ]);

    expect(resolved.capabilityPlans).toHaveLength(1);
    expect(resolved.capabilityPlans[0]!.status).toBe("approved");
    expect(resolved.testSuites).toHaveLength(1);
    expect(resolved.testSuites[0]!.status).toBe("approved");

    // Suite files are summarized without content.
    const files = resolved.testSuites[0]!.files;
    expect(files).toHaveLength(3);
    expect(files.some((file) => file.visibility === "holdout")).toBe(true);
    expect(JSON.stringify(files)).not.toContain("describe(");

    const build = resolved.build;
    expect(build).not.toBeNull();
    expect(build!.anchorTestSuiteId).toBe(chain.testSuiteId);
    expect(build!.planAvailable).toBe(true);
    expect(build!.approvedSliceCount).toBe(1);
    expect(build!.slices).toHaveLength(2);
    expect(build!.slices[0]!.status).toBe("approved");
    expect(build!.slices[0]!.submissions[0]!.scopeCheck.passed).toBe(true);
    expect(build!.slices[0]!.submissions[0]!.decisions[0]!.operatorId).toBe(
      "rashad",
    );
    expect(build!.slices[1]!.status).toBe("not-started");
  });

  it("computes the operator's next step from chain state", async () => {
    // Brief-only chain, no decisions: the next step is deciding the brief.
    const store = await temporaryStore();
    const { briefId } = await persistBriefOnly(store);
    const briefOnly = await buildFoundryChainView(store, briefId);
    expect(briefOnly!.nextStep).toMatchObject({
      kind: "decide",
      anchor: "brief",
    });
    expect(briefOnly!.nextStep.headline).toMatch(/Decide on brief v1/);

    // Full approved chain: the fixture's build has unbuilt slices with no
    // outstanding orders — the next step is issuing a work order, with the
    // server-built request attached.
    const fullStore = await temporaryStore();
    const chain = await persistFoundryChain(fullStore);
    const full = await buildFoundryChainView(
      fullStore,
      chain.fixture.brief.briefId,
    );
    const step = full!.nextStep;
    expect(["run", "decide", "blocked", "form", "done"]).toContain(step.kind);
    if (step.kind === "run") {
      expect(step.action).not.toBeNull();
      expect(step.action!.endpoint).toMatch(/^\/api\/foundry\//);
    }
  });

  it("exposes criterion changes between brief versions (Decision 088)", async () => {
    const store = await temporaryStore();
    const carried = {
      id: randomUUID(),
      text: "Stable behavior.",
      source: "user-stated" as const,
      verification: "Run and check.",
    };
    const rewritten = {
      id: randomUUID(),
      text: "Old wording.",
      source: "user-stated" as const,
      verification: "Old check.",
    };
    const { createInitialProjectBrief, createNextBriefVersion, briefContentOf } =
      await import("../src/foundry/projectBrief.js");
    const v1 = createInitialProjectBrief({
      title: "Evolving",
      ideaSummary: "A project taking new requirements.",
      acceptanceCriteria: [carried, rewritten],
      createdAt: "2026-08-07T09:00:00.000Z",
    });
    const v1Reference = await store.saveProjectBrief(v1);
    const v2 = createNextBriefVersion({
      previous: v1,
      previousArtifactId: v1Reference.id,
      updated: {
        ...briefContentOf(v1),
        acceptanceCriteria: [
          carried,
          { ...rewritten, text: "New wording." },
          {
            id: randomUUID(),
            text: "Brand new behavior.",
            source: "user-stated" as const,
            verification: "Run and verify.",
          },
        ],
      },
    });
    await store.saveProjectBrief(v2);

    const view = await buildFoundryChainView(store, v1.briefId);
    const versionTwo = view!.briefVersions.find(({ version }) => version === 2);
    expect(versionTwo?.criterionChanges).toEqual({
      added: ["Brand new behavior."],
      changed: ["New wording."],
      retired: [],
    });
    const versionOne = view!.briefVersions.find(({ version }) => version === 1);
    expect(versionOne?.criterionChanges).toBeUndefined();
  });

  it("sources intake questions from the latest turn record, not the brief", async () => {
    const store = await temporaryStore();
    const { briefId, briefArtifactId } = await persistBriefOnly(store);
    // The controller validates answers against the TURN's question ids;
    // the brief's openQuestions live in a different id space. Regression
    // for the live-demo failure "Answer references unknown question".
    const turnQuestionId = randomUUID();
    await store.saveIntakeTurnRecord(
      intakeTurnRecordSchema.parse({
        turnId: randomUUID(),
        briefId,
        turnNumber: 1,
        maxTurns: 10,
        agentRunArtifactId: null,
        operatorAnswers: [],
        resultingBriefVersion: 1,
        resultingBriefArtifactId: briefArtifactId,
        nextQuestions: [
          {
            id: turnQuestionId,
            question: "Which folders are in scope?",
            targetEntryIds: [],
            intent: "elicit-new",
          },
        ],
        openIssues: [],
        status: "awaiting-answers",
        startedAt: "2026-08-06T10:00:00.000Z",
        completedAt: "2026-08-06T10:00:05.000Z",
      }),
    );

    const view = await buildFoundryChainView(store, briefId);
    expect(view!.intakeQuestions).toEqual([
      { id: turnQuestionId, question: "Which folders are in scope?" },
    ]);
    expect(view!.intakeTurnCount).toBe(1);
    expect(view!.intakeCanContinue).toBe(true);
  });

  it("keeps the interview continuable when a turn asks no questions", async () => {
    const store = await temporaryStore();
    const { briefId, briefArtifactId } = await persistBriefOnly(store);
    // Observed live: the model can return awaiting-answers with ZERO next
    // questions (stalling on stale brief openQuestions). The operator must
    // still be able to send a context-only instruction turn.
    await store.saveIntakeTurnRecord(
      intakeTurnRecordSchema.parse({
        turnId: randomUUID(),
        briefId,
        turnNumber: 1,
        maxTurns: 10,
        agentRunArtifactId: null,
        operatorAnswers: [],
        resultingBriefVersion: 1,
        resultingBriefArtifactId: briefArtifactId,
        nextQuestions: [],
        openIssues: [],
        status: "awaiting-answers",
        startedAt: "2026-08-06T10:00:00.000Z",
        completedAt: "2026-08-06T10:00:05.000Z",
      }),
    );

    const view = await buildFoundryChainView(store, briefId);
    expect(view!.intakeQuestions).toEqual([]);
    expect(view!.intakeCanContinue).toBe(true);
  });

  it("handles a brief-only chain and unknown brief ids", async () => {
    const store = await temporaryStore();
    const { briefId } = await persistBriefOnly(store);

    const view = await buildFoundryChainView(store, briefId);
    expect(view).not.toBeNull();
    expect(view!.status).toBe("draft");
    expect(view!.plans).toEqual([]);
    expect(view!.build).toBeNull();
    expect(view!.buildNote).toMatch(/no approved test suite/i);

    expect(await buildFoundryChainView(store, "does-not-exist")).toBeNull();
  });

  it("tolerates an approved suite whose plan is missing from the store", async () => {
    const store = await temporaryStore();
    const dangling = await persistDanglingSuite(store);

    const view = await buildFoundryChainView(store, dangling.briefId);
    expect(view).not.toBeNull();
    expect(view!.build).not.toBeNull();
    expect(view!.build!.planAvailable).toBe(false);
    expect(view!.build!.slices).toEqual([]);
    expect(view!.buildNote).toMatch(/plan that is not in the store/i);
  });
});

describe("buildFoundryProjectIndex", () => {
  it("lists projects newest-activity-first with stage summaries", async () => {
    const store = await temporaryStore();
    const chain = await persistFoundryChain(store);
    const briefOnly = await persistBriefOnly(store);

    const index = await buildFoundryProjectIndex(store);
    expect(index.projects).toHaveLength(2);
    expect(index.projects[0]!.briefId).toBe(chain.fixture.brief.briefId);
    expect(index.projects[0]!.stages).toEqual({
      plan: "approved",
      capability: "approved",
      tests: "approved",
      build: { approved: 1, total: 2 },
    });
    expect(index.projects[1]!.briefId).toBe(briefOnly.briefId);
    expect(index.projects[1]!.stages.plan).toBe("missing");
    expect(index.projects[1]!.stages.build).toBeNull();
    expect(index.rejected).toEqual([]);
  });
});

describe("foundry web routes", () => {
  it("serves the index, chain, artifact list, and raw artifacts without an API key", async () => {
    const store = await temporaryStore();
    const chain = await persistFoundryChain(store);
    const { service } = await createConsoleTestService(false);
    const app = await buildAgentWebServer({
      service,
      apiKeyConfigured: false,
      foundry: store,
    });

    const index = await app.inject({ method: "GET", url: "/api/foundry/projects" });
    expect(index.statusCode).toBe(200);
    expect(index.json()).toMatchObject({
      projects: [{ briefId: chain.fixture.brief.briefId, title: "Habit tracker" }],
    });

    const chainResponse = await app.inject({
      method: "GET",
      url: `/api/foundry/projects/${chain.fixture.brief.briefId}`,
    });
    expect(chainResponse.statusCode).toBe(200);
    expect(chainResponse.json()).toMatchObject({
      status: "approved",
      build: { approvedSliceCount: 1 },
    });

    const list = await app.inject({
      method: "GET",
      url: `/api/foundry/artifacts?kind=work-order&briefId=${chain.fixture.brief.briefId}`,
    });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toMatchObject({
      artifacts: [{ id: chain.workOrderId, kind: "work-order" }],
    });

    const raw = await app.inject({
      method: "GET",
      url: `/api/foundry/artifacts/${chain.briefArtifactId}`,
    });
    expect(raw.statusCode).toBe(200);
    expect(raw.json()).toMatchObject({
      kind: "project-brief",
      artifact: { title: "Habit tracker" },
    });

    await app.close();
  });

  it("serves the model-matrix index and detail, 404 on an unknown id", async () => {
    const directory = await mkdtemp(join(tmpdir(), "matrix-routes-"));
    createdDirectories.push(directory);
    const matrixId = "33333333-3333-3333-3333-333333333333";
    await writeFile(
      join(directory, `model-matrix-${matrixId}.json`),
      JSON.stringify({
        matrixId,
        agentId: "project-intake",
        agentVersion: "0.6.0",
        execution: { repetitions: 1, concurrency: 1 },
        models: ["gpt-5.4", "gpt-5.4-mini"],
        completedAt: "2026-08-11T23:41:51.332Z",
        cells: [
          { model: "gpt-5.4", status: "ok", passed: true, passRate: 1, totalRuns: 4, passedRuns: 4, totalTokens: 100, avgTokensPerRun: 25, estimatedCostUsd: 0.2, avgLatencyMs: 1700, evaluationArtifactId: "eval-a", error: null },
          { model: "gpt-5.4-mini", status: "ok", passed: false, passRate: 0.5, totalRuns: 4, passedRuns: 2, totalTokens: 90, avgTokensPerRun: 22, estimatedCostUsd: 0.05, avgLatencyMs: 1500, evaluationArtifactId: "eval-b", error: null },
        ],
      }),
    );

    const { service } = await createConsoleTestService(false);
    const app = await buildAgentWebServer({
      service,
      apiKeyConfigured: false,
      matrixRunsDirectory: directory,
    });

    try {
      const index = await app.inject({ method: "GET", url: "/api/foundry/matrices" });
      expect(index.statusCode).toBe(200);
      expect(index.json()).toMatchObject({
        matrices: [{ matrixId, agentId: "project-intake", modelsPassing: 1, hasTriage: false }],
      });

      const detail = await app.inject({ method: "GET", url: `/api/foundry/matrices/${matrixId}` });
      expect(detail.statusCode).toBe(200);
      expect(detail.json()).toMatchObject({
        matrixId,
        summary: { modelsPassing: 1, modelsFailing: 1 },
        cells: [{ model: "gpt-5.4", verdict: "pass" }, { model: "gpt-5.4-mini", verdict: "fail", lowestCost: true }],
      });

      const missing = await app.inject({ method: "GET", url: "/api/foundry/matrices/nope" });
      expect(missing.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  it("rejects bad queries and unknown resources with the house error shape", async () => {
    const store = await temporaryStore();
    await persistBriefOnly(store);
    const { service } = await createConsoleTestService(false);
    const app = await buildAgentWebServer({
      service,
      apiKeyConfigured: false,
      foundry: store,
    });

    const badKind = await app.inject({
      method: "GET",
      url: "/api/foundry/artifacts?kind=nonsense",
    });
    expect(badKind.statusCode).toBe(400);
    expect(badKind.json()).toEqual({ error: "Unsupported foundry artifact kind." });

    const badLimit = await app.inject({
      method: "GET",
      url: "/api/foundry/artifacts?limit=zero",
    });
    expect(badLimit.statusCode).toBe(400);

    const unknownBrief = await app.inject({
      method: "GET",
      url: "/api/foundry/projects/00000000-0000-4000-8000-000000000000",
    });
    expect(unknownBrief.statusCode).toBe(404);
    expect(unknownBrief.json()).toMatchObject({ error: expect.stringContaining("Unknown foundry project") });

    const unknownArtifact = await app.inject({
      method: "GET",
      url: "/api/foundry/artifacts/00000000-0000-4000-8000-000000000000",
    });
    expect(unknownArtifact.statusCode).toBe(404);

    await app.close();
  });

  it("records operator decisions with gates enforced by the constructors", async () => {
    const store = await temporaryStore();
    const chain = await persistFoundryChain(store);
    const briefOnly = await persistBriefOnly(store);
    const { service } = await createConsoleTestService(false);
    const app = await buildAgentWebServer({
      service,
      apiKeyConfigured: false,
      foundry: store,
    });

    // Approve the undecided brief from the browser-facing route.
    const approve = await app.inject({
      method: "POST",
      url: `/api/foundry/briefs/${briefOnly.briefId}/versions/1/decisions`,
      payload: {
        decision: "approve",
        operatorId: "rashad",
        rationale: "Brief is complete.",
      },
    });
    expect(approve.statusCode).toBe(201);
    expect(approve.json()).toMatchObject({
      decision: { decision: "approve", operatorId: "rashad", briefId: briefOnly.briefId },
    });
    const refreshed = await buildFoundryChainView(store, briefOnly.briefId);
    expect(refreshed!.status).toBe("approved");

    // A failed submission cannot be approved, but can be sent to revise.
    const failedSubmission = sliceSubmissionSchema.parse({
      submissionId: randomUUID(),
      workOrderId: chain.workOrderId,
      workOrderDigest: "d".repeat(64),
      testSuiteId: chain.testSuiteId,
      sliceId: chain.fixture.sliceIds.second,
      briefId: chain.fixture.brief.briefId,
      briefVersion: chain.fixture.brief.version,
      projectRoot: "/tmp/generated/example-project",
      scopeCheck: { passed: false, failures: ["Visible test file tampered."] },
      testRun: { files: [], passed: false, outputExcerpt: "" },
      status: "failed",
      createdAt: "2026-08-05T11:00:00.000Z",
    });
    await store.saveSliceSubmission(failedSubmission);

    const blockedApprove = await app.inject({
      method: "POST",
      url: `/api/foundry/submissions/${failedSubmission.submissionId}/decisions`,
      payload: {
        decision: "approve",
        operatorId: "rashad",
        rationale: "Looks fine.",
      },
    });
    expect(blockedApprove.statusCode).toBe(422);
    expect(blockedApprove.json()).toMatchObject({
      error: expect.stringContaining("cannot be approved"),
    });

    const revise = await app.inject({
      method: "POST",
      url: `/api/foundry/submissions/${failedSubmission.submissionId}/decisions`,
      payload: {
        decision: "revise",
        operatorId: "rashad",
        rationale: "Restore the tampered acceptance test.",
        requestedRevisions: ["Restore acceptance-tests/routing.test.ts."],
      },
    });
    expect(revise.statusCode).toBe(201);

    // Validation and target errors use the house conventions.
    const badBody = await app.inject({
      method: "POST",
      url: `/api/foundry/plans/${chain.planBId}/decisions`,
      payload: { decision: "approve", operatorId: "rashad" },
    });
    expect(badBody.statusCode).toBe(422);

    const reviseWithoutRevisions = await app.inject({
      method: "POST",
      url: `/api/foundry/plans/${chain.planBId}/decisions`,
      payload: { decision: "revise", operatorId: "rashad", rationale: "Needs work." },
    });
    expect(reviseWithoutRevisions.statusCode).toBe(422);

    const unknownPlan = await app.inject({
      method: "POST",
      url: "/api/foundry/plans/00000000-0000-4000-8000-000000000000/decisions",
      payload: { decision: "approve", operatorId: "rashad", rationale: "x" },
    });
    expect(unknownPlan.statusCode).toBe(404);

    const wrongKind = await app.inject({
      method: "POST",
      url: `/api/foundry/plans/${chain.testSuiteId}/decisions`,
      payload: { decision: "approve", operatorId: "rashad", rationale: "x" },
    });
    expect(wrongKind.statusCode).toBe(404);
    expect(wrongKind.json()).toMatchObject({
      error: expect.stringContaining("is not a architecture-plan"),
    });

    await app.close();
  });

  it("routes builder questions to the operator and answers back (Decision 090)", async () => {
    const store = await temporaryStore();
    const chain = await persistFoundryChain(store);
    const questionId = randomUUID();
    await store.saveBuilderQuestion({
      questionId,
      workOrderId: chain.workOrderId,
      testSuiteId: chain.testSuiteId,
      sliceId: chain.fixture.sliceIds.second,
      briefId: chain.fixture.brief.briefId,
      briefVersion: chain.fixture.brief.version,
      question: "The contract names no exit code for stale batch ids — skip with exit 0?",
      createdAt: new Date().toISOString(),
    });

    // The question outranks everything else in the build ladder.
    const before = await buildFoundryChainView(store, chain.fixture.brief.briefId);
    expect(before!.build!.unansweredQuestionCount).toBe(1);
    expect(before!.nextStep.kind).toBe("answer");
    expect(before!.nextStep.headline).toContain("builder");

    const { service } = await createConsoleTestService(false);
    const app = await buildAgentWebServer({
      service,
      apiKeyConfigured: false,
      foundry: store,
    });
    const answered = await app.inject({
      method: "POST",
      url: `/api/foundry/questions/${questionId}/answers`,
      payload: { operatorId: "rashad", answer: "Yes — stale ids skip gracefully with exit 0." },
    });
    expect(answered.statusCode).toBe(201);

    const after = await buildFoundryChainView(store, chain.fixture.brief.briefId);
    expect(after!.build!.unansweredQuestionCount).toBe(0);
    expect(after!.nextStep.kind).not.toBe("answer");
    const slice = after!.build!.slices.find(
      ({ sliceId }) => sliceId === chain.fixture.sliceIds.second,
    )!;
    expect(slice.builderQuestions[0]!.answer?.operatorId).toBe("rashad");

    // Only builder-question artifacts accept answers.
    const wrongKindAnswer = await app.inject({
      method: "POST",
      url: `/api/foundry/questions/${chain.testSuiteId}/answers`,
      payload: { operatorId: "rashad", answer: "x" },
    });
    expect(wrongKindAnswer.statusCode).toBe(404);

    await app.close();
  });

  it("prepares builder workspaces server-side and returns the handoff command", async () => {
    const store = await temporaryStore();
    const chain = await persistFoundryChain(store);
    const { service } = await createConsoleTestService(false);
    const prepared: { workOrderId: string; projectRoot: string }[] = [];
    const app = await buildAgentWebServer({
      service,
      apiKeyConfigured: true,
      foundry: store,
      foundryServices: {
        intake: {
          startIntake: () => Promise.reject(new Error("unused")),
          runTurn: () => Promise.reject(new Error("unused")),
        },
        architect: { createPlan: () => Promise.reject(new Error("unused")) },
        capability: {
          createCapabilityPlan: () => Promise.reject(new Error("unused")),
        },
        testDesign: { createTestSuite: () => Promise.reject(new Error("unused")) },
        workOrders: {
          createWorkOrder: () => Promise.reject(new Error("unused")),
          nextSlice: () => Promise.reject(new Error("unused")),
        },
        builderWorkspaces: {
          async prepare(input) {
            prepared.push(input);
            return {
              projectRoot: input.projectRoot,
              writtenTestFiles: ["acceptance-tests/routing.test.ts"],
              writtenConfigFiles: [".claude/settings.json", ".mcp.json", "BUILDER.md"],
            };
          },
        },
      },
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/foundry/work-orders/${chain.workOrderId}/builder-workspace`,
      payload: { projectRoot: " /tmp/generated/example-project " },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.handoffCommand).toBe("cd /tmp/generated/example-project && claude");
    expect(body.builderKickoff).toContain("BUILDER.md");
    // The same leading-space class that broke the gen-3 completion is
    // trimmed here at the boundary.
    expect(prepared[0]!.projectRoot).toBe("/tmp/generated/example-project");

    // Unexpanded ~ nested a real workspace inside the workbench
    // (2026-08-09); the boundary expands it now.
    const tilde = await app.inject({
      method: "POST",
      url: `/api/foundry/work-orders/${chain.workOrderId}/builder-workspace`,
      payload: { projectRoot: "~/generated/tilde-project" },
    });
    expect(tilde.statusCode).toBe(201);
    expect(prepared[1]!.projectRoot.startsWith("/")).toBe(true);
    expect(prepared[1]!.projectRoot.endsWith("/generated/tilde-project")).toBe(true);
    expect(prepared[1]!.projectRoot).not.toContain("~");

    await app.close();
  });

  it("records field reports against a completion and joins them onto the chain view", async () => {
    const store = await temporaryStore();
    const chain = await persistFoundryChain(store);
    const completionId = randomUUID();
    await store.saveBuildCompletion({
      completionId,
      briefId: chain.fixture.brief.briefId,
      briefVersion: chain.fixture.brief.version,
      planId: randomUUID(),
      planDigest: "a".repeat(64),
      testSuiteId: chain.testSuiteId,
      testSuiteDigest: "a".repeat(64),
      projectRoot: "/tmp/generated/example-project",
      mainCommitSha: "b".repeat(40),
      treeDigest: "a".repeat(64),
      builtSliceIds: [chain.fixture.sliceIds.first],
      verification: {
        files: [
          {
            path: "acceptance-tests/routing.test.ts",
            visibility: "visible",
            exitCode: 0,
            passed: true,
          },
        ],
        passed: true,
        outputExcerpt: "ok",
      },
      operatorId: "rashad",
      recordedRetroactively: false,
      createdAt: new Date().toISOString(),
    });

    const { service } = await createConsoleTestService(false);
    const app = await buildAgentWebServer({
      service,
      apiKeyConfigured: false,
      foundry: store,
    });
    const recorded = await app.inject({
      method: "POST",
      url: `/api/foundry/completions/${completionId}/field-reports`,
      payload: {
        operatorId: "rashad",
        report:
          "Cold run on Downloads: labels are PDF plumbing (obj-filter-2) and grouping degenerates to singletons.",
      },
    });
    expect(recorded.statusCode).toBe(201);

    const view = await buildFoundryChainView(store, chain.fixture.brief.briefId);
    const completion = view!.completions.find(
      (entry) => entry.completionId === completionId,
    )!;
    expect(completion.fieldReports).toHaveLength(1);
    expect(completion.fieldReports[0]!.report).toContain("obj-filter-2");
    expect(completion.fieldReports[0]!.operatorId).toBe("rashad");

    // Plan panels expose slice contents with dispositions (ergonomics
    // verdict: operators approved plans without seeing the slices).
    const planView = view!.plans[0]!;
    expect(planView.slices.length).toBeGreaterThan(0);
    expect(planView.slices[0]).toMatchObject({
      title: expect.any(String),
      delivers: expect.any(String),
      disposition: null,
    });

    // Only completions accept field reports.
    const wrongTarget = await app.inject({
      method: "POST",
      url: `/api/foundry/completions/${chain.testSuiteId}/field-reports`,
      payload: { operatorId: "rashad", report: "x" },
    });
    expect(wrongTarget.statusCode).toBe(404);

    await app.close();
  });

  it("refuses decision-class writes without the operator token when one is configured", async () => {
    const store = await temporaryStore();
    const briefOnly = await persistBriefOnly(store);
    const { service } = await createConsoleTestService(false);
    const operatorToken = "test-operator-token-0123456789abcdef";
    const app = await buildAgentWebServer({
      service,
      apiKeyConfigured: false,
      foundry: store,
      operatorToken,
    });

    const url = `/api/foundry/briefs/${briefOnly.briefId}/versions/1/decisions`;
    const payload = {
      decision: "approve",
      operatorId: "rashad",
      rationale: "Brief is complete.",
    };

    // Incident 2026-08-08: possession of localhost is not operator
    // presence. Missing and wrong tokens are refused before any gate.
    const missing = await app.inject({ method: "POST", url, payload });
    expect(missing.statusCode).toBe(401);
    expect(missing.json()).toMatchObject({
      error: expect.stringContaining("operator token"),
    });
    const wrong = await app.inject({
      method: "POST",
      url,
      payload,
      headers: { "x-operator-token": "not-the-token" },
    });
    expect(wrong.statusCode).toBe(401);

    // Reads stay open — the token guards writes, not visibility.
    const read = await app.inject({
      method: "GET",
      url: `/api/foundry/projects/${briefOnly.briefId}`,
    });
    expect(read.statusCode).toBe(200);

    const right = await app.inject({
      method: "POST",
      url,
      payload,
      headers: { "x-operator-token": operatorToken },
    });
    expect(right.statusCode).toBe(201);

    // The Operator page's identity check mirrors the guard.
    const verifyMissing = await app.inject({
      method: "GET",
      url: "/api/operator/verify",
    });
    expect(verifyMissing.statusCode).toBe(401);
    const verifyRight = await app.inject({
      method: "GET",
      url: "/api/operator/verify",
      headers: { "x-operator-token": operatorToken },
    });
    expect(verifyRight.statusCode).toBe(200);
    expect(verifyRight.json()).toEqual({ tokenRequired: true, verified: true });

    await app.close();
  });

  it("runs foundry stages as operations and enforces gates through them", async () => {
    const store = await temporaryStore();
    const chain = await persistFoundryChain(store);
    const { service } = await createConsoleTestService(false);
    const workOrders = new WorkOrderService(chainDependencies(chain.fixture, store));
    const scriptedPlanId = randomUUID();
    const foundryServices: FoundryActionServices = {
      intake: {
        async startIntake(input: { title: string }) {
          return {
            brief: { briefId: randomUUID(), version: 1, openQuestions: [{ id: randomUUID(), question: `About ${input.title}?` }] },
          } as unknown as Awaited<ReturnType<IntakeSessionController["startIntake"]>>;
        },
        async runTurn() {
          throw new Error("No turn scripted.");
        },
      },
      architect: {
        async createPlan(input: { briefId: string; reviseFromId?: string | undefined }) {
          if (input.briefId !== chain.fixture.brief.briefId) {
            throw new Error(`Brief ${input.briefId} is draft; only an approved brief can be planned.`);
          }
          return { plan: { planId: scriptedPlanId } } as unknown as Awaited<
            ReturnType<ArchitectService["createPlan"]>
          >;
        },
      },
      capability: {
        async createCapabilityPlan() {
          throw new Error("Not scripted.");
        },
      },
      testDesign: {
        async createTestSuite() {
          throw new Error("Not scripted.");
        },
      },
      workOrders,
    };

    // Model routes refuse to start without a provider key.
    const withoutKey = await buildAgentWebServer({
      service,
      apiKeyConfigured: false,
      foundry: store,
      foundryServices,
    });
    const refused = await withoutKey.inject({
      method: "POST",
      url: "/api/foundry/plans",
      payload: { briefId: chain.fixture.brief.briefId },
    });
    expect(refused.statusCode).toBe(503);
    await withoutKey.close();

    const app = await buildAgentWebServer({
      service,
      apiKeyConfigured: true,
      foundry: store,
      foundryServices,
    });
    const pollUntilTerminal = async (operationId: string) => {
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const snapshot = await app.inject({
          method: "GET",
          url: `/api/operations/${operationId}`,
        });
        const operation = snapshot.json() as { status: string };
        if (operation.status === "completed" || operation.status === "failed") {
          return operation as { status: string; result?: unknown; error?: string };
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw new Error("Operation did not finish.");
    };

    // A successful stage run resolves to the persisted artifact id.
    const planRun = await app.inject({
      method: "POST",
      url: "/api/foundry/plans",
      payload: { briefId: chain.fixture.brief.briefId },
    });
    expect(planRun.statusCode).toBe(202);
    const planOperation = await pollUntilTerminal(
      (planRun.json() as { operationId: string }).operationId,
    );
    expect(planOperation.status).toBe("completed");
    expect(planOperation.result).toEqual({ planId: scriptedPlanId });

    // A service gate violation surfaces as a failed operation.
    const gated = await app.inject({
      method: "POST",
      url: "/api/foundry/plans",
      payload: { briefId: randomUUID() },
    });
    const gatedOperation = await pollUntilTerminal(
      (gated.json() as { operationId: string }).operationId,
    );
    expect(gatedOperation.status).toBe("failed");
    expect(gatedOperation.error).toMatch(/only an approved brief/i);

    // Intake start reports the new brief and its open questions.
    const intake = await app.inject({
      method: "POST",
      url: "/api/foundry/intake",
      payload: { title: "Note taker", idea: "A note taking CLI." },
    });
    expect(intake.statusCode).toBe(202);
    const intakeOperation = await pollUntilTerminal(
      (intake.json() as { operationId: string }).operationId,
    );
    expect(intakeOperation.status).toBe("completed");
    expect(intakeOperation.result).toMatchObject({ openQuestionCount: 1 });

    const emptyTurn = await app.inject({
      method: "POST",
      url: `/api/foundry/intake/${chain.fixture.brief.briefId}/turns`,
      payload: { answers: [] },
    });
    expect(emptyTurn.statusCode).toBe(422);

    // The deterministic work-order issuer is synchronous: slice 1 is
    // approved in the fixture, so the next order targets slice 2.
    const workOrder = await app.inject({
      method: "POST",
      url: "/api/foundry/work-orders",
      payload: { testSuiteId: chain.testSuiteId },
    });
    expect(workOrder.statusCode).toBe(201);
    expect(workOrder.json()).toMatchObject({
      workOrder: { sliceId: chain.fixture.sliceIds.second },
    });

    await app.close();
  });

  it("does not register foundry routes when the store is absent", async () => {
    const { service } = await createConsoleTestService(false);
    const app = await buildAgentWebServer({ service, apiKeyConfigured: false });

    const response = await app.inject({
      method: "GET",
      url: "/api/foundry/projects",
    });
    // Fastify's default 404 body differs from the house {error} shape;
    // assert on the status code only.
    expect(response.statusCode).toBe(404);

    await app.close();
  });
});
