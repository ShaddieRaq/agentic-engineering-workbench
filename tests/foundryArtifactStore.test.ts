import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  FoundryArtifactStore,
  projectBriefArtifactId,
} from "../src/foundry/foundryArtifactStore.js";
import { createInitialProjectBrief } from "../src/foundry/projectBrief.js";
import { createProjectBriefDecision } from "../src/foundry/projectBriefDecision.js";

const createdDirectories: string[] = [];

async function createStore(): Promise<{ store: FoundryArtifactStore; root: string }> {
  const root = await mkdtemp(join(tmpdir(), "foundry-store-"));
  createdDirectories.push(root);
  return { store: new FoundryArtifactStore(root), root };
}

afterEach(async () => {
  await Promise.all(
    createdDirectories.map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
  createdDirectories.length = 0;
});

function brief() {
  return createInitialProjectBrief({
    title: "Recipe planner",
    ideaSummary: "Plan weekly meals from pantry contents.",
  });
}

describe("FoundryArtifactStore", () => {
  it("round-trips a project brief with schema validation", async () => {
    const { store } = await createStore();
    const saved = brief();
    const reference = await store.saveProjectBrief(saved);

    expect(reference.id).toBe(`${saved.briefId}-v1`);
    expect(reference.kind).toBe("project-brief");

    const loaded = await store.load(reference.id);
    expect(loaded.kind).toBe("project-brief");
    expect(loaded.artifact).toEqual(saved);
  });

  it("round-trips a project brief decision", async () => {
    const { store } = await createStore();
    const saved = brief();
    const decision = createProjectBriefDecision({
      brief: saved,
      briefArtifactId: projectBriefArtifactId(saved),
      decision: "reject",
      operatorId: "operator-1",
      rationale: "Out of scope.",
    });
    const reference = await store.saveProjectBriefDecision(decision);

    const loaded = await store.load(reference.id);
    expect(loaded.kind).toBe("project-brief-decision");
    expect(loaded.artifact).toEqual(decision);
  });

  it("refuses to overwrite an existing brief version", async () => {
    const { store } = await createStore();
    const saved = brief();
    await store.saveProjectBrief(saved);

    await expect(store.saveProjectBrief(saved)).rejects.toThrowError(/EEXIST/);
  });

  it("rejects artifact IDs with unsupported characters", async () => {
    const { store } = await createStore();

    await expect(store.load("../escape")).rejects.toThrowError(
      /unsupported characters/i,
    );
  });

  it("reports corrupt artifacts in list rejections", async () => {
    const { store, root } = await createStore();
    const saved = brief();
    await store.saveProjectBrief(saved);
    const corruptPath = join(root, `project-brief-${randomUUID()}-v1.json`);
    await writeFile(corruptPath, "{ not json", "utf8");

    const listed = await store.list();
    expect(listed.artifacts).toHaveLength(1);
    expect(listed.rejected).toHaveLength(1);
    expect(listed.rejected[0]?.path).toBe(corruptPath);
  });

  it("rejects tampered artifacts on load", async () => {
    const { store } = await createStore();
    const saved = brief();
    const reference = await store.saveProjectBrief(saved);

    const raw = JSON.parse(await readFile(reference.path, "utf8")) as Record<
      string,
      unknown
    >;
    raw["version"] = 0;
    await rm(reference.path);
    await writeFile(reference.path, JSON.stringify(raw), "utf8");

    await expect(store.load(reference.id)).rejects.toThrowError();
  });

  it("filters listings by kind and brief ID", async () => {
    const { store } = await createStore();
    const first = brief();
    const second = brief();
    await store.saveProjectBrief(first);
    await store.saveProjectBrief(second);
    await store.saveProjectBriefDecision(
      createProjectBriefDecision({
        brief: first,
        briefArtifactId: projectBriefArtifactId(first),
        decision: "reject",
        operatorId: "operator-1",
        rationale: "Out of scope.",
      }),
    );

    const briefsOnly = await store.list({ kind: "project-brief" });
    expect(briefsOnly.artifacts).toHaveLength(2);

    const firstOnly = await store.list({ briefId: first.briefId });
    expect(firstOnly.artifacts).toHaveLength(2);
    expect(
      firstOnly.artifacts.every(({ briefId }) => briefId === first.briefId),
    ).toBe(true);

    const decisionsOnly = await store.list({ kind: "project-brief-decision" });
    expect(decisionsOnly.artifacts).toHaveLength(1);
  });
});
