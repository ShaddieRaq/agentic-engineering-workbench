import { describe, expect, it } from "vitest";
import type {
  AIProvider,
  AIProviderRequest,
} from "../src/providers/aiProvider.js";
import {
  deployerHistoryInputSchema,
  deployerHistoryOutputSchema,
  type DeployerHistoryInput,
  type DeployerHistoryOutput,
} from "../src/tools/deployerHistoryTool.js";
import type { ToolDefinition } from "../src/tools/toolDefinition.js";
import {
  runDeployerForensics,
  type DeployerForensicsJudgment,
} from "../src/agents/deployerForensics/deployerForensics.js";

const PRIOR_TOKEN = "0x1111111111111111111111111111111111111111";

function dossierTool(
  output: DeployerHistoryOutput,
): ToolDefinition<DeployerHistoryInput, DeployerHistoryOutput> {
  return {
    id: "deployer-history",
    description: "stub",
    inputSchema: deployerHistoryInputSchema,
    outputSchema: deployerHistoryOutputSchema,
    async execute() {
      return output;
    },
  };
}

function throwingTool(): ToolDefinition<
  DeployerHistoryInput,
  DeployerHistoryOutput
> {
  return {
    id: "deployer-history",
    description: "stub",
    inputSchema: deployerHistoryInputSchema,
    outputSchema: deployerHistoryOutputSchema,
    async execute(): Promise<DeployerHistoryOutput> {
      throw new Error("signal API unreachable");
    },
  };
}

function judgeReturning(judgment: DeployerForensicsJudgment): AIProvider {
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

const oneTokenDossier: DeployerHistoryOutput = {
  deployer: "0xdeployer",
  chain: "bnb",
  prior_tokens: [
    {
      token: PRIOR_TOKEN,
      chain: "bnb",
      venue: "four.meme",
      our_verdict: "CLEAR",
      still_sellable: false,
    },
  ],
  summary: {
    prior_count: 1,
    blocked_count: 0,
    resolved_unsellable_count: 1,
    chains: ["bnb"],
    first_seen: "2026-09-06 19:20",
    last_seen: "2026-09-06 19:20",
  },
};

describe("deployer forensics", () => {
  it("accepts a judgment whose risk flags cite a prior token from the dossier", async () => {
    const provider = judgeReturning({
      actorReputation: "mixed",
      riskFlags: [
        {
          flag: "prior-token-turned-unsellable",
          severity: "medium",
          // cite in a different case to prove case-insensitive grounding
          evidenceTokens: [PRIOR_TOKEN.toUpperCase()],
          explanation: "A prior launch resolved unsellable.",
        },
      ],
      confidence: "low",
      rationale: "One prior token resolved unsellable; too little history to be sure.",
    });

    const result = await runDeployerForensics(
      dossierTool(oneTokenDossier),
      provider,
      { deployer: "0xdeployer", chain: "bnb", instruction: "Assess." },
    );

    expect(result.succeeded).toBe(true);
    expect(result.groundingEvaluation?.passed).toBe(true);
    expect(result.parsedOutput?.actorReputation).toBe("mixed");
    expect(result.executionFailure).toBeNull();
  });

  it("rejects a judgment that cites a token absent from the dossier (cannot guess history)", async () => {
    const provider = judgeReturning({
      actorReputation: "repeat-rugger",
      riskFlags: [
        {
          flag: "invented-rug",
          severity: "high",
          evidenceTokens: ["0x9999999999999999999999999999999999999999"],
          explanation: "Cites a token that is not in the dossier.",
        },
      ],
      confidence: "high",
      rationale: "Overreaches beyond the supplied evidence.",
    });

    const result = await runDeployerForensics(
      dossierTool(oneTokenDossier),
      provider,
      { deployer: "0xdeployer", instruction: "Assess." },
    );

    expect(result.succeeded).toBe(false);
    expect(result.groundingEvaluation?.passed).toBe(false);
    expect(result.groundingEvaluation?.invalidTokens).toContain(
      "0x9999999999999999999999999999999999999999",
    );
  });

  it("fails as a transport error when the dossier cannot be fetched", async () => {
    const provider = judgeReturning({
      actorReputation: "insufficient-evidence",
      riskFlags: [],
      confidence: "low",
      rationale: "unused",
    });

    const result = await runDeployerForensics(throwingTool(), provider, {
      deployer: "0xdeployer",
      instruction: "Assess.",
    });

    expect(result.succeeded).toBe(false);
    expect(result.executionFailure?.category).toBe("transport");
    expect(result.parsedOutput).toBeNull();
  });
});
