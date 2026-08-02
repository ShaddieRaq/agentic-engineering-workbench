import { agentDatasetDefinitionSchema } from "./agentDatasetDefinition.js";

export const documentationAuditorDataset = agentDatasetDefinitionSchema.parse({
  id: "documentation-auditor-smoke",
  description: "Exercises documentation auditing over a repository with documentation and source evidence.",
  agentId: "documentation-auditor",
  cases: [
    {
      id: "documentation-health",
      input: {
        instruction: "Identify documentation drift and missing coverage using exact repository evidence paths.",
        maximumContextFiles: 16,
      },
    },
  ],
});
