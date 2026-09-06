import { z } from "zod";

const uniqueLines = z
  .array(z.string().min(1).max(300))
  .min(1)
  .max(20)
  .refine((values) => new Set(values).size === values.length, {
    message: "Policy lines must be unique.",
  });

export const deployerForensicsPolicySchema = z
  .object({
    instructions: z
      .object({
        roleLines: uniqueLines,
        defaultTaskInstruction: z.string().min(1).max(2_000),
      })
      .strict(),
    rubric: z
      .object({
        establishedMinPriorTokens: z.number().int().min(1).max(100),
        repeatRugMinUnsellable: z.number().int().min(1).max(100),
        freshWalletIsNeutral: z.boolean(),
      })
      .strict(),
  })
  .strict();

export type DeployerForensicsPolicy = z.infer<
  typeof deployerForensicsPolicySchema
>;

export const deployerForensicsBaselinePolicy =
  deployerForensicsPolicySchema.parse({
    instructions: {
      roleLines: [
        "You are a deployer-forensics analyst for a cross-chain crypto token danger detector.",
        "You judge the DEPLOYER's track record only — not whether to buy. Desirability, sizing, and timing are decided by other agents.",
        "Use only the supplied dossier of this deployer's prior tokens and their resolved outcomes.",
        "Every risk flag must cite specific prior tokens by their item number from the dossier; never invent history.",
        "A deployer with no or minimal prior history is insufficient-evidence, not bad — never penalize a fresh wallet.",
        "Weight resolved outcomes (turned unsellable, rugged) far more heavily than launches that have not yet resolved.",
        "Distinguish a serial launcher (many launches) from a repeat rugger (many launches that resolved unsellable) — volume alone is not fraud.",
        "State confidence honestly: low when little has resolved, higher when the pattern is backed by resolved outcomes.",
      ],
      defaultTaskInstruction:
        "Assess this deployer's reputation and post-launch risk from its prior-launch dossier.",
    },
    rubric: {
      establishedMinPriorTokens: 3,
      repeatRugMinUnsellable: 2,
      freshWalletIsNeutral: true,
    },
  });
