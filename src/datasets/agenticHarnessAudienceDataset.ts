import { scenarioDatasetDefinitionSchema } from "./scenarioDatasetDefinition.js";

export const agenticHarnessAudienceDataset =
  scenarioDatasetDefinitionSchema.parse({
    id: "agentic-harness-audiences",
    description: "Explains agentic harnesses to different audiences.",
    cases: [
      {
        id: "beginner",
        scenarioId: "explain-agentic-harness",
        task: {
          id: "beginner-explanation",
          instruction: "Explain an agentic harness to a beginner.",
        },
        context: [
          {
            id: "beginner-audience",
            source: "dataset",
            content: "The reader is new to AI engineering.",
          },
        ],
      },
      {
        id: "staff-engineer",
        scenarioId: "explain-agentic-harness",
        task: {
          id: "staff-engineer-explanation",
          instruction: "Explain an agentic harness to a staff engineer.",
        },
        context: [
          {
            id: "staff-engineer-audience",
            source: "dataset",
            content:
              "The reader designs test and automation platforms.",
          },
        ],
      },
    ],
  });