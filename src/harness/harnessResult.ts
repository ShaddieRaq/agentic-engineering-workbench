import type { RoleSpec } from "./roleSpec.js";
import type { TaskSpec } from "./taskSpec.js";
import type { ContextItem } from "./contextItem.js";
import type { EvaluationResult } from "../evaluations/evaluationResult.js";
import type { AIProviderEvidence } from "../providers/aiProvider.js";
import { z } from "zod";
import { roleSpecSchema } from "./roleSpec.js";
import { taskSpecSchema } from "./taskSpec.js";
import { contextItemSchema } from "./contextItem.js";
import { evaluationResultSchema } from "../evaluations/evaluationResult.js";
import { aiProviderEvidenceSchema } from "../providers/aiProvider.js";

export const executionFailureSchema = z
  .object({
    stage: z.literal("provider"),
    category: z.enum(["transport", "parsing", "unknown"]),
    message: z.string().min(1),
  })
  .strict();

export const harnessResultSchema = z
  .object({
    runId: z.string().min(1),
    harnessId: z.string().min(1),
    scenarioId: z.string().min(1).nullable(),
    role: roleSpecSchema,
    task: taskSpecSchema,
    context: z.array(contextItemSchema),
    prompt: z.string(),
    output: z.string(),
    parsedOutput: z.json().nullable(),
    refusal: z.string().nullable(),
    provider: aiProviderEvidenceSchema.nullable(),
    executionFailure: executionFailureSchema.nullable(),
    evaluations: z.array(evaluationResultSchema),
    durationMs: z.number().nonnegative(),
    completedAt: z.string().min(1),
    passed: z.boolean(),
  })
  .strict();

export type ExecutionFailureCategory =
    | "transport"
    | "parsing"
    | "unknown";

export interface ExecutionFailure {
    stage: "provider";
    category: ExecutionFailureCategory;
    message: string;
}

export interface HarnessResult<TOutput = unknown> {
    runId: string;
    harnessId: string;
    scenarioId: string | null;
    role: RoleSpec;
    task: TaskSpec;
    context: ContextItem[];
    prompt: string;
    output: string;
    parsedOutput: TOutput | null;
    refusal: string | null;
    provider: AIProviderEvidence | null;
    executionFailure: ExecutionFailure | null;
    evaluations: EvaluationResult[];
    durationMs: number;
    completedAt: string;
    passed: boolean;

}
