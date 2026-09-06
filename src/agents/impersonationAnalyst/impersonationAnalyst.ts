import { randomUUID } from "node:crypto";
import { z } from "zod";
import type {
  AIProvider,
  AIProviderEvidence,
  AIProviderResult,
} from "../../providers/aiProvider.js";
import { AIProviderError } from "../../providers/aiProviderError.js";
import type {
  BrandCollisionInput,
  BrandCollisionOutput,
} from "../../tools/brandCollisionTool.js";
import type { ToolDefinition } from "../../tools/toolDefinition.js";
import { executeTool, type ToolCallEvidence } from "../../tools/toolExecutor.js";
import {
  evaluateCitationGrounding,
  resolveCitationRefs,
  type CitationGrounding,
} from "../shared/evidenceCitation.js";
import {
  impersonationAnalystBaselinePolicy,
  impersonationAnalystPolicySchema,
  type ImpersonationAnalystPolicy,
} from "./impersonationAnalystPolicy.js";

// What the model returns: risk flags cite colliding contracts by item number.
export const impersonationRiskFlagSchema = z
  .object({
    flag: z.string().min(1),
    severity: z.enum(["low", "medium", "high"]),
    evidenceItems: z.array(z.number().int().positive()),
    explanation: z.string().min(1),
  })
  .strict();

// What we expose downstream: item numbers resolved back to real addresses.
export const resolvedImpersonationRiskFlagSchema = z
  .object({
    flag: z.string().min(1),
    severity: z.enum(["low", "medium", "high"]),
    evidenceTokens: z.array(z.string().min(1)),
    explanation: z.string().min(1),
  })
  .strict();

export type ResolvedImpersonationRiskFlag = z.infer<
  typeof resolvedImpersonationRiskFlagSchema
>;

export const impersonationJudgmentSchema = z
  .object({
    impersonationRisk: z.enum([
      "none",
      "reused-branding",
      "likely-impersonation",
      "spam-swarm",
    ]),
    riskFlags: z.array(impersonationRiskFlagSchema),
    confidence: z.enum(["low", "medium", "high"]),
    rationale: z.string().min(1),
  })
  .strict();

export type ImpersonationJudgment = z.infer<typeof impersonationJudgmentSchema>;

export interface ImpersonationInputValues {
  symbol?: string | undefined;
  name?: string | undefined;
  chain?: string | undefined;
  token?: string | undefined;
  instruction: string;
}

export interface ImpersonationResult {
  analysisRunId: string;
  collisions: ToolCallEvidence<BrandCollisionOutput>;
  prompt: string;
  rawOutput: string;
  parsedOutput: ImpersonationJudgment | null;
  resolvedRiskFlags: ResolvedImpersonationRiskFlag[];
  refusal: string | null;
  provider: AIProviderEvidence | null;
  executionFailure: {
    category: "transport" | "parsing" | "unknown";
    message: string;
  } | null;
  groundingEvaluation: CitationGrounding | null;
  succeeded: boolean;
  durationMs: number;
  completedAt: string;
}

function collisionBody(
  record: BrandCollisionOutput["same_symbol"][number],
): string {
  const parts = [
    `token=${record.token}`,
    record.name ? `name=${record.name}` : null,
    record.symbol ? `symbol=${record.symbol}` : null,
    record.chain ? `chain=${record.chain}` : null,
    record.deployer ? `deployer=${record.deployer}` : null,
    record.our_verdict ? `ourVerdict=${record.our_verdict}` : null,
    record.date ? `firstSeen=${record.date}` : null,
  ].filter((part): part is string => part !== null);
  return parts.join(" ");
}

export async function runImpersonationAnalysis(
  tool: ToolDefinition<BrandCollisionInput, BrandCollisionOutput>,
  provider: AIProvider,
  input: ImpersonationInputValues,
  policy: ImpersonationAnalystPolicy = impersonationAnalystBaselinePolicy,
): Promise<ImpersonationResult> {
  const startedAt = performance.now();
  const validatedPolicy = impersonationAnalystPolicySchema.parse(policy);

  const collisionInput: BrandCollisionInput = {} as BrandCollisionInput;
  if (input.symbol !== undefined) collisionInput.symbol = input.symbol;
  if (input.name !== undefined) collisionInput.name = input.name;
  if (input.chain !== undefined) collisionInput.chain = input.chain;
  if (input.token !== undefined) collisionInput.excludeToken = input.token;
  const collisions = await executeTool(tool, collisionInput);

  if (!collisions.succeeded || !collisions.output) {
    return {
      analysisRunId: randomUUID(),
      collisions,
      prompt: "",
      rawOutput: "",
      parsedOutput: null,
      resolvedRiskFlags: [],
      refusal: null,
      provider: null,
      executionFailure: {
        category: "transport",
        message:
          collisions.failure?.message ??
          "Brand-collision facts could not be retrieved.",
      },
      groundingEvaluation: null,
      succeeded: false,
      durationMs: performance.now() - startedAt,
      completedAt: new Date().toISOString(),
    };
  }

  const output = collisions.output;
  const collisionLines = [...output.same_symbol, ...output.same_name];
  const orderedTokens = collisionLines.map((record) => record.token);
  const contextLines =
    collisionLines.length > 0
      ? collisionLines.map(
          (record, index) => `[${index + 1}] ${collisionBody(record)}`,
        )
      : ["(no other contracts share this name or symbol)"];
  const notableLines =
    output.notable_reused_symbols.length > 0
      ? output.notable_reused_symbols.map(
          (entry) => `- ${entry.symbol}: ${entry.distinct_contracts} distinct contracts`,
        )
      : ["- (none)"];

  const prompt = [
    "ROLE:",
    ...validatedPolicy.instructions.roleLines,
    "",
    "RUBRIC:",
    `- a symbol reused across at least ${validatedPolicy.rubric.reusedMinContracts} contracts counts as reused branding.`,
    `- reused branding concentrated in at most ${validatedPolicy.rubric.spamSwarmMaxDeployers} distinct deployers is a spam-swarm.`,
    "",
    "CANDIDATE:",
    `name=${input.name ?? "(none)"} symbol=${input.symbol ?? "(none)"} chain=${input.chain ?? "(unknown)"}`,
    "",
    "COLLISION SUMMARY:",
    `othersSharingSymbol=${output.summary.others_sharing_symbol} othersSharingName=${output.summary.others_sharing_name} distinctDeployersSharingSymbol=${output.summary.distinct_deployers_sharing_symbol}`,
    "",
    "CONTRACTS SHARING THIS NAME/SYMBOL (cite these by their [number] in evidenceItems):",
    ...contextLines,
    "",
    "REUSED-BRANDING POOL (symbols across many contracts):",
    ...notableLines,
    "",
    "TASK:",
    input.instruction.trim(),
  ].join("\n");

  let providerResult: AIProviderResult<ImpersonationJudgment>;
  let executionFailure: ImpersonationResult["executionFailure"] = null;
  try {
    providerResult = await provider.generate({
      prompt,
      outputSchema: impersonationJudgmentSchema,
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
      : evaluateCitationGrounding(
          providerResult.parsedOutput.riskFlags.flatMap(
            ({ evidenceItems }) => evidenceItems,
          ),
          orderedTokens.length,
        );

  const resolvedRiskFlags: ResolvedImpersonationRiskFlag[] =
    providerResult.parsedOutput === null || groundingEvaluation?.passed !== true
      ? []
      : providerResult.parsedOutput.riskFlags.map((flag) => ({
          flag: flag.flag,
          severity: flag.severity,
          explanation: flag.explanation,
          evidenceTokens: resolveCitationRefs(flag.evidenceItems, orderedTokens),
        }));

  return {
    analysisRunId: randomUUID(),
    collisions,
    prompt,
    rawOutput: providerResult.rawOutput,
    parsedOutput: providerResult.parsedOutput,
    resolvedRiskFlags,
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
