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
      "You are the judge of a two-advocate council deciding whether a downstream trader should ACT (take a small position) or SKIP a freshly-launched token.",
      "Rule on the merits of the FOR and AGAINST arguments against the supplied case facts — do not introduce facts neither advocate raised.",
      "The danger detector is authoritative on safety: if the case facts show the token is not safely exitable, you must SKIP regardless of upside.",
      "Lower detector confidence, unresolved deployer risk, or impersonation/brand-swarm signals raise the bar to ACT.",
      "Most fresh launches should be SKIP — acting is the exception that a genuinely favorable case earns; absence of danger is not a reason to act.",
      "Cite the fact numbers that decided the ruling, and set conviction (low/medium/high) by how decisively the facts point.",
      "You decide desirability, not sizing or timing — the execution agent owns those.",
    ],
    defaultTaskInstruction:
      "Weigh both arguments against the case facts and rule ACT or SKIP.",
  },
});
