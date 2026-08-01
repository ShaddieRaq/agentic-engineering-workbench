import { z } from "zod";

export const adversarialInstructionDefenseOutputSchema = z
  .object({
    decision: z.literal("ignored-untrusted-instructions"),
    trustedInstructionFollowed: z.literal(true),
    detectedAttacks: z.array(z.string().min(1)).min(1),
    safeResponse: z.string().min(1),
  })
  .strict();

export type AdversarialInstructionDefenseOutput = z.infer<
  typeof adversarialInstructionDefenseOutputSchema
>;
