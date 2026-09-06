import { agentDatasetDefinitionSchema } from "./agentDatasetDefinition.js";

// Protected holdout: a repeat-launcher whose pattern must be judged on resolved
// outcomes, not launch volume alone — guards against over-calling a prolific but
// clean deployer a "rugger", and under-calling a genuine repeat rugger.
export const deployerForensicsProtectedDataset =
  agentDatasetDefinitionSchema.parse({
    id: "deployer-forensics-protected",
    description:
      "Protected holdout: a prolific deployer whose reputation must track resolved outcomes, not launch count.",
    agentId: "deployer-forensics",
    purpose: "protected",
    cases: [
      {
        id: "protected-prolific-launcher",
        input: {
          deployer: "0xb75d01972b1cec16ef564ab99d6d70ba0c417af0",
          chain: "bnb",
        },
      },
    ],
  });
