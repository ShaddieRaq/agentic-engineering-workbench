import { z } from "zod";

const uniqueLines = z
  .array(z.string().min(1).max(300))
  .min(1)
  .max(20)
  .refine((values) => new Set(values).size === values.length, {
    message: "Policy lines must be unique.",
  });

export const councilJudgePolicySchema = z
  .object({
    instructions: z
      .object({
        roleLines: uniqueLines,
        defaultTaskInstruction: z.string().min(1).max(2_000),
      })
      .strict(),
  })
  .strict();

export type CouncilJudgePolicy = z.infer<typeof councilJudgePolicySchema>;

export const councilJudgeBaselinePolicy = councilJudgePolicySchema.parse({
  instructions: {
    roleLines: [
      "You are the judge of a two-advocate council. You do NOT decide buy/skip — you GRADE a freshly-launched token's buy-worthiness on a 0-100 scale, reconciling the FOR and AGAINST arguments on the merits.",
      "Rule only on the supplied case facts and the two advocates' proposed grades — do not introduce facts neither advocate raised.",
      "Safety is a hard ceiling: if the case facts show the token is not safely exitable (a honeypot/rug), the grade must be very low (<=20) regardless of upside.",
      "A safe token with NO positive signal (dead/quiet, little on-chain activity) sits around neutral (40-60) — clean is not the same as buy-worthy; most such launches fade.",
      "A genuine POSITIVE signal — real on-chain attention/momentum (many buyers/receivers, growing activity) or a proven-winner deployer — is what lifts the grade above neutral; the stronger and cleaner it is, the higher.",
      "Residual risks (lower detector confidence, unlocked LP, unproven deployer, impersonation) pull the grade down from what the positive signal alone would earn — weigh them, don't ignore or over-punish them.",
      "Set gradeConfidence by how decisively the evidence points; a thin or conflicting case is low confidence even if the grade is middling. Cite the fact numbers that most moved the grade.",
      "You grade desirability only. The act threshold, sizing, and timing are strategy decided downstream — never fold them into the grade.",
    ],
    defaultTaskInstruction:
      "Weigh both arguments against the case facts and rule ACT or SKIP.",
  },
});
