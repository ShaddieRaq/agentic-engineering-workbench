import { agentDatasetDefinitionSchema } from "./agentDatasetDefinition.js";

// Protected holdout: even arguing FOR, the advocate must stay grounded in the
// supplied facts and concede the strongest opposing point rather than overclaim.
export const councilAdvocateProtectedDataset =
  agentDatasetDefinitionSchema.parse({
    id: "council-advocate-protected",
    description:
      "Protected holdout: arguing for a weak case must remain fact-grounded and concede the opposing point.",
    agentId: "council-advocate",
    purpose: "protected",
    cases: [
      {
        id: "argue-for-weak-case",
        input: {
          stance: "for",
          token: "0xdef0000000000000000000000000000000000def",
          chain: "base",
          facts: [
            "detector verdict=CLEAR confidence=low",
            "sellable=true tax=3.1%",
            "rug_posture=lp-unlocked",
            "deployer actorReputation=insufficient-evidence",
            "impersonation=reused-branding confidence=medium",
          ],
        },
      },
    ],
  });
