import { agentDatasetDefinitionSchema } from "./agentDatasetDefinition.js";

// Pure reasoners over supplied facts — no tools, so these run without the
// signal API. The facts mimic an assembled case (detector signal + enrichment).
export const councilAdvocateDataset = agentDatasetDefinitionSchema.parse({
  id: "council-advocate-smoke",
  description:
    "Exercises the advocate arguing both sides of a clean-but-risky launch from supplied facts.",
  agentId: "council-advocate",
  purpose: "regression",
  cases: [
    {
      id: "argue-for",
      input: {
        stance: "for",
        token: "0xabc0000000000000000000000000000000000abc",
        chain: "bnb",
        facts: [
          "detector verdict=CLEAR confidence=high",
          "sellable=true buy_ok=true sell_ok=true tax=0.6%",
          "rug_posture=rug-resistant (LP locked)",
          "deployer actorReputation=established-clean confidence=medium",
          "impersonation=none",
        ],
      },
    },
    {
      id: "argue-against",
      input: {
        stance: "against",
        token: "0xabc0000000000000000000000000000000000abc",
        chain: "bnb",
        facts: [
          "detector verdict=CLEAR confidence=medium",
          "sellable=true tax=0.6%",
          "rug_posture=lp-unlocked (deployer can pull)",
          "deployer actorReputation=serial-launcher confidence=medium",
          "impersonation=spam-swarm confidence=high",
        ],
      },
    },
  ],
});
