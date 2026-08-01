import type { AIProvider, AIProviderResult } from "../providers/aiProvider.js";
import { buildPrompt } from "./buildPrompt.js";
import type { HarnessResult } from "./harnessResult.js";
import { roleSpecSchema, type RoleSpec } from "./roleSpec.js";
import { taskSpecSchema, type TaskSpec } from "./taskSpec.js";
import { randomUUID } from "node:crypto";
import type { ZodType } from "zod";
import { AIProviderError } from "../providers/aiProviderError.js";
import {
    contextItemSchema,
    type ContextItem,
} from "./contextItem.js";
import type { Evaluator } from "../evaluations/evaluator.js";

export class SimpleHarness<TOutput = unknown> {
    constructor(
        private readonly provider: AIProvider,
        private readonly evaluators: Evaluator[],
        private readonly harnessId: string,
        private readonly scenarioId: string | null = null,
        private readonly outputSchema?: ZodType<TOutput>,
    ) { }

    async run(
        role: RoleSpec,
        task: TaskSpec,
        context: ContextItem[] = [],
    ): Promise<HarnessResult<TOutput>> {
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

        let providerResult: AIProviderResult<TOutput>;
        let executionFailure:
            HarnessResult<TOutput>["executionFailure"] = null;

        try {
            providerResult = await this.provider.generate({
                prompt,
                ...(this.outputSchema
                    ? { outputSchema: this.outputSchema }
                    : {}),
            });
        } catch (error: unknown) {
            providerResult = {
                rawOutput: "",
                parsedOutput: null,
                refusal: null,
                provider: {
                    model: "unknown",
                    usage: null,
                },
            };
            executionFailure = {
                stage: "provider",
                category:
                    error instanceof AIProviderError
                        ? error.category
                        : "unknown",
                message:
                    error instanceof Error
                        ? error.message
                        : String(error),
            };
        }
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
        const passed =
            executionFailure === null &&
            evaluations.every((evaluation) => evaluation.passed);
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
            provider:
                executionFailure === null
                    ? providerResult.provider
                    : null,
            executionFailure,
            evaluations,
            durationMs,
            passed,
            completedAt: new Date().toISOString(),
        };
    }
}
