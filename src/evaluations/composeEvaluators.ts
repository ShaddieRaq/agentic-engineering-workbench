import type { HarnessDefinition } from "../harness/harnessDefinition.js";
import type { ScenarioDefinition } from "../scenarios/scenarioDefinition.js";
import type { Evaluator } from "./evaluator.js";

export function composeEvaluators(
    harnessDefinition: HarnessDefinition,
    scenarioDefinition?: ScenarioDefinition,
  ): Evaluator[] {
    return [
      ...harnessDefinition.evaluators,
      ...(scenarioDefinition?.evaluators ?? []),
    ];
  }