import { agentDatasetDefinitionSchema } from "./agentDatasetDefinition.js";

// Protected holdout: reused branding must be judged on whether the reuse is
// concentrated in few deployers (spam-swarm) versus spread across many
// independent deployers (weaker trend-reuse) — not on reuse count alone.
export const impersonationAnalystProtectedDataset =
  agentDatasetDefinitionSchema.parse({
    id: "impersonation-analyst-protected",
    description:
      "Protected holdout: a reused symbol whose risk must track deployer concentration, not reuse count alone.",
    agentId: "impersonation-analyst",
    purpose: "protected",
    cases: [
      {
        id: "protected-reused-symbol",
        input: { symbol: "BOOD", chain: "bnb" },
      },
    ],
  });
