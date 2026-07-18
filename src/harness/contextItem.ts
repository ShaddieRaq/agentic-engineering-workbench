import { z } from "zod";

export const contextItemSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  content: z.string().min(1),
});

export type ContextItem = z.infer<typeof contextItemSchema>;