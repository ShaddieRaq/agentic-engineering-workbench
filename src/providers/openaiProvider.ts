import OpenAI, { APIConnectionError } from "openai";
import type { Response } from "openai/resources/responses/responses";
import type {
    AIProvider,
    AIProviderEvidence,
    AIProviderRequest,
    AIProviderResult,
} from "./aiProvider.js";
import { AIProviderError } from "./aiProviderError.js";
import { zodTextFormat } from "openai/helpers/zod";
import { ZodError } from "zod";

export class OpenAIProvider implements AIProvider {
    private readonly client: OpenAI;
    private readonly model = "gpt-5.4";

    constructor(apiKey: string, client?: OpenAI) {
        this.client = client ?? new OpenAI({ apiKey });
    }

    private async executeWithFailureTranslation<T>(
        operation: () => Promise<T>,
    ): Promise<T> {
        try {
            return await operation();
        } catch (error: unknown) {
            if (error instanceof APIConnectionError) {
                throw new AIProviderError(
                    "transport",
                    error.message,
                );
            }
            if (
                error instanceof SyntaxError ||
                error instanceof ZodError
            ) {
                throw new AIProviderError(
                    "parsing",
                    error.message,
                );
            }
            throw error;
        }
    }

    private getProviderEvidence(
        response: Response,
    ): AIProviderEvidence {
        const usage = response.usage;

        return {
            model: response.model,
            usage: usage
                ? {
                    inputTokens: usage.input_tokens,
                    cachedInputTokens:
                        usage.input_tokens_details.cached_tokens,
                    outputTokens: usage.output_tokens,
                    reasoningTokens:
                        usage.output_tokens_details.reasoning_tokens,
                    totalTokens: usage.total_tokens,
                }
                : null,
        };
    }

    async generate<TOutput = unknown>(
        request: AIProviderRequest<TOutput>,
    ): Promise<AIProviderResult<TOutput>> {
        const outputSchema = request.outputSchema;
        if (!outputSchema) {
            const response =
                await this.executeWithFailureTranslation(() =>
                    this.client.responses.create({
                        model: this.model,
                        input: request.prompt,
                    }),
                );


            return {
                rawOutput: response.output_text,
                parsedOutput: null,
                refusal: null,
                provider: this.getProviderEvidence(response),
            };
        }

        const response =
            await this.executeWithFailureTranslation(() =>
                this.client.responses.parse({
                    model: this.model,
                    input: request.prompt,
                    text: {
                        format: zodTextFormat(
                            outputSchema,
                            "agent_response",
                        ),
                    },
                }),
            );

        let refusal: string | null = null;

        for (const item of response.output) {
            if (item.type !== "message") {
                continue;
            }

            const refusalContent = item.content.find(
                (content) => content.type === "refusal",
            );

            if (refusalContent) {
                refusal = refusalContent.refusal;
                break;
            }
        }

        return {
            rawOutput: response.output_text,
            parsedOutput: response.output_parsed,
            refusal,
            provider: this.getProviderEvidence(response),
        };
    }
}
