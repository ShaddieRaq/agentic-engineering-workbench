import type { ZodType } from "zod";
import type { Evaluator } from "../evaluations/evaluator.js";

export interface ScenarioDefinition {
  id: string;
  description: string;
  evaluators: Evaluator[];
  outputSchema?: ZodType;
}