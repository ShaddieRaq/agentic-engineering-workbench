import { scenarioSuiteDefinitionSchema } from "./scenarioSuiteDefinition.js";

export const coreReliabilitySuite =
  scenarioSuiteDefinitionSchema.parse({
    id: "core-reliability",
    description: "Core reliability scenarios.",
    scenarioIds: [
      "explain-agentic-harness",
    ],
  });