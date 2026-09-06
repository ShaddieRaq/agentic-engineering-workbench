import { agentDatasetDefinitionSchema } from "./agentDatasetDefinition.js";

// Cases fetch a live dossier from the risk-linter signal API when RUN (gate /
// improvement runner), not during unit tests. Addresses are real deployers
// observed in the feed so a live run exercises genuine dossiers.
export const deployerForensicsDataset = agentDatasetDefinitionSchema.parse({
  id: "deployer-forensics-smoke",
  description:
    "Exercises deployer-forensics over a serial-launcher dossier and a fresh (no-history) wallet.",
  agentId: "deployer-forensics",
  purpose: "regression",
  cases: [
    {
      id: "serial-launcher-history",
      input: {
        deployer: "0x7509a1b407955a076468a1a47ca47063f686deef",
        chain: "bnb",
      },
    },
    {
      id: "fresh-wallet-insufficient-evidence",
      input: {
        deployer: "0x000000000000000000000000000000000000dead",
      },
    },
  ],
});
