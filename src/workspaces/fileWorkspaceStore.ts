import { access, mkdir, readFile, realpath, rename, stat, writeFile } from "node:fs/promises";
import { basename, dirname, parse, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  workspaceDefinitionSchema,
  workspaceIdSchema,
  type AddWorkspaceInput,
  type WorkspaceDefinition,
} from "./workspaceDefinition.js";

const workspaceFileSchema = z
  .object({
    version: z.literal(1),
    workspaces: z.array(workspaceDefinitionSchema.omit({ builtIn: true })),
  })
  .strict();

export class FileWorkspaceStore {
  readonly #builtIn: WorkspaceDefinition;

  constructor(
    readonly filePath: string,
    builtInRoot: string,
    builtInId = "workbench",
  ) {
    this.#builtIn = workspaceDefinitionSchema.parse({
      id: builtInId,
      name: "Agentic Engineering Workbench",
      rootPath: resolve(builtInRoot),
      addedAt: new Date(0).toISOString(),
      builtIn: true,
    });
  }

  get defaultWorkspace(): WorkspaceDefinition {
    return this.#builtIn;
  }

  async list(): Promise<WorkspaceDefinition[]> {
    const persisted = await this.#read();
    return [
      this.#builtIn,
      ...persisted.workspaces.map((workspace) => ({ ...workspace, builtIn: false as const })),
    ].sort((left, right) => left.id.localeCompare(right.id));
  }

  async get(id: string): Promise<WorkspaceDefinition> {
    workspaceIdSchema.parse(id);
    const workspace = (await this.list()).find((candidate) => candidate.id === id);
    if (!workspace) throw new Error(`Unknown workspace: ${id}`);
    await this.#assertDirectory(workspace.rootPath);
    return workspace;
  }

  async add(input: AddWorkspaceInput): Promise<WorkspaceDefinition> {
    const id = workspaceIdSchema.parse(input.id);
    const rootPath = await realpath(resolve(input.rootPath));
    await this.#assertDirectory(rootPath);
    if (parse(rootPath).root === rootPath) {
      throw new Error("The filesystem root cannot be registered as a workspace.");
    }
    const current = await this.list();
    if (current.some((workspace) => workspace.id === id)) {
      throw new Error(`Workspace ID already registered: ${id}`);
    }
    if (current.some((workspace) => workspace.rootPath === rootPath)) {
      throw new Error(`Workspace path already registered: ${rootPath}`);
    }
    const workspace = workspaceDefinitionSchema.parse({
      id,
      name: input.name?.trim() || basename(rootPath),
      rootPath,
      addedAt: new Date().toISOString(),
      builtIn: false,
    });
    const persisted = await this.#read();
    persisted.workspaces.push({
      id: workspace.id,
      name: workspace.name,
      rootPath: workspace.rootPath,
      addedAt: workspace.addedAt,
    });
    await this.#write(persisted);
    return workspace;
  }

  async remove(id: string): Promise<void> {
    workspaceIdSchema.parse(id);
    if (id === this.#builtIn.id) throw new Error("The built-in workspace cannot be removed.");
    const persisted = await this.#read();
    const remaining = persisted.workspaces.filter((workspace) => workspace.id !== id);
    if (remaining.length === persisted.workspaces.length) {
      throw new Error(`Unknown workspace: ${id}`);
    }
    await this.#write({ version: 1, workspaces: remaining });
  }

  async #read(): Promise<z.infer<typeof workspaceFileSchema>> {
    try {
      await access(this.filePath);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { version: 1, workspaces: [] };
      }
      throw error;
    }
    return workspaceFileSchema.parse(JSON.parse(await readFile(this.filePath, "utf8")));
  }

  async #write(value: z.infer<typeof workspaceFileSchema>): Promise<void> {
    const parsed = workspaceFileSchema.parse(value);
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(parsed, null, 2), { encoding: "utf8", flag: "wx" });
    await rename(temporaryPath, this.filePath);
  }

  async #assertDirectory(path: string): Promise<void> {
    const metadata = await stat(path);
    if (!metadata.isDirectory()) throw new Error(`Workspace root is not a directory: ${path}`);
  }
}
