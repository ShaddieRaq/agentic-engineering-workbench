import { z } from "zod";
import { describe, expect, it, vi } from "vitest";
import type { AgentRegistration } from "../src/agents/agentRegistration.js";
import { defineAgentRevisionSurface } from "../src/agents/agentRevisionSurface.js";

const policySchema = z
  .object({
    instructions: z.array(z.string().min(1)).min(1),
    contextSelection: z
      .object({
        maximumFiles: z.number().int().min(2).max(30),
      })
      .strict(),
  })
  .strict();

const baselinePolicy = {
  instructions: ["Use only supplied evidence."],
  contextSelection: { maximumFiles: 16 },
};

describe("defineAgentRevisionSurface", () => {
  it("freezes validated baseline policy and validates candidate construction", () => {
    const candidate = {} as AgentRegistration;
    const createCandidate = vi.fn(() => candidate);
    const surface = defineAgentRevisionSurface({
      schema: policySchema,
      baselinePolicy,
      mutableFields: ["instructions", "contextSelection"],
      createCandidate,
    });

    expect(surface.baselinePolicy).toEqual(baselinePolicy);
    expect(Object.isFrozen(surface.baselinePolicy)).toBe(true);
    expect(Object.isFrozen(surface.baselinePolicy.instructions)).toBe(true);
    expect(Object.isFrozen(surface.mutableFields)).toBe(true);

    const changedPolicy = {
      instructions: ["Cite every finding."],
      contextSelection: { maximumFiles: 12 },
    };
    expect(surface.createCandidate(changedPolicy)).toBe(candidate);
    expect(createCandidate).toHaveBeenCalledWith(changedPolicy);
    expect(() =>
      surface.createCandidate({
        ...changedPolicy,
        contextSelection: { maximumFiles: 31 },
      }),
    ).toThrow();
  });

  it("rejects duplicate, missing, and undeclared mutable fields", () => {
    const createCandidate = () => ({} as AgentRegistration);

    expect(() =>
      defineAgentRevisionSurface({
        schema: policySchema,
        baselinePolicy,
        mutableFields: ["instructions", "instructions"],
        createCandidate,
      }),
    ).toThrow("must be unique");

    expect(() =>
      defineAgentRevisionSurface({
        schema: policySchema,
        baselinePolicy,
        mutableFields: ["instructions"],
        createCandidate,
      }),
    ).toThrow("baseline contains undeclared");

    expect(() =>
      defineAgentRevisionSurface({
        schema: policySchema,
        baselinePolicy,
        mutableFields: [
          "instructions",
          "contextSelection",
          "missing",
        ] as Array<"instructions" | "contextSelection">,
        createCandidate,
      }),
    ).toThrow("fields absent from baseline");
  });
});
