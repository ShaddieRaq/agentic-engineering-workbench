import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FoundryArtifactStore } from "../src/foundry/foundryArtifactStore.js";
import { sliceSubmissionSchema } from "../src/foundry/sliceSubmission.js";
import { buildAgentWebServer } from "../src/web/agentWebServer.js";
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
