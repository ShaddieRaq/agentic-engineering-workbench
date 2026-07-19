import type { EvaluationResult } from "./evaluationResult.js";

export interface Evaluator {
  id: string;
  evaluate(output: string): EvaluationResult;
}