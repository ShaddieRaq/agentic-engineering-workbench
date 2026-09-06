import { z } from "zod";
import type { ToolDefinition } from "./toolDefinition.js";

/**
 * Deployer-history tool — a thin HTTP bridge to the risk-linter signal API
 * (Option B: the chain plumbing is single-sourced in risk-linter's Python;
 * this tool only fetches a deployer's prior-launch dossier over local HTTP so
 * the deployer-forensics agent can reason over it). The endpoint is
 * `GET /deployer/<address>` served by `tools/signal_api.py serve`.
 */
export const deployerHistoryInputSchema = z
  .object({
    deployer: z.string().min(1).max(120),
    chain: z.string().min(1).max(40).optional(),
    excludeToken: z.string().min(1).max(120).optional(),
  })
  .strict();

const priorTokenSchema = z.object({
  token: z.string().min(1),
  chain: z.string().nullable().optional(),
  venue: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  symbol: z.string().nullable().optional(),
  date: z.string().nullable().optional(),
  ts: z.number().nullable().optional(),
  our_verdict: z.string().nullable().optional(),
  our_confidence: z.string().nullable().optional(),
  sellable: z.boolean().nullable().optional(),
  token_template: z.string().nullable().optional(),
  outcome: z.string().nullable().optional(),
  return: z.number().nullable().optional(),
  still_sellable: z.boolean().nullable().optional(),
});

const dossierSummarySchema = z.object({
  prior_count: z.number(),
  blocked_count: z.number(),
  resolved_unsellable_count: z.number(),
  chains: z.array(z.string()),
  first_seen: z.string().nullable().optional(),
  last_seen: z.string().nullable().optional(),
});

// Non-strict on purpose: tolerate the endpoint gaining fields without breaking.
export const deployerHistoryOutputSchema = z.object({
  deployer: z.string(),
  chain: z.string().nullable().optional(),
  prior_tokens: z.array(priorTokenSchema),
  summary: dossierSummarySchema,
});

export type DeployerHistoryInput = z.infer<typeof deployerHistoryInputSchema>;
export type DeployerHistoryOutput = z.infer<typeof deployerHistoryOutputSchema>;

export interface DeployerHistoryToolOptions {
  baseUrl?: string;
  timeoutMs?: number;
}

export function createDeployerHistoryTool(
  options: DeployerHistoryToolOptions = {},
): ToolDefinition<DeployerHistoryInput, DeployerHistoryOutput> {
  const baseUrl = (
    options.baseUrl ?? process.env.RISK_LINTER_API ?? "http://127.0.0.1:8787"
  ).replace(/\/+$/, "");
  const timeoutMs = options.timeoutMs ?? 10_000;

  return {
    id: "deployer-history",
    description:
      "Fetch a deployer's prior-launch dossier (prior tokens + resolved outcomes) from the local risk-linter signal API.",
    inputSchema: deployerHistoryInputSchema,
    outputSchema: deployerHistoryOutputSchema,
    async execute(input): Promise<DeployerHistoryOutput> {
      const params = new URLSearchParams();
      if (input.chain) params.set("chain", input.chain);
      if (input.excludeToken) params.set("exclude", input.excludeToken);
      const query = params.toString();
      const url = `${baseUrl}/deployer/${encodeURIComponent(input.deployer)}${
        query ? `?${query}` : ""
      }`;

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

      return deployerHistoryOutputSchema.parse(payload);
    },
  };
}
