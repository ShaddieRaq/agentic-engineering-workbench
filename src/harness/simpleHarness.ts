import type { AIProvider } from "../providers/aiProvider.js";
import { buildPrompt } from "./buildPrompt.js";
import type { HarnessResult } from "./harnessResult.js";
import { roleSpecSchema, type RoleSpec } from "./roleSpec.js";
import { taskSpecSchema, type TaskSpec } from "./taskSpec.js";
import { randomUUID } from "node:crypto";
import {
    contextItemSchema,
    type ContextItem,
  } from "./contextItem.js";
  import type { Evaluator } from "../evaluations/evaluator.js";
export class SimpleHarness {
    constructor(
        private readonly provider: AIProvider,
        private readonly evaluators: Evaluator[],
      ) {}

    async run(
        role: RoleSpec,
        task: TaskSpec,
        context: ContextItem[] = [],
    ): Promise<HarnessResult> {
        const validatedRole = roleSpecSchema.parse(role);
        const validatedTask = taskSpecSchema.parse(task);
        const validatedContext = context.map((item) =>
            contextItemSchema.parse(item),
          );
        const startedAt = performance.now();
        const prompt = buildPrompt(
            validatedRole,
            validatedTask,
            validatedContext,
          );

        const output = await this.provider.generateText(prompt);
        const evaluations = this.evaluators.map((evaluator) =>
            evaluator.evaluate(output),
          );
          const passed = evaluations.every((evaluation) => evaluation.passed);
        const durationMs = performance.now() - startedAt;

        return {
            runId: randomUUID(),
            role: validatedRole,
            task: validatedTask,
            context: validatedContext,
            prompt,
            output,
            evaluations,
            durationMs,
            passed,
            completedAt: new Date().toISOString(),
        };
    }
}