import type { ContextItem } from "./contextItem.js";
import type { RoleSpec } from "./roleSpec.js";
import type { TaskSpec } from "./taskSpec.js";

export function buildPrompt(
  role: RoleSpec,
  task: TaskSpec,
  context: ContextItem[] = [],
): string {
  const contextSection =
    context.length === 0
      ? ["CONTEXT:", "No additional context provided."]
      : [
          "CONTEXT:",
          ...context.flatMap((item) => [
            `Source: ${item.source}`,
            item.content,
            "",
          ]),
        ];

  return [
    "ROLE INSTRUCTIONS:",
    role.instructions,
    "",
    ...contextSection,
    "TASK:",
    task.instruction,
  ].join("\n");
}