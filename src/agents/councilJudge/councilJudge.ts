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
  councilJudgeBaselinePolicy,
  councilJudgePolicySchema,
  type CouncilJudgePolicy,
} from "./councilJudgePolicy.js";

export const judgeRulingSchema = z
  .object({
    grade: z.number().int().min(0).max(100),
    gradeConfidence: z.enum(["low", "medium", "high"]),
    decidingFactRefs: z.array(z.number().int().positive()),
    rationale: z.string().min(1),
  })
  .strict();

export type JudgeRuling = z.infer<typeof judgeRulingSchema>;

export interface CouncilJudgeInputValues {
  facts: string[];
  forArgument: string;
  againstArgument: string;
  token?: string | undefined;
  chain?: string | undefined;
  instruction: string;
}

export interface CouncilJudgeResult {
  judgeRunId: string;
  prompt: string;
  rawOutput: string;
  parsedOutput: JudgeRuling | null;
  decidingFacts: string[];
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

export async function runCouncilJudge(
  provider: AIProvider,
  input: CouncilJudgeInputValues,
  policy: CouncilJudgePolicy = councilJudgeBaselinePolicy,
): Promise<CouncilJudgeResult> {
  const startedAt = performance.now();
  const validatedPolicy = councilJudgePolicySchema.parse(policy);
  const factLines = input.facts.map((fact, index) => `[${index + 1}] ${fact}`);

  const prompt = [
    "ROLE:",
    ...validatedPolicy.instructions.roleLines,
    "",
    `SUBJECT: token=${input.token ?? "(unspecified)"} chain=${input.chain ?? "(unknown)"}`,
    "",
    "CASE FACTS (cite these by their [number] in decidingFactRefs):",
    ...factLines,
    "",
    "ARGUMENT FOR ACTING:",
    input.forArgument.trim(),
    "",
    "ARGUMENT AGAINST ACTING:",
    input.againstArgument.trim(),
    "",
    "GRADE this token's BUY-WORTHINESS on a 0-100 scale (not a yes/no): 0-40 = avoid, "
      + "40-60 = neutral / no edge, 60-80 = speculative (a small shot), 80-100 = conviction. "
      + "Reconcile the two advocates' proposed grades on the merits. gradeConfidence is how sure "
      + "you are of the grade given the evidence. Sizing and the act threshold are decided downstream.",
    "",
    "TASK:",
    input.instruction.trim(),
  ].join("\n");

  let providerResult: AIProviderResult<JudgeRuling>;
  let executionFailure: CouncilJudgeResult["executionFailure"] = null;
  try {
    providerResult = await provider.generate({
      prompt,
      outputSchema: judgeRulingSchema,
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
          providerResult.parsedOutput.decidingFactRefs,
          input.facts.length,
        );

  const decidingFacts =
    providerResult.parsedOutput === null || groundingEvaluation?.passed !== true
      ? []
      : resolveCitationRefs(
          providerResult.parsedOutput.decidingFactRefs,
          input.facts,
        );

  return {
    judgeRunId: randomUUID(),
    prompt,
    rawOutput: providerResult.rawOutput,
    parsedOutput: providerResult.parsedOutput,
    decidingFacts,
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
