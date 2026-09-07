import { randomUUID } from "node:crypto";
import { z } from "zod";
import type {
  AIProvider,
  AIProviderEvidence,
  AIProviderResult,
} from "../../providers/aiProvider.js";
import { AIProviderError } from "../../providers/aiProviderError.js";
import {
  evaluateCitationGrounding,
  resolveCitationRefs,
  type CitationGrounding,
} from "../shared/evidenceCitation.js";
import {
  councilAdvocateBaselinePolicy,
  councilAdvocatePolicySchema,
  type CouncilAdvocatePolicy,
} from "./councilAdvocatePolicy.js";

// What the model returns: each point cites case facts by number.
export const advocatePointSchema = z
  .object({
    claim: z.string().min(1),
    factRefs: z.array(z.number().int().positive()),
    weight: z.enum(["low", "medium", "high"]),
  })
  .strict();

export const advocateArgumentSchema = z
  .object({
    proposedGrade: z.number().int().min(0).max(100),
    points: z.array(advocatePointSchema).min(1),
    strongestOpposingPoint: z.string().min(1),
    summary: z.string().min(1),
  })
  .strict();

export type AdvocateArgument = z.infer<typeof advocateArgumentSchema>;

// What we expose downstream: fact numbers resolved to their text.
export const resolvedAdvocatePointSchema = z
  .object({
    claim: z.string().min(1),
    evidence: z.array(z.string().min(1)),
    weight: z.enum(["low", "medium", "high"]),
  })
  .strict();

export type ResolvedAdvocatePoint = z.infer<
  typeof resolvedAdvocatePointSchema
>;

export type AdvocateStance = "for" | "against";

export interface CouncilAdvocateInputValues {
  stance: AdvocateStance;
  facts: string[];
  token?: string | undefined;
  chain?: string | undefined;
  instruction: string;
}

export interface CouncilAdvocateResult {
  advocateRunId: string;
  stance: AdvocateStance;
  prompt: string;
  rawOutput: string;
  parsedOutput: AdvocateArgument | null;
  resolvedPoints: ResolvedAdvocatePoint[];
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

export async function runCouncilAdvocate(
  provider: AIProvider,
  input: CouncilAdvocateInputValues,
  policy: CouncilAdvocatePolicy = councilAdvocateBaselinePolicy,
): Promise<CouncilAdvocateResult> {
  const startedAt = performance.now();
  const validatedPolicy = councilAdvocatePolicySchema.parse(policy);
  const stanceLine =
    input.stance === "for"
      ? validatedPolicy.instructions.forStanceLine
      : validatedPolicy.instructions.againstStanceLine;
  const factLines = input.facts.map((fact, index) => `[${index + 1}] ${fact}`);

  const prompt = [
    "ROLE:",
    ...validatedPolicy.instructions.roleLines,
    "",
    stanceLine,
    "",
    `SUBJECT: token=${input.token ?? "(unspecified)"} chain=${input.chain ?? "(unknown)"}`,
    "",
    "CASE FACTS (cite these by their [number] in factRefs):",
    ...factLines,
    "",
    "GRADE: also output proposedGrade — a 0-100 assessment of how BUY-WORTHY this token is "
      + "(0 = avoid, 50 = neutral / no edge, 100 = strong buy). Argue from your stance: a FOR "
      + "advocate justifies a higher grade, an AGAINST advocate a lower one. The judge reconciles.",
    "",
    "TASK:",
    input.instruction.trim(),
  ].join("\n");

  let providerResult: AIProviderResult<AdvocateArgument>;
  let executionFailure: CouncilAdvocateResult["executionFailure"] = null;
  try {
    providerResult = await provider.generate({
      prompt,
      outputSchema: advocateArgumentSchema,
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
          providerResult.parsedOutput.points.flatMap(
            ({ factRefs }) => factRefs,
          ),
          input.facts.length,
        );

  const resolvedPoints: ResolvedAdvocatePoint[] =
    providerResult.parsedOutput === null || groundingEvaluation?.passed !== true
      ? []
      : providerResult.parsedOutput.points.map((point) => ({
          claim: point.claim,
          weight: point.weight,
          evidence: resolveCitationRefs(point.factRefs, input.facts),
        }));

  return {
    advocateRunId: randomUUID(),
    stance: input.stance,
    prompt,
    rawOutput: providerResult.rawOutput,
    parsedOutput: providerResult.parsedOutput,
    resolvedPoints,
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
