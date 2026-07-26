import OpenAI, { APIConnectionError } from "openai";
import type {
    AIProvider,
    AIProviderRequest,
    AIProviderResult,
} from "./aiProvider.js";
import { AIProviderError } from "./aiProviderError.js";
import { zodTextFormat } from "openai/helpers/zod";
import { ZodError } from "zod";

export class OpenAIProvider implements AIProvider {
    private readonly client: OpenAI;

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

    async generate<TOutput = unknown>(
        request: AIProviderRequest<TOutput>,
    ): Promise<AIProviderResult<TOutput>> {
        const outputSchema = request.outputSchema;
        if (!outputSchema) {
            const response =
                await this.executeWithFailureTranslation(() =>
                    this.client.responses.create({
                        model: "gpt-5.4",
                        input: request.prompt,
                    }),
                );


            return {
                rawOutput: response.output_text,
                parsedOutput: null,
                refusal: null,
            };
        }

        const response =
            await this.executeWithFailureTranslation(() =>
                this.client.responses.parse({
                    model: "gpt-5.4",
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
        };
    }
}