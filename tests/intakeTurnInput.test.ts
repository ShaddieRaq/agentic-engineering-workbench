import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { intakeTurnInputSchema } from "../src/foundry/intakeTurnInput.js";
import {
  briefContentOf,
  createInitialProjectBrief,
} from "../src/foundry/projectBrief.js";

function briefContent() {
  return briefContentOf(
    createInitialProjectBrief({
      title: "Recipe planner",
      ideaSummary: "Plan weekly meals from pantry contents.",
    }),
  );
}

describe("intakeTurnInputSchema", () => {
  it("accepts a valid turn input", () => {
    const input = intakeTurnInputSchema.parse({
      briefContent: briefContent(),
      operatorAnswers: [
        { questionId: randomUUID(), answer: "Only internal QA engineers." },
        { questionId: null, answer: "It must run offline." },
      ],
      turnNumber: 2,
      remainingTurns: 3,
    });

    expect(input.operatorAnswers).toHaveLength(2);
  });

  it("rejects an empty answer", () => {
    expect(() =>
      intakeTurnInputSchema.parse({
        briefContent: briefContent(),
        operatorAnswers: [{ questionId: null, answer: "" }],
        turnNumber: 1,
        remainingTurns: 4,
      }),
    ).toThrowError();
  });

  it("rejects negative remaining turns", () => {
    expect(() =>
      intakeTurnInputSchema.parse({
        briefContent: briefContent(),
        operatorAnswers: [],
        turnNumber: 1,
        remainingTurns: -1,
      }),
    ).toThrowError();
  });
});
