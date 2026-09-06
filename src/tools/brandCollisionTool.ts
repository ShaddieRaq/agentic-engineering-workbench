import { z } from "zod";
import type { ToolDefinition } from "./toolDefinition.js";

/**
 * Brand-collision tool — a thin HTTP bridge to the risk-linter signal API
 * (GET /collisions?symbol=&name=&chain=&exclude=). Returns which other
 * contracts reuse a candidate's name/symbol plus the pool of names/symbols
 * reused across many distinct contracts, so the impersonation-analyst agent
 * can judge whether the reuse is deceptive. Chain plumbing stays in Python
 * (Option B); this only fetches.
 */
export const brandCollisionInputSchema = z
  .object({
    symbol: z.string().min(1).max(120).optional(),
    name: z.string().min(1).max(200).optional(),
    chain: z.string().min(1).max(40).optional(),
    excludeToken: z.string().min(1).max(120).optional(),
  })
  .strict()
  .refine((value) => Boolean(value.symbol || value.name), {
    message: "Provide at least one of symbol or name.",
  });

const collisionRecordSchema = z.object({
  token: z.string().min(1),
  name: z.string().nullable().optional(),
  symbol: z.string().nullable().optional(),
  chain: z.string().nullable().optional(),
  venue: z.string().nullable().optional(),
  deployer: z.string().nullable().optional(),
  our_verdict: z.string().nullable().optional(),
  date: z.string().nullable().optional(),
});

export const brandCollisionOutputSchema = z.object({
  query: z.object({
    name: z.string().nullable().optional(),
    symbol: z.string().nullable().optional(),
    chain: z.string().nullable().optional(),
  }),
  same_symbol: z.array(collisionRecordSchema),
  same_name: z.array(collisionRecordSchema),
  notable_reused_symbols: z.array(
    z.object({ symbol: z.string(), distinct_contracts: z.number() }),
  ),
  summary: z.object({
    others_sharing_symbol: z.number(),
    others_sharing_name: z.number(),
    distinct_deployers_sharing_symbol: z.number(),
  }),
});

export type BrandCollisionInput = z.infer<typeof brandCollisionInputSchema>;
export type BrandCollisionOutput = z.infer<typeof brandCollisionOutputSchema>;

export interface BrandCollisionToolOptions {
  baseUrl?: string;
  timeoutMs?: number;
}

export function createBrandCollisionTool(
  options: BrandCollisionToolOptions = {},
): ToolDefinition<BrandCollisionInput, BrandCollisionOutput> {
  const baseUrl = (
    options.baseUrl ?? process.env.RISK_LINTER_API ?? "http://127.0.0.1:8787"
  ).replace(/\/+$/, "");
  const timeoutMs = options.timeoutMs ?? 10_000;

  return {
    id: "brand-collision",
    description:
      "Fetch name/symbol reuse facts (contracts sharing the identity + the reused-branding pool) from the local risk-linter signal API.",
    inputSchema: brandCollisionInputSchema,
    outputSchema: brandCollisionOutputSchema,
    async execute(input): Promise<BrandCollisionOutput> {
      const params = new URLSearchParams();
      if (input.symbol) params.set("symbol", input.symbol);
      if (input.name) params.set("name", input.name);
      if (input.chain) params.set("chain", input.chain);
      if (input.excludeToken) params.set("exclude", input.excludeToken);
      const url = `${baseUrl}/collisions?${params.toString()}`;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let payload: unknown;
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(
            `risk-linter signal API returned HTTP ${response.status}`,
          );
        }
        payload = await response.json();
      } catch (error: unknown) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Failed to reach risk-linter signal API at ${baseUrl}: ${reason}`,
        );
      } finally {
        clearTimeout(timer);
      }

      return brandCollisionOutputSchema.parse(payload);
    },
  };
}
