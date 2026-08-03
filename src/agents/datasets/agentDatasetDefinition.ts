import { z } from "zod";

export const agentDatasetPurposeSchema = z.enum([
  "development",
  "regression",
  "protected",
]);

export const agentDatasetCaseSchema = z
  .object({
    id: z.string().min(1),
    input: z.json(),
    expected: z.json().optional(),
  })
  .strict();

export const agentDatasetDefinitionSchema = z
  .object({
    id: z.string().min(1),
    description: z.string().min(1),
    agentId: z.string().min(1),
    purpose: agentDatasetPurposeSchema,
    cases: z
      .array(agentDatasetCaseSchema)
      .min(1)
      .refine(
        (cases) => new Set(cases.map(({ id }) => id)).size === cases.length,
        { message: "Agent dataset case IDs must be unique." },
      ),
  })
  .strict();

export type AgentDatasetCase = z.infer<typeof agentDatasetCaseSchema>;
export type AgentDatasetPurpose = z.infer<typeof agentDatasetPurposeSchema>;
export type AgentDatasetDefinition = z.infer<
  typeof agentDatasetDefinitionSchema
>;
