import type { RoleSpec } from "./roleSpec.js";
import type { TaskSpec } from "./taskSpec.js";

export function buildPrompt(role: RoleSpec, task: TaskSpec): string {
  return [
    "ROLE INSTRUCTIONS:",
    role.instructions,
    "",
    "TASK:",
    task.instruction,
  ].join("\n");
}