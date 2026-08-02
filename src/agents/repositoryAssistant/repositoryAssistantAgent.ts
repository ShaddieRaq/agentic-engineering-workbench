import { z } from "zod";
import type {
  InspectGitDiffInput,
  InspectGitDiffOutput,
} from "../../tools/inspectGitDiffTool.js";
import type {
  InspectPackageInput,
  InspectPackageOutput,
} from "../../tools/inspectPackageTool.js";
import type {
  ListFilesInput,
  ListFilesOutput,
} from "../../tools/listFilesTool.js";
import type {
  ReadFileInput,
  ReadFileOutput,
} from "../../tools/readFileTool.js";
import { runRepositoryAnalysis } from "../../workflows/repositoryAnalysisRunner.js";
import { runRepositoryAssistantWorkflow } from "../../workflows/repositoryAssistantWorkflow.js";
import {
  runRepositoryInspectionWorkflow,
  type RepositoryInspectionTools,
} from "../../workflows/repositoryInspectionWorkflow.js";
import { defineAgent } from "../agentRegistration.js";

export const repositoryAssistantAgentInputSchema = z
  .object({
    instruction: z
      .string()
      .min(1)
      .default("Analyze this repository and identify its architecture, risks, and test priorities."),
  })
  .strict();

export const repositoryAssistantAgentOutputSchema = z
  .object({
    workflowRunId: z.string().min(1),
    succeeded: z.boolean(),
    status: z.enum(["completed", "stopped", "failed", "step-limit"]),
    stopReason: z.string().min(1),
    overview: z.string().nullable(),
    workflowEvidence: z.json(),
  })
  .strict();

export type RepositoryAssistantAgentInput = z.infer<
  typeof repositoryAssistantAgentInputSchema
>;
export type RepositoryAssistantAgentOutput = z.infer<
  typeof repositoryAssistantAgentOutputSchema
>;

export const repositoryAssistantAgent = defineAgent({
  manifest: {
    id: "repository-assistant",
    name: "Repository Assistant",
    version: "1.0.0",
    status: "active",
    description:
      "Inspects, analyzes, and deterministically verifies a local repository.",
    owner: "local-platform",
    tags: ["engineering", "repository-analysis"],
    defaultModel: "gpt-5.4-mini",
    components: {
      workflowIds: ["repository-assistant"],
      harnessIds: [],
      scenarioIds: [],
      datasetIds: [],
    },
    permissions: {
      toolIds: [
        "inspect-git-diff",
        "inspect-package",
        "list-files",
        "read-file",
      ],
    },
    verification: {
      datasetIds: ["repository-assistant-smoke"],
      minimumPassRate: 1,
    },
  },
  inputSchema: repositoryAssistantAgentInputSchema,
  outputSchema: repositoryAssistantAgentOutputSchema,
  async execute(input, services): Promise<RepositoryAssistantAgentOutput> {
    const tools: RepositoryInspectionTools = {
      packageMetadata: services.tools.get<
        InspectPackageInput,
        InspectPackageOutput
      >("inspect-package"),
      repositoryFiles: services.tools.get<ListFilesInput, ListFilesOutput>(
        "list-files",
      ),
      gitChanges: services.tools.get<
        InspectGitDiffInput,
        InspectGitDiffOutput
      >("inspect-git-diff"),
      contextFiles: services.tools.get<ReadFileInput, ReadFileOutput>(
        "read-file",
      ),
    };
    const result = await runRepositoryAssistantWorkflow(
      () => runRepositoryInspectionWorkflow(tools),
      (inspection) =>
        runRepositoryAnalysis(inspection, services.provider, input.instruction),
    );

    return {
      workflowRunId: result.workflowRunId,
      succeeded: result.succeeded,
      status: result.status,
      stopReason: result.stopReason,
      overview: result.state.analysis?.parsedOutput?.overview ?? null,
      workflowEvidence: result as unknown as z.infer<ReturnType<typeof z.json>>,
    };
  },
  assess(output) {
    return {
      passed: output.succeeded,
      message: output.succeeded
        ? "Repository assistant workflow completed and passed verification."
        : `Repository assistant did not pass verification: ${output.stopReason}`,
    };
  },
});
