import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { digestJsonEvidence } from "../src/agents/agentEvidenceDigest.js";
import {
  computeProvenanceConversion,
  createInitialProjectBrief,
  createNextBriefVersion,
  projectBriefSchema,
  type BriefEntry,
} from "../src/foundry/projectBrief.js";

function entry(overrides: Partial<BriefEntry> = {}): BriefEntry {
  return {
    id: randomUUID(),
    text: "Example entry",
    source: "user-stated",
    ...overrides,
  };
}

describe("projectBriefSchema", () => {
  it("accepts a valid initial brief", () => {
    const brief = createInitialProjectBrief({
      title: "Recipe planner",
      ideaSummary: "Plan weekly meals from pantry contents.",
      goals: [entry()],
    });

    expect(projectBriefSchema.parse(brief)).toEqual(brief);
    expect(brief.version).toBe(1);
    expect(brief.previousVersionArtifactId).toBeNull();
    expect(brief.previousVersionDigest).toBeNull();
  });

  it("rejects unknown keys", () => {
    const brief = createInitialProjectBrief({
      title: "Recipe planner",
      ideaSummary: "Plan weekly meals.",
    });

    expect(() =>
      projectBriefSchema.parse({ ...brief, surprise: true }),
    ).toThrowError();
  });

  it("rejects an initial version that references a previous version", () => {
    const brief = createInitialProjectBrief({
      title: "Recipe planner",
      ideaSummary: "Plan weekly meals.",
    });

    expect(() =>
      projectBriefSchema.parse({
        ...brief,
        previousVersionArtifactId: "some-artifact",
      }),
    ).toThrowError(/initial brief version/i);
  });

  it("rejects a later version without lineage fields", () => {
    const brief = createInitialProjectBrief({
      title: "Recipe planner",
      ideaSummary: "Plan weekly meals.",
    });

    expect(() =>
      projectBriefSchema.parse({ ...brief, version: 2 }),
    ).toThrowError(/must reference its previous version/i);
  });

  it("rejects duplicate entry IDs across sections", () => {
    const duplicated = entry();
    const brief = createInitialProjectBrief({
      title: "Recipe planner",
      ideaSummary: "Plan weekly meals.",
      goals: [duplicated],
    });

    expect(() =>
      projectBriefSchema.parse({ ...brief, risks: [duplicated] }),
    ).toThrowError(/duplicate brief entry id/i);
  });

  it("rejects open questions that reference unknown entries", () => {
    const brief = createInitialProjectBrief({
      title: "Recipe planner",
      ideaSummary: "Plan weekly meals.",
    });

    expect(() =>
      projectBriefSchema.parse({
        ...brief,
        openQuestions: [
          {
            id: randomUUID(),
            question: "Which pantry inventory source?",
            relatedEntryIds: [randomUUID()],
          },
        ],
      }),
    ).toThrowError(/unknown entry/i);
  });
});

describe("createNextBriefVersion", () => {
  it("increments the version, preserves the brief ID, and pins the previous digest", () => {
    const initial = createInitialProjectBrief({
      title: "Recipe planner",
      ideaSummary: "Plan weekly meals.",
      goals: [entry({ source: "agent-inferred" })],
    });

    const next = createNextBriefVersion({
      previous: initial,
      previousArtifactId: `${initial.briefId}-v1`,
      updated: {
        title: initial.title,
        ideaSummary: initial.ideaSummary,
        goals: initial.goals,
        users: [],
        constraints: [],
        risks: [],
        nonGoals: [],
        assumptions: [],
        acceptanceCriteria: [],
        openQuestions: [],
      },
    });

    expect(next.briefId).toBe(initial.briefId);
    expect(next.version).toBe(2);
    expect(next.previousVersionArtifactId).toBe(`${initial.briefId}-v1`);
    expect(next.previousVersionDigest).toBe(digestJsonEvidence(initial));
  });
});

describe("computeProvenanceConversion", () => {
  it("counts conversions to user-stated by stable entry ID", () => {
    const inferred = entry({ source: "agent-inferred" });
    const unresolved = entry({ source: "unresolved" });
    const stable = entry({ source: "user-stated" });

    const previous = createInitialProjectBrief({
      title: "Recipe planner",
      ideaSummary: "Plan weekly meals.",
      goals: [inferred, stable],
      risks: [unresolved],
    });

    const next = createNextBriefVersion({
      previous,
      previousArtifactId: `${previous.briefId}-v1`,
      updated: {
        title: previous.title,
        ideaSummary: previous.ideaSummary,
        goals: [{ ...inferred, source: "user-stated" }, stable],
        users: [entry()],
        constraints: [],
        risks: [{ ...unresolved, source: "user-stated" }],
        nonGoals: [],
        assumptions: [],
        acceptanceCriteria: [],
        openQuestions: [],
      },
    });

    const summary = computeProvenanceConversion(previous, next);
    expect(summary.trackedEntries).toBe(3);
    expect(summary.convertedToUserStated).toBe(2);
    expect(summary.newlyAdded).toBe(1);
    expect(summary.removed).toBe(0);
  });
});
