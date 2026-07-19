import type { ContextItem } from "../harness/contextItem.js";
import type { RoleSpec } from "../harness/roleSpec.js";
import type { TaskSpec } from "../harness/taskSpec.js";
import type { EvaluationResult } from "./evaluationResult.js";

export interface EvaluationInput {
  role: RoleSpec;
  task: TaskSpec;
  context: ContextItem[];
  prompt: string;
  output: string;
}

export interface Evaluator {
  id: string;
  evaluate(input: EvaluationInput): EvaluationResult;
}