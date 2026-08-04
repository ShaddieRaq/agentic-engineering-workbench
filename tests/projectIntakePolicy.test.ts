import { describe, expect, it } from "vitest";
import { digestJsonEvidence } from "../src/agents/agentEvidenceDigest.js";
import { platformAgentRegistry } from "../src/agents/platformAgentRegistry.js";
import {
  projectIntakeBaselinePolicy,
  projectIntakePolicySchema,
} from "../src/agents/projectIntake/projectIntakePolicy.js";
import { buildProjectIntakePrompt } from "../src/agents/projectIntake/projectIntakePrompt.js";
import {
  briefContentOf,
  createInitialProjectBrief,
} from "../src/foundry/projectBrief.js";

function turnInput() {
  return {
    briefContent: briefContentOf(
      createInitialProjectBrief({
        title: "Recipe planner",
        ideaSummary: "Plan weekly meals from pantry contents.",
      }),
    ),
    operatorAnswers: [],
    turnNumber: 1,
    remainingTurns: 4,
  };
}

function patchedPolicy() {
  return projectIntakePolicySchema.parse({
    instructions: {
      ...projectIntakeBaselinePolicy.instructions,
      questionRules: [
        ...projectIntakeBaselinePolicy.instructions.questionRules,
        "Before responding, verify every referenced id exists in your updated brief content.",
      ],
    },
  });
}

describe("projectIntakePolicy", () => {
  it("parses the baseline policy and rejects unknown keys", () => {
    expect(projectIntakePolicySchema.parse(projectIntakeBaselinePolicy)).toEqual(
      projectIntakeBaselinePolicy,
    );
    expect(() =>
      projectIntakePolicySchema.parse({
        instructions: projectIntakeBaselinePolicy.instructions,
        surprise: true,
      }),
    ).toThrowError();
  });

  it("rejects duplicate instruction lines", () => {
    expect(() =>
      projectIntakePolicySchema.parse({
        instructions: {
          ...projectIntakeBaselinePolicy.instructions,
          roleLines: ["Same line.", "Same line."],
        },
      }),
    ).toThrowError(/unique/i);
  });

  it("exposes an instructions-only revision surface", () => {
    const registration = platformAgentRegistry.get("project-intake");
    expect(registration.revisionSurface).toBeDefined();
    expect(registration.revisionSurface!.mutableFields).toEqual(["instructions"]);
    expect(registration.revisionSurface!.baselinePolicy).toEqual(
      projectIntakeBaselinePolicy,
    );
  });

  it("threads policy changes into the prompt without touching the manifest", () => {
    const registration = platformAgentRegistry.get("project-intake");
    const policy = patchedPolicy();

    const candidate = registration.revisionSurface!.createCandidate(policy);
    expect(candidate.manifest).toEqual(registration.manifest);

    const prompt = buildProjectIntakePrompt(turnInput(), policy);
    expect(prompt).toContain(
      "Before responding, verify every referenced id exists",
    );
    const baselinePrompt = buildProjectIntakePrompt(turnInput());
    expect(baselinePrompt).not.toContain(
      "Before responding, verify every referenced id exists",
    );
  });

  it("produces distinct policy digests for real changes only", () => {
    const registration = platformAgentRegistry.get("project-intake");
    const surface = registration.revisionSurface!;

    const baselineDigest = digestJsonEvidence(surface.baselinePolicy);
    expect(
      digestJsonEvidence(surface.schema.parse(projectIntakeBaselinePolicy)),
    ).toBe(baselineDigest);
    expect(digestJsonEvidence(patchedPolicy())).not.toBe(baselineDigest);
  });

  it("rejects invalid candidate policies at construction", () => {
    const registration = platformAgentRegistry.get("project-intake");

    expect(() =>
      registration.revisionSurface!.createCandidate({
        instructions: { roleLines: [] },
      }),
    ).toThrowError();
  });
});
