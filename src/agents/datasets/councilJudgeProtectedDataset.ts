import { agentDatasetDefinitionSchema } from "./agentDatasetDefinition.js";

// Protected holdout: a genuinely favorable case (high detector confidence, clean
// deployer, rug-resistant) should be able to earn an ACT — the judge must not
// reflexively skip everything, nor act when danger facts are present.
export const councilJudgeProtectedDataset = agentDatasetDefinitionSchema.parse({
  id: "council-judge-protected",
  description:
    "Protected holdout: a favorable case must be able to earn ACT; a dangerous one must SKIP.",
  agentId: "council-judge",
  purpose: "protected",
  cases: [
    {
      id: "rule-on-favorable-clean",
      input: {
        token: "0xfed0000000000000000000000000000000000fed",
        chain: "base",
        facts: [
          "detector verdict=CLEAR confidence=high",
          "sellable=true buy_ok=true sell_ok=true tax=0.3%",
          "rug_posture=rug-resistant (LP locked by locker)",
          "deployer actorReputation=established-clean confidence=high",
          "impersonation=none",
        ],
        forArgument:
          "High-confidence clear, locked LP, clean established deployer, no impersonation, cheap round-trip — a favorable asymmetric entry.",
        againstArgument:
          "Fresh launches usually fade; there is no demand signal yet, only the absence of danger.",
      },
    },
  ],
});
