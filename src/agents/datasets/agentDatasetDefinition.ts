import { z } from "zod";

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
export type AgentDatasetDefinition = z.infer<
  typeof agentDatasetDefinitionSchema
>;
