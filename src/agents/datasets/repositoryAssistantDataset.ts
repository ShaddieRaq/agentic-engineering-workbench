import {
  agentDatasetDefinitionSchema,
} from "./agentDatasetDefinition.js";

export const repositoryAssistantDataset = agentDatasetDefinitionSchema.parse({
  id: "repository-assistant-smoke",
  description:
    "Exercises the registered repository assistant with its default analysis task.",
  agentId: "repository-assistant",
  cases: [
    {
      id: "architecture-review",
      input: {
        instruction:
          "Explain the repository architecture, identify concrete risks, and recommend tests using only loaded evidence.",
      },
    },
  ],
});
