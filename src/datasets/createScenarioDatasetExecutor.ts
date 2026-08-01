import { composeEvaluators } from "../evaluations/composeEvaluators.js";
import type { HarnessDefinition } from "../harness/harnessDefinition.js";
import type { RoleSpec } from "../harness/roleSpec.js";
import { SimpleHarness } from "../harness/simpleHarness.js";
import type { AIProvider } from "../providers/aiProvider.js";
import type { ScenarioDatasetExecutor } from "./scenarioDatasetRunner.js";

export interface ScenarioDatasetExecutorConfig {
  provider: AIProvider;
  role: RoleSpec;
  harnessDefinition: HarnessDefinition;
}

export function createScenarioDatasetExecutor({
  provider,
  role,
  harnessDefinition,
}: ScenarioDatasetExecutorConfig): ScenarioDatasetExecutor {
  return async ({ datasetCase, scenario }) => {
    const evaluators = composeEvaluators(
      harnessDefinition,
      scenario,
    );
    const harness = new SimpleHarness(
      provider,
      evaluators,
      harnessDefinition.id,
      scenario.id,
      scenario.outputSchema,
    );

    return harness.run(
      role,
      datasetCase.task,
      datasetCase.context,
    );
  };
}
