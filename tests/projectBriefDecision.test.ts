import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { digestJsonEvidence } from "../src/agents/agentEvidenceDigest.js";
import {
  createInitialProjectBrief,
  type BriefEntry,
} from "../src/foundry/projectBrief.js";
import {
  createProjectBriefDecision,
  projectBriefDecisionSchema,
} from "../src/foundry/projectBriefDecision.js";

function entry(overrides: Partial<BriefEntry> = {}): BriefEntry {
  return {
    id: randomUUID(),
    text: "Example entry",
    source: "user-stated",
    ...overrides,
  };
}

function approvableBrief() {
  return createInitialProjectBrief({
    title: "Recipe planner",
    ideaSummary: "Plan weekly meals from pantry contents.",
    goals: [entry()],
  });
}

describe("createProjectBriefDecision", () => {
  it("creates an approval pinned to the exact brief version and digest", () => {
    const brief = approvableBrief();
    const decision = createProjectBriefDecision({
      brief,
      briefArtifactId: `${brief.briefId}-v1`,
      decision: "approve",
      operatorId: "operator-1",
      rationale: "Brief is complete and criteria are checkable.",
    });

    expect(decision.decision).toBe("approve");
    expect(decision.briefId).toBe(brief.briefId);
    expect(decision.briefVersion).toBe(1);
    expect(decision.briefDigest).toBe(digestJsonEvidence(brief));
    expect(decision.requestedRevisions).toBeNull();
  });

  it("creates reject and revise decisions", () => {
    const brief = approvableBrief();

    const reject = createProjectBriefDecision({
      brief,
      briefArtifactId: `${brief.briefId}-v1`,
      decision: "reject",
      operatorId: "operator-1",
      rationale: "The idea is out of scope.",
    });
    expect(reject.decision).toBe("reject");

    const revise = createProjectBriefDecision({
      brief,
      briefArtifactId: `${brief.briefId}-v1`,
      decision: "revise",
      operatorId: "operator-1",
      rationale: "Acceptance criteria are missing.",
      requestedRevisions: ["Add at least one acceptance criterion."],
    });
    expect(revise.requestedRevisions).toHaveLength(1);
  });

  it("blocks approval when the brief has unresolved entries", () => {
    const brief = createInitialProjectBrief({
      title: "Recipe planner",
      ideaSummary: "Plan weekly meals.",
      risks: [entry({ source: "unresolved" })],
    });

    expect(() =>
      createProjectBriefDecision({
        brief,
        briefArtifactId: `${brief.briefId}-v1`,
        decision: "approve",
        operatorId: "operator-1",
        rationale: "Looks fine.",
      }),
    ).toThrowError(/unresolved entries cannot be approved/i);
  });

  it("blocks approval when the brief has open questions", () => {
    const goal = entry();
    const brief = createInitialProjectBrief({
      title: "Recipe planner",
      ideaSummary: "Plan weekly meals.",
      goals: [goal],
      openQuestions: [
        {
          id: randomUUID(),
          question: "Which pantry inventory source?",
          relatedEntryIds: [goal.id],
        },
      ],
    });

    expect(() =>
      createProjectBriefDecision({
        brief,
        briefArtifactId: `${brief.briefId}-v1`,
        decision: "approve",
        operatorId: "operator-1",
        rationale: "Looks fine.",
      }),
    ).toThrowError(/open questions cannot be approved/i);
  });
});

describe("projectBriefDecisionSchema", () => {
  it("rejects a revise decision without requested revisions", () => {
    const brief = approvableBrief();
    const revise = createProjectBriefDecision({
      brief,
      briefArtifactId: `${brief.briefId}-v1`,
      decision: "revise",
      operatorId: "operator-1",
      rationale: "Needs work.",
      requestedRevisions: ["Clarify the users section."],
    });

    expect(() =>
      projectBriefDecisionSchema.parse({ ...revise, requestedRevisions: null }),
    ).toThrowError(/must list the requested revisions/i);
  });

  it("rejects requested revisions on non-revise decisions", () => {
    const brief = approvableBrief();
    const reject = createProjectBriefDecision({
      brief,
      briefArtifactId: `${brief.briefId}-v1`,
      decision: "reject",
      operatorId: "operator-1",
      rationale: "Out of scope.",
    });

    expect(() =>
      projectBriefDecisionSchema.parse({
        ...reject,
        requestedRevisions: ["Should not be here."],
      }),
    ).toThrowError(/only a revise decision/i);
  });

  it("rejects a malformed digest", () => {
    const brief = approvableBrief();
    const decision = createProjectBriefDecision({
      brief,
      briefArtifactId: `${brief.briefId}-v1`,
      decision: "approve",
      operatorId: "operator-1",
      rationale: "Complete.",
    });

    expect(() =>
      projectBriefDecisionSchema.parse({ ...decision, briefDigest: "not-hex" }),
    ).toThrowError();
  });
});
