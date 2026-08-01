import { z } from "zod";

const executionOptionsSchema = z
  .object({
    repetitions: z.number().int().positive().default(1),
    concurrency: z.number().int().positive().default(1),
  })
  .strict();

export type ExecutionOptions = z.input<
  typeof executionOptionsSchema
>;

export type ResolvedExecutionOptions = z.output<
  typeof executionOptionsSchema
>;

export function parseExecutionOptions(
  options: ExecutionOptions = {},
): ResolvedExecutionOptions {
  return executionOptionsSchema.parse(options);
}