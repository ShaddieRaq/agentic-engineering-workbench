import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FoundryArtifactStore } from "../src/foundry/foundryArtifactStore.js";
import type { BriefEntry, ProjectBrief } from "../src/foundry/projectBrief.js";
import { ProjectBriefService } from "../src/foundry/projectBriefService.js";

const createdDirectories: string[] = [];

async function createService(): Promise<{
  service: ProjectBriefService;
  root: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "foundry-service-"));
  createdDirectories.push(root);
  return { service: new ProjectBriefService(new FoundryArtifactStore(root)), root };
}

afterEach(async () => {
  await Promise.all(
    createdDirectories.map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
  createdDirectories.length = 0;
});

function entry(overrides: Partial<BriefEntry> = {}): BriefEntry {
  return {
    id: randomUUID(),
    text: "Example entry",
    source: "user-stated",
    ...overrides,
  };
}

function updatedFrom(brief: ProjectBrief) {
  return {
    title: brief.title,
    ideaSummary: brief.ideaSummary,
    goals: brief.goals,
    users: brief.users,
    constraints: brief.constraints,
    risks: brief.risks,
    nonGoals: brief.nonGoals,
    assumptions: brief.assumptions,
    acceptanceCriteria: brief.acceptanceCriteria,
    openQuestions: brief.openQuestions,
  };
}

describe("ProjectBriefService", () => {
  it("initiates, appends versions, and verifies lineage", async () => {
    const { service } = await createService();
    const { brief: initial } = await service.initiateBrief({
      title: "Recipe planner",
      ideaSummary: "Plan weekly meals.",
      goals: [entry({ source: "agent-inferred" })],
    });

    const { brief: second } = await service.appendBriefVersion(initial.briefId, {
      ...updatedFrom(initial),
      goals: initial.goals.map((goal) => ({ ...goal, source: "user-stated" })),
    });
    expect(second.version).toBe(2);

    const versions = await service.listBriefVersions(initial.briefId);
    expect(versions.map(({ briefVersion }) => briefVersion)).toEqual([1, 2]);

    const report = await service.verifyLineage(initial.briefId);
    expect(report.valid).toBe(true);
    expect(report.latestVersion).toBe(2);
    expect(report.failures).toEqual([]);
  });

  it("detects a tampered mid-chain brief through digest mismatch", async () => {
    const { service, root } = await createService();
    const { brief: initial, reference } = await service.initiateBrief({
      title: "Recipe planner",
      ideaSummary: "Plan weekly meals.",
      goals: [entry()],
    });
    await service.appendBriefVersion(initial.briefId, updatedFrom(initial));

    const raw = JSON.parse(await readFile(reference.path, "utf8")) as Record<
      string,
      unknown
    >;
    raw["ideaSummary"] = "Tampered summary.";
    await rm(reference.path);
    await writeFile(join(root, `project-brief-${reference.id}.json`), JSON.stringify(raw), "utf8");

    const report = await service.verifyLineage(initial.briefId);
    expect(report.valid).toBe(false);
    expect(report.failures.some(({ reason }) => /digest/i.test(reason))).toBe(true);
  });

  it("derives status from decisions against the latest version", async () => {
    const { service } = await createService();
    const { brief: initial } = await service.initiateBrief({
      title: "Recipe planner",
      ideaSummary: "Plan weekly meals.",
      goals: [entry()],
    });

    expect(await service.deriveBriefStatus(initial.briefId)).toBe("draft");

    await service.recordDecision({
      briefId: initial.briefId,
      version: 1,
      decision: "revise",
      operatorId: "operator-1",
      rationale: "Needs acceptance criteria.",
      requestedRevisions: ["Add acceptance criteria."],
    });
    expect(await service.deriveBriefStatus(initial.briefId)).toBe(
      "revision-requested",
    );

    await service.appendBriefVersion(initial.briefId, {
      ...updatedFrom(initial),
      acceptanceCriteria: [
        {
          id: randomUUID(),
          text: "Weekly plan covers seven days.",
          source: "user-stated",
          verification: "Generate a plan and count the days.",
        },
      ],
    });
    expect(await service.deriveBriefStatus(initial.briefId)).toBe("draft");

    await service.recordDecision({
      briefId: initial.briefId,
      version: 2,
      decision: "approve",
      operatorId: "operator-1",
      rationale: "Complete and checkable.",
    });
    expect(await service.deriveBriefStatus(initial.briefId)).toBe("approved");
  });

  it("blocks approval of a brief with open questions through the service", async () => {
    const { service } = await createService();
    const goal = entry();
    const { brief: initial } = await service.initiateBrief({
      title: "Recipe planner",
      ideaSummary: "Plan weekly meals.",
      goals: [goal],
      openQuestions: [
        {
          id: randomUUID(),
          question: "Which pantry source?",
          relatedEntryIds: [goal.id],
        },
      ],
    });

    await expect(
      service.recordDecision({
        briefId: initial.briefId,
        version: 1,
        decision: "approve",
        operatorId: "operator-1",
        rationale: "Ship it.",
      }),
    ).rejects.toThrowError(/open questions cannot be approved/i);
  });

  it("pins decisions to the exact decided version", async () => {
    const { service } = await createService();
    const { brief: initial } = await service.initiateBrief({
      title: "Recipe planner",
      ideaSummary: "Plan weekly meals.",
      goals: [entry()],
    });
    await service.appendBriefVersion(initial.briefId, updatedFrom(initial));

    const { decision } = await service.recordDecision({
      briefId: initial.briefId,
      version: 1,
      decision: "reject",
      operatorId: "operator-1",
      rationale: "Original version rejected.",
    });

    expect(decision.briefVersion).toBe(1);
    expect(decision.briefArtifactId).toBe(`${initial.briefId}-v1`);
  });
});
