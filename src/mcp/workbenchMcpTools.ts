import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import type { AgentRegistry } from "../agents/agentRegistry.js";
import type { ArtifactListResult, StoredArtifact } from "../artifacts/artifactStore.js";
import type { FileArtifactStore } from "../artifacts/fileArtifactStore.js";
import { importExportFeedback } from "../foundry/exportFeedback.js";
import type {
  FoundryArtifactKind,
  FoundryArtifactListResult,
  FoundryArtifactStore,
  FoundryStoredArtifact,
} from "../foundry/foundryArtifactStore.js";

export interface WorkbenchMcpDependencies {
  agents: AgentRegistry;
  artifacts: FileArtifactStore;
  foundry: FoundryArtifactStore;
  exportsRoot: string;
}

export interface ExportedPackageFile {
  relativePath: string;
  content: string;
}

const exportablePackages: Record<string, Record<string, string>> = {
  "project-intake": { "claude-code": "claude-code/project-intake" },
};

async function collectFiles(root: string, directory: string): Promise<string[]> {
  const entries = await readdir(directory);
  const files: string[] = [];
  for (const entry of entries.sort()) {
    const path = join(directory, entry);
    const metadata = await stat(path);
    if (metadata.isDirectory()) {
      files.push(...(await collectFiles(root, path)));
    } else if (metadata.isFile()) {
      files.push(path);
    }
  }
  return files;
}

export function createWorkbenchMcpTools(deps: WorkbenchMcpDependencies) {
  return {
    async listAgents(): Promise<
      { id: string; version: string; status: string; description: string }[]
    > {
      return deps.agents.list().map((manifest) => ({
        id: manifest.id,
        version: manifest.version,
        status: manifest.status,
        description: manifest.description,
      }));
    },

    async describeAgent(input: { agentId: string }) {
      return deps.agents.get(input.agentId).manifest;
    },

    async listArtifacts(input: {
      source: "runs" | "foundry";
      kind?: string | undefined;
      agentId?: string | undefined;
      briefId?: string | undefined;
      limit?: number | undefined;
    }): Promise<ArtifactListResult | FoundryArtifactListResult> {
      if (input.source === "runs") {
        return deps.artifacts.list({
          ...(input.kind ? { kind: input.kind as never } : {}),
          ...(input.agentId ? { agentId: input.agentId } : {}),
          ...(input.limit ? { limit: input.limit } : {}),
        });
      }
      return deps.foundry.list({
        ...(input.kind ? { kind: input.kind as FoundryArtifactKind } : {}),
        ...(input.briefId ? { briefId: input.briefId } : {}),
        ...(input.limit ? { limit: input.limit } : {}),
      });
    },

    async getArtifact(input: {
      source: "runs" | "foundry";
      artifactId: string;
    }): Promise<StoredArtifact | FoundryStoredArtifact> {
      return input.source === "runs"
        ? deps.artifacts.load(input.artifactId)
        : deps.foundry.load(input.artifactId);
    },

    async submitFeedback(input: {
      bundleJson: string;
      exportDirectory?: string | undefined;
    }) {
      const bundle: unknown = JSON.parse(input.bundleJson);
      const exportDirectory = resolve(
        input.exportDirectory ?? join(deps.exportsRoot, "claude-code/project-intake"),
      );
      const provenance: unknown = JSON.parse(
        await readFile(join(exportDirectory, "provenance.json"), "utf8"),
      );
      const record = importExportFeedback({ bundle, provenance });
      const reference = await deps.foundry.saveExportFeedback(record);

      return {
        feedbackId: record.feedbackId,
        exportId: record.exportId,
        subject: record.subject,
        provenanceVerified: record.provenanceVerified,
        artifactPath: reference.path,
        issuesObserved: record.bundle.issuesObserved,
        observations: record.bundle.observations,
      };
    },

    async getApprovedExport(input: {
      agentId: string;
      target: "claude-code";
    }): Promise<{
      agentId: string;
      target: string;
      files: ExportedPackageFile[];
      installInstructions: string;
    }> {
      const packagePath = exportablePackages[input.agentId]?.[input.target];
      if (!packagePath) {
        throw new Error(
          `No approved ${input.target} export exists for ${input.agentId}. ` +
            `Exportable: ${Object.keys(exportablePackages).join(", ")}.`,
        );
      }

      const root = resolve(deps.exportsRoot, packagePath);
      const paths = await collectFiles(root, root);
      const files: ExportedPackageFile[] = [];
      for (const path of paths) {
        const relativePath = relative(root, path);
        if (relativePath.startsWith("..")) {
          throw new Error("Export package path escapes the exports directory.");
        }
        files.push({ relativePath, content: await readFile(path, "utf8") });
      }

      return {
        agentId: input.agentId,
        target: input.target,
        files,
        installInstructions:
          "Write these files into ~/.claude/skills/project-intake (user-wide) " +
          "or <project>/.claude/skills/project-intake (project-scoped), " +
          "preserving relative paths. Do not modify the contents.",
      };
    },
  };
}

export type WorkbenchMcpTools = ReturnType<typeof createWorkbenchMcpTools>;
