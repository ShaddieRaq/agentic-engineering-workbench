import { z } from "zod";

// Usage-feedback channel (Decision 090): what the shipped software
// actually did on real inputs, recorded by the operator against the
// generation's completion. Field reports are evidence — they aggregate
// with standing advisories and are injected into the next reopened
// interview so generation N+1 starts from generation N's reality
// instead of the operator's memory.
export const fieldReportSchema = z
  .object({
    fieldReportId: z.uuid(),
    completionId: z.uuid(),
    briefId: z.uuid(),
    briefVersion: z.number().int().min(1),
    operatorId: z.string().min(1).max(200),
    report: z.string().min(1).max(8_000),
    createdAt: z.string().min(1),
  })
  .strict();

export type FieldReport = z.infer<typeof fieldReportSchema>;
