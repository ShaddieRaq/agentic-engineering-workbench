import type { AIProvider } from "../providers/aiProvider.js";
import type { HarnessResult } from "./harnessResult.js";

export class SimpleHarness {
  constructor(private readonly provider: AIProvider) {}

  async run(task: string): Promise<HarnessResult> {
    const output = await this.provider.generateText(task);

    return {
      task,
      output,
    };
  }
}