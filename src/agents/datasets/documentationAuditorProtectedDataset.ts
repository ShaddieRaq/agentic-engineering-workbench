import { agentDatasetDefinitionSchema } from "./agentDatasetDefinition.js";

export const documentationAuditorProtectedDataset =
  agentDatasetDefinitionSchema.parse({
    id: "documentation-auditor-protected",
    description:
      "Protects grounded documentation auditing behavior from candidate regressions without exposing the case to improvement analysis.",
    agentId: "documentation-auditor",
    purpose: "protected",
    cases: [
      {
        id: "grounded-documentation-audit",
        input: {
          instruction:
            "Audit the available repository documentation and ground every conclusion in exact supplied evidence paths.",
          maximumContextFiles: 16,
        },
      },
    ],
  });
