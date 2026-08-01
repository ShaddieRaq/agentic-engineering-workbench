import type { ScenarioDefinition } from "../scenarios/scenarioDefinition.js";
import type { ScenarioSuiteDefinition } from "./scenarioSuiteDefinition.js";
import { resolveScenarioSuite } from "./scenarioSuiteResolver.js";
import type { HarnessResult } from "../harness/harnessResult.js";
import {
    parseRepetitionOptions,
    type RepetitionOptions,
  } from "../orchestration/repetitionPolicy.js";
import {
    summarizeScenarioSuiteFailures,
    summarizeScenarioSuiteRuns,
    type ScenarioSuiteFailureSummary,
    type ScenarioSuiteSummary,
  } from "./scenarioSuiteSummary.js";

export type ScenarioExecutor = (
    scenario: ScenarioDefinition,
  ) => Promise<HarnessResult>;

  export interface ScenarioSuiteRunResult {
    suiteId: string;
    runs: HarnessResult[];
    summary: ScenarioSuiteSummary;
    failureSummary: ScenarioSuiteFailureSummary;
  }

  export type ScenarioSuiteRunOptions = RepetitionOptions;

  export async function runScenarioSuite(
    suite: ScenarioSuiteDefinition,
    executeScenario: ScenarioExecutor,
    options: ScenarioSuiteRunOptions = {},
  ): Promise<ScenarioSuiteRunResult> {

    const { repetitions } = parseRepetitionOptions(options);
    const scenarios = resolveScenarioSuite(suite);
    const runs: HarnessResult[] = [];

    for (const scenario of scenarios) {
      for (let repetition = 0; repetition < repetitions; repetition += 1) {
        runs.push(await executeScenario(scenario));
      }
    }

    return {
        suiteId: suite.id,
        runs,
        summary: summarizeScenarioSuiteRuns(runs),
        failureSummary: summarizeScenarioSuiteFailures(runs),
      };
  }