/**
 * Evidence citation by item number, not by verbatim address.
 *
 * Grounding requires an agent to cite the supplied evidence. Making the model
 * reproduce 40-character hex token addresses is error-prone — a single mistyped
 * digit fails an otherwise-correct judgment. Instead we number the evidence
 * items [1..N] in the prompt, the model cites those integers, grounding checks
 * the integers are in range, and we resolve them back to real addresses on our
 * side. Integers are trivial for a model to reproduce exactly.
 */
import { z } from "zod";

export interface CitationGrounding {
  passed: boolean;
  availableRefs: number[];
  citedRefs: number[];
  invalidRefs: number[];
  message: string;
}

/** Zod mirror of CitationGrounding, for agents that expose the diagnostic in their output. */
export const citationGroundingSchema = z
  .object({
    passed: z.boolean(),
    availableRefs: z.array(z.number().int()),
    citedRefs: z.array(z.number().int()),
    invalidRefs: z.array(z.number().int()),
    message: z.string(),
  })
  .strict();

export function evaluateCitationGrounding(
  citedRefs: number[],
  itemCount: number,
): CitationGrounding {
  const cited = [...new Set(citedRefs)].sort((a, b) => a - b);
  const invalidRefs = cited.filter(
    (ref) => !Number.isInteger(ref) || ref < 1 || ref > itemCount,
  );
  return {
    passed: invalidRefs.length === 0,
    availableRefs: Array.from({ length: itemCount }, (_, index) => index + 1),
    citedRefs: cited,
    invalidRefs,
    message:
      invalidRefs.length === 0
        ? "Every cited evidence item resolves to a supplied fact."
        : `Cites evidence items not in the supplied facts: ${invalidRefs.join(", ")}.`,
  };
}

/** Resolve 1-based item numbers to their addresses, de-duplicated, in order. */
export function resolveCitationRefs(
  refs: number[],
  tokens: readonly string[],
): string[] {
  const resolved: string[] = [];
  const seen = new Set<string>();
  for (const ref of [...refs].sort((a, b) => a - b)) {
    if (!Number.isInteger(ref) || ref < 1 || ref > tokens.length) continue;
    const token = tokens[ref - 1]!;
    if (seen.has(token)) continue;
    seen.add(token);
    resolved.push(token);
  }
  return resolved;
}
