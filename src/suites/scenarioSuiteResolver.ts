import type { ScenarioDefinition } from "../scenarios/scenarioDefinition.js";
import { getScenarioDefinition } from "../scenarios/scenarioRegistry.js";
import type { ScenarioSuiteDefinition } from "./scenarioSuiteDefinition.js";

export function resolveScenarioSuite(
  suite: ScenarioSuiteDefinition,
): ScenarioDefinition[] {
  return suite.scenarioIds.map((scenarioId) =>
    getScenarioDefinition(scenarioId),
  );
}