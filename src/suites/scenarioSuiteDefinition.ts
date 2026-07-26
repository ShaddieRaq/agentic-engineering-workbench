import { z } from "zod";

export const scenarioSuiteDefinitionSchema = z
    .object({
        id: z.string().min(1),
        description: z.string().min(1),
        scenarioIds: z
            .array(z.string().min(1))
            .min(1)
            .refine(
                (scenarioIds) =>
                    new Set(scenarioIds).size ===
                    scenarioIds.length,
                {
                    message: "Scenario IDs must be unique.",
                },
            ),
    })
    .strict();

export type ScenarioSuiteDefinition = z.infer<
    typeof scenarioSuiteDefinitionSchema
>;