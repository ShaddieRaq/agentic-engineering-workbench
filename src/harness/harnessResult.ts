import type { RoleSpec } from "./roleSpec.js";
import type { TaskSpec } from "./taskSpec.js";
import type { ContextItem } from "./contextItem.js";

export interface HarnessResult {
    runId: string;
    role: RoleSpec;
    task: TaskSpec;
    context: ContextItem[];
    prompt: string;
    output: string;
    durationMs: number;
    completedAt: string;
}