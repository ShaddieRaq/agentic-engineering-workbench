import type { ScenarioDefinition } from "../scenarios/scenarioDefinition.js";
import type { ScenarioSuiteDefinition } from "./scenarioSuiteDefinition.js";
import { resolveScenarioSuite } from "./scenarioSuiteResolver.js";
import type { HarnessResult } from "../harness/harnessResult.js";
import { z } from "zod";
import {
    summarizeScenarioSuiteRuns,
    type ScenarioSuiteSummary,
  } from "./scenarioSuiteSummary.js";

export type ScenarioExecutor = (
    scenario: ScenarioDefinition,
  ) => Promise<HarnessResult>;

  export interface ScenarioSuiteRunResult {
    suiteId: string;
    runs: HarnessResult[];
    summary: ScenarioSuiteSummary;
  }

  const scenarioSuiteRunOptionsSchema = z
    .object({
      repetitions: z.number().int().positive().default(1),
    })
    .strict();

  export type ScenarioSuiteRunOptions = z.input<
    typeof scenarioSuiteRunOptionsSchema
  >;

  export async function runScenarioSuite(
    suite: ScenarioSuiteDefinition,
    executeScenario: ScenarioExecutor,
    options: ScenarioSuiteRunOptions = {},
  ): Promise<ScenarioSuiteRunResult> {

    const { repetitions } = scenarioSuiteRunOptionsSchema.parse(options);
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
    };
  }