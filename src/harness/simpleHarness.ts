import type { AIProvider } from "../providers/aiProvider.js";
import type { HarnessResult } from "./harnessResult.js";
import type { TaskSpec } from "./taskSpec.js";

export class SimpleHarness {
    constructor(private readonly provider: AIProvider) {}
  
    async run(task: TaskSpec): Promise<HarnessResult> {
      const startedAt = performance.now();
  
      const output = await this.provider.generateText(task.instruction);
  
      const durationMs = performance.now() - startedAt;
  
      return {
        task,
        output,
        durationMs,
        completedAt: new Date().toISOString(),
      };
    }
  }