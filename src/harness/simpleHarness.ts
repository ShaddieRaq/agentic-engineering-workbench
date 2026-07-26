import type { AIProvider } from "../providers/aiProvider.js";
import { buildPrompt } from "./buildPrompt.js";
import type { HarnessResult } from "./harnessResult.js";
import { roleSpecSchema, type RoleSpec } from "./roleSpec.js";
import { taskSpecSchema, type TaskSpec } from "./taskSpec.js";
import { randomUUID } from "node:crypto";
import type { ZodType } from "zod";
import {
    contextItemSchema,
    type ContextItem,
} from "./contextItem.js";
import type { Evaluator } from "../evaluations/evaluator.js";
export class SimpleHarness {
    constructor(
        private readonly provider: AIProvider,
        private readonly evaluators: Evaluator[],
        private readonly harnessId: string,
        private readonly scenarioId: string | null = null,
        private readonly outputSchema?: ZodType,
    ) { }

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

        const providerResult = await this.provider.generate({
            prompt,
            ...(this.outputSchema
              ? { outputSchema: this.outputSchema }
              : {}),
          });
        const output = providerResult.rawOutput;
        const evaluationInput = {
            role: validatedRole,
            task: validatedTask,
            context: validatedContext,
            prompt,
            output,
        };

        const evaluations = this.evaluators.map((evaluator) =>
            evaluator.evaluate(evaluationInput),
        );
        const passed = evaluations.every((evaluation) => evaluation.passed);
        const durationMs = performance.now() - startedAt;

        return {
            runId: randomUUID(),
            harnessId: this.harnessId,
            scenarioId: this.scenarioId,
            role: validatedRole,
            task: validatedTask,
            context: validatedContext,
            prompt,
            output,
            parsedOutput: providerResult.parsedOutput,
            refusal: providerResult.refusal,
            evaluations,
            durationMs,
            passed,
            completedAt: new Date().toISOString(),
        };
    }
}