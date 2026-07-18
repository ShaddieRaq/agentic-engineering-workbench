import type { AIProvider } from "../providers/aiProvider.js";
import { buildPrompt } from "./buildPrompt.js";
import type { HarnessResult } from "./harnessResult.js";
import type { RoleSpec } from "./roleSpec.js";
import type { TaskSpec } from "./taskSpec.js";

export class SimpleHarness {
  constructor(private readonly provider: AIProvider) {}

  async run(role: RoleSpec, task: TaskSpec): Promise<HarnessResult> {
    const startedAt = performance.now();
    const prompt = buildPrompt(role, task);

    const output = await this.provider.generateText(prompt);

    const durationMs = performance.now() - startedAt;

    return {
        role,
        task,
        output,
        durationMs,
        completedAt: new Date().toISOString(),
      };
  }
}