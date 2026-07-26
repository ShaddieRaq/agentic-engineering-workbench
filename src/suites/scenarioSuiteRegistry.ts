import type { ScenarioSuiteDefinition } from "./scenarioSuiteDefinition.js";
import { coreReliabilitySuite } from "./coreReliabilitySuite.js";

const scenarioSuites: Record<
  string,
  ScenarioSuiteDefinition
> = {
  [coreReliabilitySuite.id]: coreReliabilitySuite,
};

export function getScenarioSuiteDefinition(
  id: string,
): ScenarioSuiteDefinition {
  const suite = scenarioSuites[id];

  if (!suite) {
    throw new Error(`Unknown scenario suite: ${id}`);
  }

  return suite;
}