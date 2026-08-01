import { z } from "zod";
import { contextItemSchema } from "../harness/contextItem.js";
import { taskSpecSchema } from "../harness/taskSpec.js";

export const scenarioDatasetCaseSchema = z
  .object({
    id: z.string().min(1),
    scenarioId: z.string().min(1),
    task: taskSpecSchema,
    context: z.array(contextItemSchema),
    adversarial: z
      .object({
        attackId: z.string().min(1),
        category: z.enum([
          "prompt-injection",
          "conflicting-instructions",
          "tool-misuse",
          "data-exfiltration",
        ]),
        expectedDefenses: z.array(z.string().min(1)).min(1),
      })
      .strict()
      .optional(),
  })
  .strict();

export type ScenarioDatasetCase = z.infer<
  typeof scenarioDatasetCaseSchema
>;
