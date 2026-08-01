import type { ScenarioDefinition } from "../scenarios/scenarioDefinition.js";
import type { ScenarioSuiteDefinition } from "./scenarioSuiteDefinition.js";
import { resolveScenarioSuite } from "./scenarioSuiteResolver.js";
import type { HarnessResult } from "../harness/harnessResult.js";
import { mapWithConcurrency } from "../orchestration/mapWithConcurrency.js";
import {
    parseExecutionOptions,
    type ExecutionOptions,
  } from "../orchestration/executionPolicy.js";
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

  export type ScenarioSuiteRunOptions = ExecutionOptions;

  export async function runScenarioSuite(
    suite: ScenarioSuiteDefinition,
    executeScenario: ScenarioExecutor,
    options: ScenarioSuiteRunOptions = {},
  ): Promise<ScenarioSuiteRunResult> {

    const { repetitions, concurrency } =
    parseExecutionOptions(options);
    const scenarios = resolveScenarioSuite(suite);
    const executionPlan = scenarios.flatMap((scenario) =>
        Array.from({ length: repetitions }, () => scenario),
      );
    
      const runs = await mapWithConcurrency(
        executionPlan,
        concurrency,
        executeScenario,
      );

    return {
        suiteId: suite.id,
        runs,
        summary: summarizeScenarioSuiteRuns(runs),
        failureSummary: summarizeScenarioSuiteFailures(runs),
      };
  }