import { describe, expect, it } from "vitest";
import type {
  AIProvider,
  AIProviderRequest,
} from "../src/providers/aiProvider.js";
import {
  runCouncilAdvocate,
  type AdvocateArgument,
} from "../src/agents/councilAdvocate/councilAdvocate.js";
import {
  runCouncilJudge,
  type JudgeRuling,
} from "../src/agents/councilJudge/councilJudge.js";

function advocateProvider(argument: AdvocateArgument): AIProvider {
  return {
    async generate<TOutput>(_request: AIProviderRequest<TOutput>) {
      return {
        rawOutput: "argument",
        parsedOutput: argument as TOutput,
        refusal: null,
        provider: { model: "fake", usage: null },
      };
    },
  };
}

function judgeProvider(ruling: JudgeRuling): AIProvider {
  return {
    async generate<TOutput>(_request: AIProviderRequest<TOutput>) {
      return {
        rawOutput: "ruling",
        parsedOutput: ruling as TOutput,
        refusal: null,
        provider: { model: "fake", usage: null },
      };
    },
  };
}

const FACTS = [
  "detector verdict=CLEAR confidence=medium",
  "sellable=true tax=0.6%",
  "deployer actorReputation=serial-launcher",
];

describe("council advocate", () => {
  it("resolves cited fact numbers back to fact text", async () => {
    const result = await runCouncilAdvocate(
      advocateProvider({
        proposedGrade: 62,
        points: [
          { claim: "It is currently exitable.", factRefs: [1, 2], weight: "medium" },
        ],
        strongestOpposingPoint: "The deployer is a serial launcher.",
        summary: "A cautious yes.",
      }),
      { stance: "for", facts: FACTS, instruction: "Argue." },
    );

    expect(result.succeeded).toBe(true);
    expect(result.groundingEvaluation?.passed).toBe(true);
    expect(result.parsedOutput?.proposedGrade).toBe(62);
    expect(result.resolvedPoints[0]?.evidence).toEqual([FACTS[0], FACTS[1]]);
  });

  it("rejects a point citing a fact number out of range", async () => {
    const result = await runCouncilAdvocate(
      advocateProvider({
        proposedGrade: 20,
        points: [
          { claim: "Invented support.", factRefs: [99], weight: "high" },
        ],
        strongestOpposingPoint: "n/a",
        summary: "Overreaches.",
      }),
      { stance: "against", facts: FACTS, instruction: "Argue." },
    );

    expect(result.succeeded).toBe(false);
    expect(result.groundingEvaluation?.invalidRefs).toContain(99);
    expect(result.resolvedPoints).toHaveLength(0);
  });
});

describe("council judge", () => {
  it("rules and resolves the deciding fact numbers", async () => {
    const result = await runCouncilJudge(
      judgeProvider({
        grade: 35,
        gradeConfidence: "medium",
        decidingFactRefs: [3],
        rationale: "Serial-launcher deployer outweighs the thin upside.",
      }),
      {
        facts: FACTS,
        forArgument: "It is exitable now.",
        againstArgument: "The deployer is a serial launcher.",
        instruction: "Rule.",
      },
    );

    expect(result.succeeded).toBe(true);
    expect(result.parsedOutput?.grade).toBe(35);
    expect(result.decidingFacts).toEqual([FACTS[2]]);
  });

  it("keeps the grade but drops a deciding fact cited out of range", async () => {
    const result = await runCouncilJudge(
      judgeProvider({
        grade: 70,
        gradeConfidence: "high",
        decidingFactRefs: [3, 42],
        rationale: "Cites one real fact and one that was never supplied.",
      }),
      {
        facts: FACTS,
        forArgument: "x",
        againstArgument: "y",
        instruction: "Rule.",
      },
    );

    // the grade is the payload — a stray citation must not nuke the whole ruling
    expect(result.succeeded).toBe(true);
    expect(result.parsedOutput?.grade).toBe(70);
    expect(result.decidingFacts).toEqual([FACTS[2]]);   // 42 dropped, 3 kept
    expect(result.groundingEvaluation?.invalidRefs).toContain(42);
  });
});
