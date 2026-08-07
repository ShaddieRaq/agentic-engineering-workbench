import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { digestJsonEvidence } from "../src/agents/agentEvidenceDigest.js";
import { FoundryArtifactStore } from "../src/foundry/foundryArtifactStore.js";
import { collectStandingAdvisories } from "../src/foundry/standingAdvisories.js";
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

async function temporaryStore(): Promise<FoundryArtifactStore> {
  const directory = await mkdtemp(join(tmpdir(), "advisories-"));
  createdDirectories.push(directory);
  return new FoundryArtifactStore(directory);
}

function concern(severity: "advisory" | "blocking", description: string) {
  return { id: randomUUID(), severity, description, relatedBriefEntryIds: [] };
}

async function persistPlan(
  store: FoundryArtifactStore,
  briefId: string,
  concerns: ReturnType<typeof concern>[],
  options: { approve: boolean; createdAt: string },
): Promise<string> {
  const brief = { ...briefWithCriteria(), briefId };
  const plan = {
    planId: randomUUID(),
    briefId,
    briefVersion: 1,
    briefArtifactId: `${briefId}-v1`,
    briefDigest: "a".repeat(64),
    agentRunArtifactId: null,
    content: { ...planContentFor(brief), concerns },
    reconciliation: null,
    createdAt: options.createdAt,
  };
  await store.saveArchitecturePlan(plan);
  if (options.approve) {
    await store.saveArchitecturePlanDecision({
      decisionId: randomUUID(),
      decision: "approve",
      planId: plan.planId,
      planArtifactId: plan.planId,
      planDigest: digestJsonEvidence(plan),
      briefId,
      briefVersion: 1,
      operatorId: "rashad",
      rationale: "Approved.",
      requestedRevisions: null,
      decidedAt: options.createdAt,
    });
  }
  return plan.planId;
}

describe("collectStandingAdvisories", () => {
  it("collects advisories from approved artifacts only, deduplicated with counts", async () => {
    const store = await temporaryStore();
    const briefId = randomUUID();

    await persistPlan(
      store,
      briefId,
      [
        concern("advisory", "Advisory concern: the similarity metric is unspecified."),
        concern("blocking", "Blocking: mapping is manual."),
      ],
      { approve: true, createdAt: "2026-08-06T10:00:00.000Z" },
    );
    // Second generation repeats the same advisory with different casing
    // plus a new one.
    await persistPlan(
      store,
      briefId,
      [
        concern("advisory", "The similarity metric is unspecified."),
        concern("advisory", "Large-file thresholds are undefined."),
      ],
      { approve: true, createdAt: "2026-08-07T10:00:00.000Z" },
    );
    // Unapproved plans contribute nothing.
    await persistPlan(
      store,
      briefId,
      [concern("advisory", "Draft-only concern that never got approved.")],
      { approve: false, createdAt: "2026-08-07T11:00:00.000Z" },
    );

    const advisories = await collectStandingAdvisories(store, briefId);
    expect(advisories).toHaveLength(2);
    expect(advisories[0]).toMatchObject({
      stage: "architect",
      occurrences: 2,
      firstRecordedAt: "2026-08-06T10:00:00.000Z",
    });
    expect(advisories[0]!.description).toMatch(/similarity metric/);
    expect(advisories[1]).toMatchObject({ occurrences: 1 });
    expect(advisories[1]!.description).toMatch(/Large-file thresholds/);
    // Blocking and unapproved concerns never appear.
    expect(
      advisories.some(({ description }) => /manual|Draft-only/.test(description)),
    ).toBe(false);
  });

  it("returns empty for a brief with no approved artifacts", async () => {
    const store = await temporaryStore();
    expect(await collectStandingAdvisories(store, randomUUID())).toEqual([]);
  });
});
