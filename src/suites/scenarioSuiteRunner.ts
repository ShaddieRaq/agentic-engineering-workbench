import type { ScenarioDefinition } from "../scenarios/scenarioDefinition.js";
import type { ScenarioSuiteDefinition } from "./scenarioSuiteDefinition.js";
import { resolveScenarioSuite } from "./scenarioSuiteResolver.js";

export type ScenarioExecutor = (
  scenario: ScenarioDefinition,
) => Promise<void>;

export async function runScenarioSuite(
  suite: ScenarioSuiteDefinition,
  executeScenario: ScenarioExecutor,
): Promise<void> {
  const scenarios = resolveScenarioSuite(suite);

  for (const scenario of scenarios) {
    await executeScenario(scenario);
  }
}