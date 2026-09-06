import { randomUUID } from "node:crypto";
import { z } from "zod";
import type {
  AIProvider,
  AIProviderEvidence,
  AIProviderResult,
} from "../../providers/aiProvider.js";
import { AIProviderError } from "../../providers/aiProviderError.js";
import type {
  DeployerHistoryInput,
  DeployerHistoryOutput,
} from "../../tools/deployerHistoryTool.js";
import type { ToolDefinition } from "../../tools/toolDefinition.js";
import { executeTool, type ToolCallEvidence } from "../../tools/toolExecutor.js";
import {
  deployerForensicsBaselinePolicy,
  deployerForensicsPolicySchema,
  type DeployerForensicsPolicy,
} from "./deployerForensicsPolicy.js";

export const deployerRiskFlagSchema = z
  .object({
    flag: z.string().min(1),
    severity: z.enum(["low", "medium", "high"]),
    evidenceTokens: z.array(z.string().min(1)),
    explanation: z.string().min(1),
  })
  .strict();

export const deployerForensicsJudgmentSchema = z
  .object({
    actorReputation: z.enum([
      "insufficient-evidence",
      "established-clean",
      "serial-launcher",
      "repeat-rugger",
      "mixed",
    ]),
    riskFlags: z.array(deployerRiskFlagSchema),
    confidence: z.enum(["low", "medium", "high"]),
    rationale: z.string().min(1),
  })
  .strict();

export type DeployerForensicsJudgment = z.infer<
  typeof deployerForensicsJudgmentSchema
>;

export interface DeployerForensicsInputValues {
  deployer: string;
  chain?: string | undefined;
  token?: string | undefined;
  instruction: string;
}

export interface DeployerForensicsResult {
  forensicsRunId: string;
  dossier: ToolCallEvidence<DeployerHistoryOutput>;
  prompt: string;
  rawOutput: string;
  parsedOutput: DeployerForensicsJudgment | null;
  refusal: string | null;
  provider: AIProviderEvidence | null;
  executionFailure: {
    category: "transport" | "parsing" | "unknown";
    message: string;
  } | null;
  groundingEvaluation: {
    passed: boolean;
    availableTokens: string[];
    citedTokens: string[];
    invalidTokens: string[];
    message: string;
  } | null;
  succeeded: boolean;
  durationMs: number;
  completedAt: string;
}

function uniqueSortedLower(values: string[]): string[] {
  return [...new Set(values.map((value) => value.toLowerCase()))].sort(
    (left, right) => left.localeCompare(right),
  );
}

function formatPriorToken(
  token: DeployerHistoryOutput["prior_tokens"][number],
): string {
  const parts = [
    `token=${token.token}`,
    token.chain ? `chain=${token.chain}` : null,
    token.venue ? `venue=${token.venue}` : null,
    token.symbol ? `symbol=${token.symbol}` : null,
    token.our_verdict ? `ourVerdict=${token.our_verdict}` : null,
    token.our_confidence ? `ourConfidence=${token.our_confidence}` : null,
    typeof token.sellable === "boolean" ? `sellable=${token.sellable}` : null,
    token.token_template ? `template=${token.token_template}` : null,
    token.outcome ? `outcome=${token.outcome}` : null,
    typeof token.return === "number" ? `return=${token.return}` : null,
    typeof token.still_sellable === "boolean"
      ? `stillSellable=${token.still_sellable}`
      : null,
    token.date ? `firstSeen=${token.date}` : null,
  ].filter((part): part is string => part !== null);
  return `- ${parts.join(" ")}`;
}

export async function runDeployerForensics(
  tool: ToolDefinition<DeployerHistoryInput, DeployerHistoryOutput>,
  provider: AIProvider,
  input: DeployerForensicsInputValues,
  policy: DeployerForensicsPolicy = deployerForensicsBaselinePolicy,
): Promise<DeployerForensicsResult> {
  const startedAt = performance.now();
  const validatedPolicy = deployerForensicsPolicySchema.parse(policy);

  const dossier = await executeTool(tool, {
    deployer: input.deployer,
    chain: input.chain,
    excludeToken: input.token,
  });

  if (!dossier.succeeded || !dossier.output) {
    return {
      forensicsRunId: randomUUID(),
      dossier,
      prompt: "",
      rawOutput: "",
      parsedOutput: null,
      refusal: null,
      provider: null,
      executionFailure: {
        category: "transport",
        message:
          dossier.failure?.message ??
          "Deployer-history dossier could not be retrieved.",
      },
      groundingEvaluation: null,
      succeeded: false,
      durationMs: performance.now() - startedAt,
      completedAt: new Date().toISOString(),
    };
  }

  const output = dossier.output;
  const priorLines =
    output.prior_tokens.length > 0
      ? output.prior_tokens.map(formatPriorToken)
      : ["- (no prior tokens observed for this deployer)"];

  const prompt = [
    "ROLE:",
    ...validatedPolicy.instructions.roleLines,
    "",
    "RUBRIC:",
    `- established-clean requires at least ${validatedPolicy.rubric.establishedMinPriorTokens} prior tokens with no resolved unsellable outcomes.`,
    `- repeat-rugger requires at least ${validatedPolicy.rubric.repeatRugMinUnsellable} prior tokens that resolved unsellable.`,
    `- fresh wallet (no prior history) is treated as neutral: ${validatedPolicy.rubric.freshWalletIsNeutral}.`,
    "",
    "DEPLOYER:",
    `address=${output.deployer}`,
    `priorCount=${output.summary.prior_count} blockedByUs=${output.summary.blocked_count} resolvedUnsellable=${output.summary.resolved_unsellable_count} chains=${output.summary.chains.join(",") || "none"}`,
    "",
    "PRIOR TOKENS:",
    ...priorLines,
    "",
    "TASK:",
    input.instruction.trim(),
  ].join("\n");

  let providerResult: AIProviderResult<DeployerForensicsJudgment>;
  let executionFailure: DeployerForensicsResult["executionFailure"] = null;
  try {
    providerResult = await provider.generate({
      prompt,
      outputSchema: deployerForensicsJudgmentSchema,
    });
  } catch (error: unknown) {
    providerResult = {
      rawOutput: "",
      parsedOutput: null,
      refusal: null,
      provider: { model: "unknown", usage: null },
    };
    executionFailure = {
      category: error instanceof AIProviderError ? error.category : "unknown",
      message: error instanceof Error ? error.message : String(error),
    };
  }

  const groundingEvaluation =
    providerResult.parsedOutput === null
      ? null
      : (() => {
          const availableTokens = uniqueSortedLower(
            output.prior_tokens.map((token) => token.token),
          );
          const citedTokens = uniqueSortedLower(
            providerResult.parsedOutput!.riskFlags.flatMap(
              ({ evidenceTokens }) => evidenceTokens,
            ),
          );
          const available = new Set(availableTokens);
          const invalidTokens = citedTokens.filter(
            (token) => !available.has(token),
          );
          return {
            passed: invalidTokens.length === 0,
            availableTokens,
            citedTokens,
            invalidTokens,
            message:
              invalidTokens.length === 0
                ? "Every risk flag cites a prior token from the dossier."
                : `Deployer forensics cites tokens absent from the dossier: ${invalidTokens.join(", ")}.`,
          };
        })();

  return {
    forensicsRunId: randomUUID(),
    dossier,
    prompt,
    rawOutput: providerResult.rawOutput,
    parsedOutput: providerResult.parsedOutput,
    refusal: providerResult.refusal,
    provider: executionFailure === null ? providerResult.provider : null,
    executionFailure,
    groundingEvaluation,
    succeeded:
      executionFailure === null &&
      providerResult.refusal === null &&
      providerResult.parsedOutput !== null &&
      groundingEvaluation?.passed === true,
    durationMs: performance.now() - startedAt,
    completedAt: new Date().toISOString(),
  };
}
