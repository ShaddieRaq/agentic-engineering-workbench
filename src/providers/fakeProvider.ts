import type {
    AIProvider,
    AIProviderRequest,
    AIProviderResult,
  } from "./aiProvider.js";

export class FakeProvider implements AIProvider {
  constructor(private readonly response: string) {}

  async generate(_request: AIProviderRequest): Promise<AIProviderResult> {
    return {
      rawOutput: this.response,
      parsedOutput: null,
      refusal: null,
    };
  }

}