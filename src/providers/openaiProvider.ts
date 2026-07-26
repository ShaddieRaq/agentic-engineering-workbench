import OpenAI from "openai";
import type {
    AIProvider,
    AIProviderRequest,
    AIProviderResult,
} from "./aiProvider.js";
import { zodTextFormat } from "openai/helpers/zod";
export class OpenAIProvider implements AIProvider {
    private readonly client: OpenAI;

    constructor(apiKey: string, client?: OpenAI) {
        this.client = client ?? new OpenAI({ apiKey });
    }

    async generate(request: AIProviderRequest): Promise<AIProviderResult> {
        if (!request.outputSchema) {
            const response = await this.client.responses.create({
              model: "gpt-5.4",
              input: request.prompt,
            });
        
            return {
              rawOutput: response.output_text,
              parsedOutput: null,
              refusal: null,
            };
          }

        const response = await this.client.responses.parse({
            model: "gpt-5.4",
            input: request.prompt,
            text: {
                format: zodTextFormat(
                    request.outputSchema,
                    "agent_response",
                ),
            },
        });

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