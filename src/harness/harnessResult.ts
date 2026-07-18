import type { RoleSpec } from "./roleSpec.js";
import type { TaskSpec } from "./taskSpec.js";

export interface HarnessResult {
    runId: string;
    role: RoleSpec;
    task: TaskSpec;
    prompt: string;
    output: string;
    durationMs: number;
    completedAt: string;
}