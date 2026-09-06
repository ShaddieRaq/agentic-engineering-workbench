import { agentDatasetDefinitionSchema } from "./agentDatasetDefinition.js";

// Cases fetch live collision facts from the risk-linter signal API when RUN,
// not during unit tests. Symbols are real reused-branding observed in the feed.
export const impersonationAnalystDataset = agentDatasetDefinitionSchema.parse({
  id: "impersonation-analyst-smoke",
  description:
    "Exercises impersonation analysis over a reused-branding symbol and a unique symbol (no collisions).",
  agentId: "impersonation-analyst",
  purpose: "regression",
  cases: [
    {
      id: "reused-branding-symbol",
      input: { symbol: "Demumu", chain: "bnb" },
    },
    {
      id: "unique-symbol-no-collisions",
      input: { symbol: "zzq-unique-ticker-9f3a", name: "Zzq Unique Ticker" },
    },
  ],
});
