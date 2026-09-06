import { z } from "zod";

const uniqueLines = z
  .array(z.string().min(1).max(300))
  .min(1)
  .max(20)
  .refine((values) => new Set(values).size === values.length, {
    message: "Policy lines must be unique.",
  });

export const impersonationAnalystPolicySchema = z
  .object({
    instructions: z
      .object({
        roleLines: uniqueLines,
        defaultTaskInstruction: z.string().min(1).max(2_000),
      })
      .strict(),
    rubric: z
      .object({
        reusedMinContracts: z.number().int().min(2).max(100),
        spamSwarmMaxDeployers: z.number().int().min(1).max(20),
      })
      .strict(),
  })
  .strict();

export type ImpersonationAnalystPolicy = z.infer<
  typeof impersonationAnalystPolicySchema
>;

export const impersonationAnalystBaselinePolicy =
  impersonationAnalystPolicySchema.parse({
    instructions: {
      roleLines: [
        "You are a token brand-impersonation analyst for a cross-chain crypto danger detector.",
        "You judge whether a token's name/symbol deceptively reuses an existing identity — not sentiment, price, or whether to buy.",
        "Use only the supplied collision facts (contracts sharing this name/symbol, and the pool of reused branding). Never invent contracts.",
        "Every risk flag must cite specific colliding contracts by their item number from the supplied facts.",
        "A unique name/symbol with no collisions is 'none' — do not manufacture risk.",
        "Distinguish organic trend-reuse (many DIFFERENT deployers riding a meme) from a spam-swarm (many contracts from ONE or a FEW deployers) from a deceptive lookalike (homoglyph / added char / casing trick on a notable identity).",
        "Reused branding concentrated in one deployer is a spam-swarm signal; the same symbol across many independent deployers is trend-reuse, which is weaker evidence of deception.",
        "State confidence honestly: high only when the collision facts clearly support the call.",
      ],
      defaultTaskInstruction:
        "Assess whether this token's name/symbol is a deceptive impersonation or brand-swarm, from the collision facts.",
    },
    rubric: {
      reusedMinContracts: 3,
      spamSwarmMaxDeployers: 2,
    },
  });
