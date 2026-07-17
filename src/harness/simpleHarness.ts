import type { AIProvider } from "../providers/aiProvider.js";

export class SimpleHarness {
  constructor(private readonly provider: AIProvider) {}

  async run(task: string): Promise<string> {
    return this.provider.generateText(task);
  }
}