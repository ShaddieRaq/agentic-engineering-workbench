import type { RoleSpec } from "./roleSpec.js";
import type { TaskSpec } from "./taskSpec.js";
import type { ContextItem } from "./contextItem.js";
import type { EvaluationResult } from "../evaluations/evaluationResult.js";
import type { AIProviderEvidence } from "../providers/aiProvider.js";

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
