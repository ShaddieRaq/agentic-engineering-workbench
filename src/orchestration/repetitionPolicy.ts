import { z } from "zod";

const repetitionOptionsSchema = z
  .object({
    repetitions: z.number().int().positive().default(1),
  })
  .strict();

export type RepetitionOptions = z.input<
  typeof repetitionOptionsSchema
>;

export type ResolvedRepetitionOptions = z.output<
  typeof repetitionOptionsSchema
>;

export function parseRepetitionOptions(
  options: RepetitionOptions = {},
): ResolvedRepetitionOptions {
  return repetitionOptionsSchema.parse(options);
}