import { describe, expect, it } from "vitest";
import type {
  AIProvider,
  AIProviderRequest,
} from "../src/providers/aiProvider.js";
import {
  brandCollisionInputSchema,
  brandCollisionOutputSchema,
  type BrandCollisionInput,
  type BrandCollisionOutput,
} from "../src/tools/brandCollisionTool.js";
import type { ToolDefinition } from "../src/tools/toolDefinition.js";
import {
  runImpersonationAnalysis,
  type ImpersonationJudgment,
} from "../src/agents/impersonationAnalyst/impersonationAnalyst.js";

const COLLIDING_TOKEN = "0x2222222222222222222222222222222222222222";

function collisionTool(
  output: BrandCollisionOutput,
): ToolDefinition<BrandCollisionInput, BrandCollisionOutput> {
  return {
    id: "brand-collision",
    description: "stub",
    inputSchema: brandCollisionInputSchema,
    outputSchema: brandCollisionOutputSchema,
    async execute() {
      return output;
    },
  };
}

function throwingTool(): ToolDefinition<
  BrandCollisionInput,
  BrandCollisionOutput
> {
  return {
    id: "brand-collision",
    description: "stub",
    inputSchema: brandCollisionInputSchema,
    outputSchema: brandCollisionOutputSchema,
    async execute(): Promise<BrandCollisionOutput> {
      throw new Error("signal API unreachable");
    },
  };
}

function judgeReturning(judgment: ImpersonationJudgment): AIProvider {
  return {
    async generate<TOutput>(_request: AIProviderRequest<TOutput>) {
      return {
        rawOutput: "structured judgment",
        parsedOutput: judgment as TOutput,
        refusal: null,
        provider: { model: "fake-judge", usage: null },
      };
    },
  };
}

const swarmCollisions: BrandCollisionOutput = {
  query: { name: null, symbol: "DEMO", chain: "bnb" },
  same_symbol: [
    {
      token: COLLIDING_TOKEN,
      name: "Demo",
      symbol: "DEMO",
      chain: "bnb",
      deployer: "0xoneDeployer",
      our_verdict: "CLEAR",
    },
  ],
  same_name: [],
  notable_reused_symbols: [{ symbol: "DEMO", distinct_contracts: 6 }],
  summary: {
    others_sharing_symbol: 1,
    others_sharing_name: 0,
    distinct_deployers_sharing_symbol: 1,
  },
};

describe("impersonation analyst", () => {
  it("accepts a judgment whose risk flags cite a colliding contract by item number", async () => {
    const provider = judgeReturning({
      impersonationRisk: "spam-swarm",
      riskFlags: [
        {
          flag: "single-deployer-brand-swarm",
          severity: "medium",
          evidenceItems: [1],
          explanation: "Symbol reused by one deployer across contracts.",
        },
      ],
      confidence: "medium",
      rationale: "Reused symbol concentrated in a single deployer.",
    });

    const result = await runImpersonationAnalysis(
      collisionTool(swarmCollisions),
      provider,
      { symbol: "DEMO", chain: "bnb", instruction: "Assess." },
    );

    expect(result.succeeded).toBe(true);
    expect(result.groundingEvaluation?.passed).toBe(true);
    expect(result.parsedOutput?.impersonationRisk).toBe("spam-swarm");
    expect(result.resolvedRiskFlags[0]?.evidenceTokens).toContain(
      COLLIDING_TOKEN,
    );
  });

  it("rejects a judgment that cites an item number absent from the collision facts", async () => {
    const provider = judgeReturning({
      impersonationRisk: "likely-impersonation",
      riskFlags: [
        {
          flag: "invented-collision",
          severity: "high",
          evidenceItems: [99],
          explanation: "Cites an item not in the facts.",
        },
      ],
      confidence: "high",
      rationale: "Overreaches beyond the supplied evidence.",
    });

    const result = await runImpersonationAnalysis(
      collisionTool(swarmCollisions),
      provider,
      { symbol: "DEMO", instruction: "Assess." },
    );

    expect(result.succeeded).toBe(false);
    expect(result.groundingEvaluation?.passed).toBe(false);
    expect(result.groundingEvaluation?.invalidRefs).toContain(99);
  });

  it("accepts a clean 'none' verdict when there are no collisions", async () => {
    const noCollisions: BrandCollisionOutput = {
      query: { name: null, symbol: "UNIQUE", chain: null },
      same_symbol: [],
      same_name: [],
      notable_reused_symbols: [],
      summary: {
        others_sharing_symbol: 0,
        others_sharing_name: 0,
        distinct_deployers_sharing_symbol: 0,
      },
    };
    const provider = judgeReturning({
      impersonationRisk: "none",
      riskFlags: [],
      confidence: "high",
      rationale: "Unique symbol with no collisions.",
    });

    const result = await runImpersonationAnalysis(
      collisionTool(noCollisions),
      provider,
      { symbol: "UNIQUE", instruction: "Assess." },
    );

    expect(result.succeeded).toBe(true);
    expect(result.parsedOutput?.impersonationRisk).toBe("none");
  });

  it("fails as a transport error when the facts cannot be fetched", async () => {
    const provider = judgeReturning({
      impersonationRisk: "none",
      riskFlags: [],
      confidence: "low",
      rationale: "unused",
    });

    const result = await runImpersonationAnalysis(throwingTool(), provider, {
      symbol: "DEMO",
      instruction: "Assess.",
    });

    expect(result.succeeded).toBe(false);
    expect(result.executionFailure?.category).toBe("transport");
    expect(result.parsedOutput).toBeNull();
  });
});
