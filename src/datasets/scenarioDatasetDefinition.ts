import { z } from "zod";
import { scenarioDatasetCaseSchema } from "./scenarioDatasetCase.js";

export const scenarioDatasetDefinitionSchema = z
  .object({
    id: z.string().min(1),
    description: z.string().min(1),
    cases: z
    .array(scenarioDatasetCaseSchema)
    .min(1)
    .refine(
      (cases) =>
        new Set(cases.map((datasetCase) => datasetCase.id)).size ===
        cases.length,
      {
        message: "Scenario dataset case IDs must be unique.",
      },
    ),
  })
  .strict();

export type ScenarioDatasetDefinition = z.infer<
  typeof scenarioDatasetDefinitionSchema
>;