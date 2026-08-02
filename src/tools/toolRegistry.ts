import { createInspectGitDiffTool } from "./inspectGitDiffTool.js";
import { createFileInventoryTool } from "./fileInventoryTool.js";
import { createInspectPackageTool } from "./inspectPackageTool.js";
import { createListFilesTool } from "./listFilesTool.js";
import { createReadFileTool } from "./readFileTool.js";
import { createSearchTextTool } from "./searchTextTool.js";
import { createDependencyVersionAuditorTool } from "./dependencyVersionAuditor.js";
import type { ToolDefinition } from "./toolDefinition.js";
import type { AgentToolCatalog } from "../agents/agentRegistration.js";

export class ToolRegistry implements AgentToolCatalog {
  readonly #tools: ReadonlyMap<string, ToolDefinition<any, any>>;

  constructor(tools: readonly ToolDefinition<any, any>[]) {
    const entries = tools.map((tool) => [tool.id, tool] as const);
    const ids = entries.map(([id]) => id);

    if (new Set(ids).size !== ids.length) {
      throw new Error("Tool IDs must be unique.");
    }

    this.#tools = new Map(entries);
  }

  get<TInput, TOutput>(id: string): ToolDefinition<TInput, TOutput> {
    const tool = this.#tools.get(id);

    if (!tool) {
      throw new Error(`Unknown tool: ${id}`);
    }

    return tool as ToolDefinition<TInput, TOutput>;
  }

  ids(): string[] {
    return [...this.#tools.keys()].sort((left, right) =>
      left.localeCompare(right),
    );
  }

  subset(allowedIds: readonly string[]): ToolRegistry {
    return new ToolRegistry(
      allowedIds.map((id) => this.get(id)),
    );
  }
}

export function createPlatformToolRegistry(
  allowedRoot: string,
): ToolRegistry {
  return new ToolRegistry([
    createDependencyVersionAuditorTool({ allowedRoot }),
    createFileInventoryTool({ allowedRoot }),
    createInspectGitDiffTool({ allowedRoot }),
    createInspectPackageTool({ allowedRoot }),
    createListFilesTool({ allowedRoot }),
    createReadFileTool({ allowedRoot }),
    createSearchTextTool({ allowedRoot }),
  ]);
}
