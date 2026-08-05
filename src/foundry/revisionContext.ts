import { z } from "zod";

export const revisionContextSchema = z
  .object({
    previous: z.json(),
    requestedRevisions: z.array(z.string().min(1).max(2_000)).min(1).max(20),
  })
  .strict();

export type RevisionContext = z.infer<typeof revisionContextSchema>;

export function renderRevisionSection(context: RevisionContext): string[] {
  return [
    "",
    "REVISION REQUEST:",
    "A prior version of this output was reviewed by the operator and sent",
    "back for revision. The prior version:",
    JSON.stringify(context.previous, null, 2),
    "",
    "Operator-requested revisions:",
    ...context.requestedRevisions.map((revision) => `- ${revision}`),
    "",
    "Produce a complete replacement that addresses every requested revision",
    "and preserves everything that was not questioned.",
  ];
}
