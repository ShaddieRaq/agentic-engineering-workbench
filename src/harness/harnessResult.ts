import type { TaskSpec } from "./taskSpec.js";

export interface HarnessResult {
  task: TaskSpec;
  output: string;
  durationMs: number;
  completedAt: string;
}