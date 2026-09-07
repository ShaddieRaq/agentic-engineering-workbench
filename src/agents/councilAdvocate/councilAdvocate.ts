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

// What we expose downstream: each kept point carries ONLY its validated fact
// numbers (in range, de-duplicated) plus their resolved text, so the consumer can
// render and audit exactly which supplied fact backs each claim (Q1).
export const resolvedAdvocatePointSchema = z
  .object({
    claim: z.string().min(1),
    factRefs: z.array(z.number().int().positive()).min(1),
    evidence: z.array(z.string().min(1)).min(1),
    weight: z.enum(["low", "medium", "high"]),
  })
  .strict();

export type ResolvedAdvocatePoint = z.infer<
  typeof resolvedAdvocatePointSchema
>;

// A point whose every citation was out of range. Dropped from the argument and
// reported here — an invalid ref is diagnostic, never fatal to the run (Q2).
export const droppedAdvocatePointSchema = z
  .object({
    claim: z.string().min(1),
    weight: z.enum(["low", "medium", "high"]),
    invalidRefs: z.array(z.number().int()),
  })
  .strict();

export type DroppedAdvocatePoint = z.infer<typeof droppedAdvocatePointSchema>;

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
  droppedPoints: DroppedAdvocatePoint[];
  /** Parsed fine, but not one point cites a supplied fact: operationally a
   *  success, evidentially an UNMADE argument. Consumers must not let its
   *  proposedGrade/summary stand in for the dropped claims. */
  allUnsupported: boolean;
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

  // Per-point grounding, aligned with the judge: an invalid ref is DROPPED, not
  // fatal. A point keeps its valid refs; a point with none is dropped and
  // reported; the argument survives with whatever is actually cited (Q2).
  const factCount = input.facts.length;
  const inRange = (ref: number) =>
    Number.isInteger(ref) && ref >= 1 && ref <= factCount;
  const resolvedPoints: ResolvedAdvocatePoint[] = [];
  const droppedPoints: DroppedAdvocatePoint[] = [];
  for (const point of providerResult.parsedOutput?.points ?? []) {
    const refs = [...new Set(point.factRefs)].sort((a, b) => a - b);
    const validRefs = refs.filter(inRange);
    if (validRefs.length === 0) {
      droppedPoints.push({
        claim: point.claim,
        weight: point.weight,
        invalidRefs: refs.filter((ref) => !inRange(ref)),
      });
      continue;
    }
    resolvedPoints.push({
      claim: point.claim,
      weight: point.weight,
      factRefs: validRefs,
      evidence: resolveCitationRefs(validRefs, input.facts),
    });
  }
  const allUnsupported =
    providerResult.parsedOutput !== null && resolvedPoints.length === 0;

  return {
    advocateRunId: randomUUID(),
    stance: input.stance,
    prompt,
    rawOutput: providerResult.rawOutput,
    parsedOutput: providerResult.parsedOutput,
    resolvedPoints,
    droppedPoints,
    allUnsupported,
    refusal: providerResult.refusal,
    provider: executionFailure === null ? providerResult.provider : null,
    executionFailure,
    groundingEvaluation,
    // Operational success only: the provider answered, wasn't refused, and the
    // output parsed. Grounding is a diagnostic on the argument, not on the run.
    succeeded:
      executionFailure === null &&
      providerResult.refusal === null &&
      providerResult.parsedOutput !== null,
    durationMs: performance.now() - startedAt,
    completedAt: new Date().toISOString(),
  };
}
