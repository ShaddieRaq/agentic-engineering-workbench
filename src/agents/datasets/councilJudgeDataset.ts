import { agentDatasetDefinitionSchema } from "./agentDatasetDefinition.js";

export const councilJudgeDataset = agentDatasetDefinitionSchema.parse({
  id: "council-judge-smoke",
  description:
    "Exercises the judge ruling on a clean-but-risky launch given both advocate arguments.",
  agentId: "council-judge",
  purpose: "regression",
  cases: [
    {
      id: "rule-on-risky-clean",
      input: {
        token: "0xabc0000000000000000000000000000000000abc",
        chain: "bnb",
        facts: [
          "detector verdict=CLEAR confidence=medium",
          "sellable=true tax=0.6%",
          "rug_posture=lp-unlocked (deployer can pull)",
          "deployer actorReputation=serial-launcher confidence=medium",
          "impersonation=spam-swarm confidence=high",
        ],
        forArgument:
          "The token cleared the danger screen and is currently sellable at low tax, so a small position can be exited if it moves.",
        againstArgument:
          "LP is unlocked, the deployer is a serial launcher, and the symbol is a spam-swarm brand — the base rate here is a dump.",
      },
    },
  ],
});
