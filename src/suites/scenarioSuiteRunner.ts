import type { ScenarioDefinition } from "../scenarios/scenarioDefinition.js";
import type { ScenarioSuiteDefinition } from "./scenarioSuiteDefinition.js";
import { resolveScenarioSuite } from "./scenarioSuiteResolver.js";
import type { HarnessResult } from "../harness/harnessResult.js";

export type ScenarioExecutor = (
    scenario: ScenarioDefinition,
  ) => Promise<HarnessResult>;

  export interface ScenarioSuiteRunResult {
    suiteId: string;
    runs: HarnessResult[];
  }

  export async function runScenarioSuite(
    suite: ScenarioSuiteDefinition,
    executeScenario: ScenarioExecutor,
  ): Promise<ScenarioSuiteRunResult> {
    const scenarios = resolveScenarioSuite(suite);
    const runs: HarnessResult[] = [];

    for (const scenario of scenarios) {
      runs.push(await executeScenario(scenario));
    }

    return {
      suiteId: suite.id,
      runs,
    };
  }