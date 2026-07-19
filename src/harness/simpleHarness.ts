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

export class SimpleHarness {
    constructor(private readonly provider: AIProvider) { }

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

        const durationMs = performance.now() - startedAt;

        return {
            runId: randomUUID(),
            role: validatedRole,
            task: validatedTask,
            context: validatedContext,
            prompt,
            output,
            durationMs,
            completedAt: new Date().toISOString(),
        };
    }
}