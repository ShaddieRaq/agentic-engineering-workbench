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
import {
  runRepositoryInspectionWorkflow,
  type RepositoryInspectionTools,
} from "../../workflows/repositoryInspectionWorkflow.js";
import { defineAgent } from "../agentRegistration.js";
import { runChangeRiskReview } from "./changeRiskReview.js";

export const changeRiskReviewerInputSchema = z
  .object({
    instruction: z
      .string()
      .min(1)
      .default(
        "Review the current repository changes, identify concrete risks, and recommend missing tests.",
      ),
    sourceImprovement: z
      .object({
        artifactId: z.string().min(1),
        recommendationIndex: z.number().int().nonnegative(),
        toolBuilderRunArtifactId: z.string().min(1).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const changeRiskReviewerOutputSchema = z
  .object({
    reviewRunId: z.string().min(1),
    succeeded: z.boolean(),
    summary: z.string().nullable(),
    overallRisk: z.enum(["low", "medium", "high", "critical"]).nullable(),
    releaseRecommendation: z.enum(["approve", "caution", "block"]).nullable(),
    reviewEvidence: z.json(),
  })
  .strict();

export const changeRiskReviewerAgent = defineAgent({
  manifest: {
    id: "change-risk-reviewer",
    name: "Change Risk Reviewer",
    version: "1.0.0",
    status: "active",
    description:
      "Reviews repository changes for evidence-backed risk and missing tests.",
    owner: "local-platform",
    tags: ["change-review", "engineering", "reliability"],
    defaultModel: "gpt-5.4-mini",
    components: {
      workflowIds: ["change-risk-review"],
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
      datasetIds: ["change-risk-reviewer-smoke"],
      minimumPassRate: 1,
    },
  },
  inputSchema: changeRiskReviewerInputSchema,
  outputSchema: changeRiskReviewerOutputSchema,
  async execute(input, services) {
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
    const inspection = await runRepositoryInspectionWorkflow(tools);
    const result = await runChangeRiskReview(
      inspection,
      services.provider,
      input.instruction,
    );

    return {
      reviewRunId: result.reviewRunId,
      succeeded: result.succeeded,
      summary: result.parsedOutput?.summary ?? null,
      overallRisk: result.parsedOutput?.overallRisk ?? null,
      releaseRecommendation:
        result.parsedOutput?.releaseRecommendation ?? null,
      reviewEvidence: result as unknown as z.infer<ReturnType<typeof z.json>>,
    };
  },
  assess(output) {
    return {
      passed: output.succeeded,
      message: output.succeeded
        ? "Change-risk review completed with grounded evidence."
        : "Change-risk review did not produce grounded successful evidence.",
    };
  },
});
