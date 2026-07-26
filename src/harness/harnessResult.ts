import type { RoleSpec } from "./roleSpec.js";
import type { TaskSpec } from "./taskSpec.js";
import type { ContextItem } from "./contextItem.js";
import type { EvaluationResult } from "../evaluations/evaluationResult.js";

export interface HarnessResult {
    runId: string;
    harnessId: string;
    scenarioId: string | null;
    role: RoleSpec;
    task: TaskSpec;
    context: ContextItem[];
    prompt: string;
    output: string;
    parsedOutput: unknown | null;
    refusal: string | null;
    evaluations: EvaluationResult[];
    durationMs: number;
    completedAt: string;
    passed: boolean;
    
}