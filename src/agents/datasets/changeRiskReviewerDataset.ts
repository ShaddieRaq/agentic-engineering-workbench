import { agentDatasetDefinitionSchema } from "./agentDatasetDefinition.js";

export const changeRiskReviewerDataset = agentDatasetDefinitionSchema.parse({
  id: "change-risk-reviewer-smoke",
  description:
    "Exercises grounded risk classification and missing-test recommendations.",
  agentId: "change-risk-reviewer",
  purpose: "regression",
  cases: [
    {
      id: "working-tree-review",
      input: {
        instruction:
          "Review the observed working-tree changes and report only risks supported by loaded repository evidence.",
      },
    },
  ],
});
