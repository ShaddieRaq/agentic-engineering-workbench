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
    expect(result.resolvedPoints[0]?.evidence).toEqual([FACTS[0], FACTS[1]]);
  });

  it("rejects a point citing a fact number out of range", async () => {
    const result = await runCouncilAdvocate(
      advocateProvider({
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
        decision: "skip",
        conviction: "medium",
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
    expect(result.parsedOutput?.decision).toBe("skip");
    expect(result.decidingFacts).toEqual([FACTS[2]]);
  });

  it("rejects a ruling that cites a deciding fact out of range", async () => {
    const result = await runCouncilJudge(
      judgeProvider({
        decision: "act",
        conviction: "high",
        decidingFactRefs: [42],
        rationale: "Cites a fact that was never supplied.",
      }),
      {
        facts: FACTS,
        forArgument: "x",
        againstArgument: "y",
        instruction: "Rule.",
      },
    );

    expect(result.succeeded).toBe(false);
    expect(result.groundingEvaluation?.invalidRefs).toContain(42);
  });
});
