import { z } from "zod";

export const taskSpecSchema = z.object({
  id: z.string().min(1),
  instruction: z.string().min(1),
});

export type TaskSpec = z.infer<typeof taskSpecSchema>;