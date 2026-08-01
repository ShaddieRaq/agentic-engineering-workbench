import { z } from "zod";
import { contextItemSchema } from "../harness/contextItem.js";
import { taskSpecSchema } from "../harness/taskSpec.js";

export const scenarioDatasetCaseSchema = z
  .object({
    id: z.string().min(1),
    scenarioId: z.string().min(1),
    task: taskSpecSchema,
    context: z.array(contextItemSchema),
  })
  .strict();

export type ScenarioDatasetCase = z.infer<
  typeof scenarioDatasetCaseSchema
>;