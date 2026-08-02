import { isAbsolute } from "node:path";
import { z } from "zod";

export const workspaceIdSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Workspace ID must use lowercase kebab-case.");

export const workspaceDefinitionSchema = z
  .object({
    id: workspaceIdSchema,
    name: z.string().min(1).max(100),
    rootPath: z.string().min(1).refine(isAbsolute, "Workspace root must be absolute."),
    addedAt: z.iso.datetime(),
    builtIn: z.boolean(),
  })
  .strict();

export type WorkspaceDefinition = z.infer<typeof workspaceDefinitionSchema>;

export interface AddWorkspaceInput {
  id: string;
  name?: string;
  rootPath: string;
}
