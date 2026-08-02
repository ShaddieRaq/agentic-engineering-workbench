import { z } from "zod";
import { agentManifestSchema } from "./agentManifest.js";

export const agentRunFailureSchema = z
  .object({
    stage: z.enum(["catalog", "input", "execution", "output"]),
    category: z.enum(["validation", "execution"]),
    message: z.string().min(1),
  })
  .strict();

export const agentRunResultSchema = z
  .object({
    agentRunId: z.string().min(1),
    agentId: z.string().min(1),
    agentVersion: z.string().min(1),
    manifestDigest: z.string().regex(/^[a-f0-9]{64}$/),
    manifest: agentManifestSchema,
    input: z.json(),
    configuration: z
      .object({
        model: z.string().min(1),
        permittedToolIds: z.array(z.string().min(1)),
      })
      .strict(),
    output: z.json().nullable(),
    failure: agentRunFailureSchema.nullable(),
    succeeded: z.boolean(),
    durationMs: z.number().nonnegative(),
    completedAt: z.string().min(1),
  })
  .strict();

export type AgentRunFailure = z.infer<typeof agentRunFailureSchema>;
export type AgentRunResult = z.infer<typeof agentRunResultSchema>;
