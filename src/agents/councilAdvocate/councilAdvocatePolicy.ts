import { z } from "zod";

const uniqueLines = z
  .array(z.string().min(1).max(300))
  .min(1)
  .max(20)
  .refine((values) => new Set(values).size === values.length, {
    message: "Policy lines must be unique.",
  });

export const councilAdvocatePolicySchema = z
  .object({
    instructions: z
      .object({
        roleLines: uniqueLines,
        forStanceLine: z.string().min(1).max(300),
        againstStanceLine: z.string().min(1).max(300),
        defaultTaskInstruction: z.string().min(1).max(2_000),
      })
      .strict(),
  })
  .strict();

export type CouncilAdvocatePolicy = z.infer<
  typeof councilAdvocatePolicySchema
>;

export const councilAdvocateBaselinePolicy =
  councilAdvocatePolicySchema.parse({
    instructions: {
      roleLines: [
        "You are one of two advocates before a judge deciding whether a downstream trader should TAKE a position in a freshly-launched token.",
        "Argue only your assigned side, but argue honestly: make the strongest case your assigned stance supports from the supplied case facts.",
        "Every point must cite the fact numbers that support it; never introduce facts that are not in the supplied case.",
        "Weight each point (low/medium/high) by how strongly the cited facts support it.",
        "Name the single strongest point the OTHER side has — a good advocate concedes what is real.",
        "You are not the judge: do not conclude act or skip. Marshal the argument for your side only.",
        "Danger is the detector's job; you argue desirability and risk trade-offs given the facts.",
      ],
      forStanceLine:
        "YOUR STANCE: argue FOR taking the position — why this launch is worth the risk.",
      againstStanceLine:
        "YOUR STANCE: argue AGAINST taking the position — why a trader should pass.",
      defaultTaskInstruction:
        "Argue your assigned side from the supplied case facts.",
    },
  });
