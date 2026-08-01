import { z } from "zod";
import { executionOptionsSchema } from "../orchestration/executionPolicy.js";

const experimentVariantSchema = z
  .object({
    id: z.string().min(1),
    rolePath: z.string().min(1),
  })
  .strict();

export const scenarioDatasetExperimentDefinitionSchema = z
  .object({
    id: z.string().min(1),
    datasetId: z.string().min(1),
    harnessId: z.string().min(1),
    baseline: experimentVariantSchema,
    candidate: experimentVariantSchema,
    execution: executionOptionsSchema,
  })
  .strict()
  .refine(
    ({ baseline, candidate }) => baseline.id !== candidate.id,
    {
      message: "Baseline and candidate IDs must be different.",
      path: ["candidate", "id"],
    },
  );

export type ScenarioDatasetExperimentDefinition = z.infer<
  typeof scenarioDatasetExperimentDefinitionSchema
>;
