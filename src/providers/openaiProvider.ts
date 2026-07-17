import OpenAI from "openai";

export class OpenAIProvider {
  private readonly client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async generateText(input: string): Promise<string> {
    const response = await this.client.responses.create({
      model: "gpt-5.4",
      input,
    });

    return response.output_text;
  }
}