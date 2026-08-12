import { z } from "zod";
import {
  fileInventoryExcludedPathSchema,
  type FileInventoryInput,
  type FileInventoryOutput,
} from "../../tools/fileInventoryTool.js";
import type { ReadFileInput, ReadFileOutput } from "../../tools/readFileTool.js";
import {
  defineAgent,
  type AgentRegistration,
} from "../agentRegistration.js";
import { defineAgentRevisionSurface } from "../agentRevisionSurface.js";
import {
  documentationAuditOutputSchema,
  runDocumentationAudit,
  type DocumentationAuditTools,
} from "./documentationAudit.js";
import {
  documentationAuditorBaselinePolicy,
  documentationAuditorPolicySchema,
  type DocumentationAuditorPolicy,
} from "./documentationAuditorPolicy.js";

function createDocumentationAuditorInputSchema(
  policy: DocumentationAuditorPolicy,
) {
  return z
  .object({
    instruction: z
      .string()
      .min(1)
      .default(policy.instructions.defaultTaskInstruction),
    maximumContextFiles: z
      .number()
      .int()
      .min(2)
      .max(30)
      .default(policy.contextSelection.defaultMaximumFiles),
    excludedPaths: z
      .array(fileInventoryExcludedPathSchema)
      .max(50)
      .default([])
      .describe(
        "Repository-relative files or directories to omit from this audit, such as apps/ when it contains test fixtures.",
      ),
  })
  .strict();
}

export const documentationAuditorInputSchema =
  createDocumentationAuditorInputSchema(documentationAuditorBaselinePolicy);

export const documentationAuditorOutputSchema = z
  .object({
    auditRunId: z.string().min(1),
    succeeded: z.boolean(),
    overview: z.string().nullable(),
    findings: z.array(documentationAuditOutputSchema.shape.findings.element),
    coverageGaps: z.array(documentationAuditOutputSchema.shape.coverageGaps.element),
    prioritizedActions: z.array(z.string().min(1)),
    auditEvidence: z.json(),
  })
  .strict();

export function createDocumentationAuditorAgent(
  policy: DocumentationAuditorPolicy = documentationAuditorBaselinePolicy,
): AgentRegistration {
  const effectivePolicy = documentationAuditorPolicySchema.parse(policy);
  return defineAgent({
    manifest: {
      id: "documentation-auditor",
      name: "Documentation Auditor",
      version: "1.2.0",
      status: "active",
      description: "Finds stale, inconsistent, missing, and accurate repository documentation using cited local evidence.",
      owner: "local-platform",
      tags: ["documentation", "engineering", "repository-analysis"],
      defaultModel: "gpt-5.4",
      components: {
        workflowIds: ["documentation-audit"],
        harnessIds: [],
        scenarioIds: [],
        datasetIds: [],
      },
      permissions: { toolIds: ["file-inventory", "read-file"] },
      verification: {
        datasetIds: [
          "documentation-auditor-smoke",
          "documentation-auditor-protected",
        ],
        minimumPassRate: 1,
      },
    },
    inputSchema: createDocumentationAuditorInputSchema(effectivePolicy),
    outputSchema: documentationAuditorOutputSchema,
    revisionSurface: defineAgentRevisionSurface<DocumentationAuditorPolicy>({
      schema: documentationAuditorPolicySchema,
      baselinePolicy: documentationAuditorBaselinePolicy,
      mutableFields: ["instructions", "contextSelection"],
      createCandidate: createDocumentationAuditorAgent,
    }),
    async execute(input, services) {
      const tools: DocumentationAuditTools = {
        inventory:
          services.tools.get<FileInventoryInput, FileInventoryOutput>(
            "file-inventory",
          ),
        readFile:
          services.tools.get<ReadFileInput, ReadFileOutput>("read-file"),
      };
      const result = await runDocumentationAudit(
        tools,
        services.provider,
        input.instruction,
        input.maximumContextFiles,
        effectivePolicy,
        input.excludedPaths,
      );
      return {
        auditRunId: result.auditRunId,
        succeeded: result.succeeded,
        overview: result.parsedOutput?.overview ?? null,
        findings: result.parsedOutput?.findings ?? [],
        coverageGaps: result.parsedOutput?.coverageGaps ?? [],
        prioritizedActions: result.parsedOutput?.prioritizedActions ?? [],
        auditEvidence: result as unknown as z.infer<ReturnType<typeof z.json>>,
      };
    },
    assess(output) {
      return {
        passed: output.succeeded,
        message: output.succeeded
          ? "Documentation audit completed with grounded evidence."
          : "Documentation audit did not produce grounded successful evidence.",
      };
    },
  });
}

export const documentationAuditorAgent =
  createDocumentationAuditorAgent();
