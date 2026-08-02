import { z } from "zod";
import type { FileInventoryInput, FileInventoryOutput } from "../../tools/fileInventoryTool.js";
import type { ReadFileInput, ReadFileOutput } from "../../tools/readFileTool.js";
import { defineAgent } from "../agentRegistration.js";
import {
  documentationAuditOutputSchema,
  runDocumentationAudit,
  type DocumentationAuditTools,
} from "./documentationAudit.js";

export const documentationAuditorInputSchema = z
  .object({
    instruction: z.string().min(1).default("Audit this repository's documentation for stale, inconsistent, missing, and accurate guidance."),
    maximumContextFiles: z.number().int().min(2).max(30).default(16),
  })
  .strict();

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

export const documentationAuditorAgent = defineAgent({
  manifest: {
    id: "documentation-auditor",
    name: "Documentation Auditor",
    version: "1.0.0",
    status: "active",
    description: "Finds stale, inconsistent, missing, and accurate repository documentation using cited local evidence.",
    owner: "local-platform",
    tags: ["documentation", "engineering", "repository-analysis"],
    defaultModel: "gpt-5.4-mini",
    components: {
      workflowIds: ["documentation-audit"],
      harnessIds: [],
      scenarioIds: [],
      datasetIds: [],
    },
    permissions: { toolIds: ["file-inventory", "read-file"] },
    verification: { datasetIds: ["documentation-auditor-smoke"], minimumPassRate: 1 },
  },
  inputSchema: documentationAuditorInputSchema,
  outputSchema: documentationAuditorOutputSchema,
  async execute(input, services) {
    const tools: DocumentationAuditTools = {
      inventory: services.tools.get<FileInventoryInput, FileInventoryOutput>("file-inventory"),
      readFile: services.tools.get<ReadFileInput, ReadFileOutput>("read-file"),
    };
    const result = await runDocumentationAudit(
      tools,
      services.provider,
      input.instruction,
      input.maximumContextFiles,
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
