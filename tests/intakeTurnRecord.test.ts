import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { intakeTurnRecordSchema } from "../src/foundry/intakeTurn.js";

function baseRecord() {
  const briefId = randomUUID();
  return {
    turnId: randomUUID(),
    briefId,
    turnNumber: 1,
    maxTurns: 5,
    agentRunArtifactId: "agent-run-artifact",
    operatorAnswers: [],
    resultingBriefVersion: 2,
    resultingBriefArtifactId: `${briefId}-v2`,
    nextQuestions: [],
    openIssues: [],
    status: "awaiting-answers",
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  };
}

describe("intakeTurnRecordSchema", () => {
  it("accepts a valid completed turn record", () => {
    const record = intakeTurnRecordSchema.parse(baseRecord());
    expect(record.status).toBe("awaiting-answers");
  });

  it("requires null resulting fields for a failed turn", () => {
    expect(() =>
      intakeTurnRecordSchema.parse({
        ...baseRecord(),
        status: "model-failure",
      }),
    ).toThrowError(/failed turn cannot produce/i);

    const failed = intakeTurnRecordSchema.parse({
      ...baseRecord(),
      status: "model-failure",
      resultingBriefVersion: null,
      resultingBriefArtifactId: null,
    });
    expect(failed.resultingBriefVersion).toBeNull();
  });

  it("requires resulting fields for a completed turn", () => {
    expect(() =>
      intakeTurnRecordSchema.parse({
        ...baseRecord(),
        resultingBriefVersion: null,
        resultingBriefArtifactId: null,
      }),
    ).toThrowError(/completed turn must record/i);
  });
});
