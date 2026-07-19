import type { Evaluator } from "../evaluations/evaluator.js";

export interface HarnessDefinition {
  id: string;
  description: string;
  evaluators: Evaluator[];
}