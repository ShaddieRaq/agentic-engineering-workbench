import { z } from "zod";

const uniqueIds = z
  .array(z.string().min(1))
  .default([])
  .refine((ids) => new Set(ids).size === ids.length, {
    message: "Referenced IDs must be unique.",
  });

export const agentManifestSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    name: z.string().min(1),
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    status: z.enum(["experimental", "active", "deprecated", "retired"]),
    description: z.string().min(1),
    owner: z.string().min(1),
    tags: uniqueIds,
    defaultModel: z.string().min(1),
    components: z
      .object({
        workflowIds: uniqueIds,
        harnessIds: uniqueIds,
        scenarioIds: uniqueIds,
        datasetIds: uniqueIds,
      })
      .strict(),
    permissions: z
      .object({
        toolIds: uniqueIds,
      })
      .strict(),
    verification: z
      .object({
        datasetIds: uniqueIds,
        minimumPassRate: z.number().min(0).max(1).nullable().default(null),
      })
      .strict(),
  })
  .strict();

export type AgentManifest = z.infer<typeof agentManifestSchema>;
