import { randomUUID } from "node:crypto";
import {
  createInspectGitDiffTool,
  type InspectGitDiffOutput,
} from "../tools/inspectGitDiffTool.js";
import {
  createInspectPackageTool,
  type InspectPackageOutput,
} from "../tools/inspectPackageTool.js";
import {
  createListFilesTool,
  type ListFilesOutput,
} from "../tools/listFilesTool.js";
import {
  createReadFileTool,
  type ReadFileInput,
  type ReadFileOutput,
} from "../tools/readFileTool.js";
import type { ToolDefinition } from "../tools/toolDefinition.js";
import {
  executeTool,
  type ToolCallEvidence,
} from "../tools/toolExecutor.js";
import {
  selectRepositoryContext,
  type RepositoryContextSelection,
} from "./repositoryContextSelector.js";
import {
  loadRepositoryContext,
  type RepositoryContextAssembly,
} from "./repositoryContextLoader.js";

export interface RepositoryInspectionTools {
  packageMetadata: ToolDefinition<
    { path: string; maxBytes: number },
    InspectPackageOutput
  >;
  repositoryFiles: ToolDefinition<
    { path: string; maxEntries: number },
    ListFilesOutput
  >;
  gitChanges: ToolDefinition<
    {
      mode: "working-tree" | "staged" | "workspace";
      contextLines: number;
      maxBytes: number;
    },
    InspectGitDiffOutput
  >;
  contextFiles: ToolDefinition<ReadFileInput, ReadFileOutput>;
}

export type RepositoryInspectionStep =
  | {
      stepId: "package-metadata";
      evidence: ToolCallEvidence<InspectPackageOutput>;
    }
  | {
      stepId: "repository-files";
      evidence: ToolCallEvidence<ListFilesOutput>;
    }
  | {
      stepId: "git-changes";
      evidence: ToolCallEvidence<InspectGitDiffOutput>;
    };

export interface RepositoryInspectionWorkflowResult {
  workflowRunId: string;
  workflowId: "repository-inspection";
  steps: RepositoryInspectionStep[];
  contextSelection: RepositoryContextSelection;
  contextAssembly: RepositoryContextAssembly;
  succeeded: boolean;
  durationMs: number;
  completedAt: string;
}

export interface RepositoryInspectionWorkflowOptions {
  allowedRoot: string;
  maximumEntries?: number;
  maximumPackageBytes?: number;
  maximumDiffBytes?: number;
  gitTimeoutMs?: number;
}

export function createRepositoryInspectionTools(
  options: RepositoryInspectionWorkflowOptions,
): RepositoryInspectionTools {
  return {
    packageMetadata: createInspectPackageTool({
      allowedRoot: options.allowedRoot,
      maximumBytes: options.maximumPackageBytes ?? 65_536,
    }),
    repositoryFiles: createListFilesTool({
      allowedRoot: options.allowedRoot,
      maximumEntries: options.maximumEntries ?? 100,
    }),
    gitChanges: createInspectGitDiffTool({
      allowedRoot: options.allowedRoot,
      maximumBytes: options.maximumDiffBytes ?? 65_536,
      timeoutMs: options.gitTimeoutMs ?? 5_000,
    }),
    contextFiles: createReadFileTool({
      allowedRoot: options.allowedRoot,
      maximumBytes: 32_768,
    }),
  };
}

export async function runRepositoryInspectionWorkflow(
  tools: RepositoryInspectionTools,
): Promise<RepositoryInspectionWorkflowResult> {
  const startedAt = performance.now();
  const packageEvidence = await executeTool(tools.packageMetadata, {
    path: "package.json",
    maxBytes: 65_536,
  });
  const fileEvidence = await executeTool(tools.repositoryFiles, {
    path: ".",
    maxEntries: 50,
  });
  const changeEvidence = await executeTool(tools.gitChanges, {
    mode: "workspace",
    contextLines: 3,
    maxBytes: 65_536,
  });
  const steps: RepositoryInspectionStep[] = [
    { stepId: "package-metadata", evidence: packageEvidence },
    { stepId: "repository-files", evidence: fileEvidence },
    { stepId: "git-changes", evidence: changeEvidence },
  ];
  const contextSelection = selectRepositoryContext(
    fileEvidence,
    changeEvidence,
  );
  const contextAssembly = await loadRepositoryContext(
    contextSelection,
    tools.contextFiles,
  );

  return {
    workflowRunId: randomUUID(),
    workflowId: "repository-inspection",
    steps,
    contextSelection,
    contextAssembly,
    succeeded:
      steps.every((step) => step.evidence.succeeded) &&
      contextAssembly.rejectedCandidates.every(
        ({ reason }) => reason === "budget-exhausted",
      ),
    durationMs: performance.now() - startedAt,
    completedAt: new Date().toISOString(),
  };
}
