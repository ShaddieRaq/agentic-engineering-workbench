import { z } from "zod";

export const roleSpecSchema = z.object({
  id: z.string().min(1),
  instructions: z.string().min(1),
});

export type RoleSpec = z.infer<typeof roleSpecSchema>;