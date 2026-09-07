import { describe, expect, it } from "vitest";
import type {
  AIProvider,
  AIProviderRequest,
} from "../src/providers/aiProvider.js";
import {
  runCouncilAdvocate,
  type AdvocateArgument,
} from "../src/agents/councilAdvocate/councilAdvocate.js";
import { councilAdvocateAgent } from "../src/agents/councilAdvocate/councilAdvocateAgent.js";
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

  it("drops a point whose every citation is out of range; the run still succeeds", async () => {
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

    // the RUN succeeded (provider answered, output parsed): grounding is a diagnostic, not fatal
    expect(result.succeeded).toBe(true);
    expect(result.groundingEvaluation?.invalidRefs).toContain(99);
    expect(result.resolvedPoints).toHaveLength(0);
    expect(result.droppedPoints).toEqual([
      { claim: "Invented support.", weight: "high", invalidRefs: [99] },
    ]);
    // …but the ARGUMENT is evidentially unmade — nothing it says is backed by a supplied fact
    expect(result.allUnsupported).toBe(true);
  });

  it("keeps a mixed point's valid refs and drops only the invalid ones", async () => {
    const result = await runCouncilAdvocate(
      advocateProvider({
        proposedGrade: 55,
        points: [{ claim: "Mixed.", factRefs: [99, 3, 3], weight: "low" }],
        strongestOpposingPoint: "n/a",
        summary: "s",
      }),
      { stance: "for", facts: FACTS, instruction: "Argue." },
    );

    expect(result.succeeded).toBe(true);
    expect(result.allUnsupported).toBe(false);
    expect(result.resolvedPoints).toEqual([
      { claim: "Mixed.", weight: "low", factRefs: [3], evidence: [FACTS[2]] },
    ]);
    expect(result.droppedPoints).toHaveLength(0);
    expect(result.groundingEvaluation?.invalidRefs).toEqual([99]);
  });

  it("drops a point with no refs at all without failing the run", async () => {
    const result = await runCouncilAdvocate(
      advocateProvider({
        proposedGrade: 40,
        points: [
          { claim: "Uncited.", factRefs: [], weight: "medium" },
          { claim: "Cited.", factRefs: [2], weight: "medium" },
        ],
        strongestOpposingPoint: "n/a",
        summary: "s",
      }),
      { stance: "for", facts: FACTS, instruction: "Argue." },
    );

    expect(result.succeeded).toBe(true);
    expect(result.resolvedPoints.map((p) => p.claim)).toEqual(["Cited."]);
    expect(result.droppedPoints).toEqual([
      { claim: "Uncited.", weight: "medium", invalidRefs: [] },
    ]);
  });

  it("adapter output contract — pinned verbatim by risk-linter tests/test_seam_contract.py", async () => {
    // The Python orchestrator consumes THIS object. If this shape changes, the
    // Python contract test (which embeds the same object) must change with it.
    const provider = advocateProvider({
      proposedGrade: 62,
      points: [
        { claim: "It is currently exitable.", factRefs: [1, 2], weight: "medium" },
        { claim: "Mixed citation.", factRefs: [3, 99], weight: "low" },
        { claim: "Invented support.", factRefs: [99], weight: "high" },
      ],
      strongestOpposingPoint: "The deployer is a serial launcher.",
      summary: "A cautious yes.",
    });
    const output = await councilAdvocateAgent.execute(
      { stance: "for", facts: FACTS, instruction: "Argue." },
      { provider } as unknown as Parameters<typeof councilAdvocateAgent.execute>[1],
    );
    const { advocateRunId, advocateEvidence, ...contract } = output as Record<string, unknown>;

    expect(typeof advocateRunId).toBe("string");
    expect(advocateEvidence).toBeDefined();
    expect(contract).toEqual({
      succeeded: true,
      stance: "for",
      proposedGrade: 62,
      points: [
        { claim: "It is currently exitable.", factRefs: [1, 2], evidence: [FACTS[0], FACTS[1]], weight: "medium" },
        { claim: "Mixed citation.", factRefs: [3], evidence: [FACTS[2]], weight: "low" },
      ],
      droppedPoints: [{ claim: "Invented support.", weight: "high", invalidRefs: [99] }],
      allUnsupported: false,
      groundingEvaluation: {
        passed: false,
        availableRefs: [1, 2, 3],
        citedRefs: [1, 2, 3, 99],
        invalidRefs: [99],
        message: "Cites evidence items not in the supplied facts: 99.",
      },
      strongestOpposingPoint: "The deployer is a serial launcher.",
      summary: "A cautious yes.",
    });
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
