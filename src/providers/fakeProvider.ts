import type {
    AIProvider,
    AIProviderEvidence,
    AIProviderRequest,
    AIProviderResult,
  } from "./aiProvider.js";

export class FakeProvider implements AIProvider {
  constructor(
    private readonly response: string,
    private readonly evidence: AIProviderEvidence = {
      model: "fake",
      usage: null,
    },
  ) {}

  async generate<TOutput = unknown>(
    _request: AIProviderRequest<TOutput>,
  ): Promise<AIProviderResult<TOutput>> {
    return {
      rawOutput: this.response,
      parsedOutput: null,
      refusal: null,
      provider: this.evidence,
    };
  }

}
