import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import { z } from "zod";
import type { AIProvider, AIProviderEvidence, AIProviderResult } from "../../providers/aiProvider.js";
import { AIProviderError } from "../../providers/aiProviderError.js";
import type { FileInventoryInput, FileInventoryOutput } from "../../tools/fileInventoryTool.js";
import type { ReadFileInput, ReadFileOutput } from "../../tools/readFileTool.js";
import type { ToolDefinition } from "../../tools/toolDefinition.js";
import { executeTool, type ToolCallEvidence } from "../../tools/toolExecutor.js";
import {
  documentationAuditorBaselinePolicy,
  documentationAuditorPolicySchema,
  type DocumentationAuditorPolicy,
} from "./documentationAuditorPolicy.js";

const evidencePathsSchema = z.array(z.string().min(1)).min(1);

export const documentationAuditFindingSchema = z
  .object({
    title: z.string().min(1),
    category: z.enum(["stale", "missing", "inconsistent", "accurate"]),
    severity: z.enum(["low", "medium", "high"]),
    explanation: z.string().min(1),
    evidencePaths: evidencePathsSchema,
    recommendation: z.string().min(1),
  })
  .strict();

export const documentationAuditOutputSchema = z
  .object({
    overview: z.string().min(1),
    findings: z.array(documentationAuditFindingSchema),
    coverageGaps: z.array(
      z.object({ area: z.string().min(1), reason: z.string().min(1), evidencePaths: evidencePathsSchema }).strict(),
    ),
    prioritizedActions: z.array(z.string().min(1)),
  })
  .strict();

export type DocumentationAuditOutput = z.infer<typeof documentationAuditOutputSchema>;

export interface DocumentationAuditTools {
  inventory: ToolDefinition<FileInventoryInput, FileInventoryOutput>;
  readFile: ToolDefinition<ReadFileInput, ReadFileOutput>;
}

export interface DocumentationAuditContextItem {
  path: string;
  content: string;
  sizeBytes: number;
  toolCallId: string;
  rationale: string;
}

export interface DocumentationAuditResult {
  auditRunId: string;
  inventory: ToolCallEvidence<FileInventoryOutput>;
  context: DocumentationAuditContextItem[];
  reads: ToolCallEvidence<ReadFileOutput>[];
  prompt: string;
  rawOutput: string;
  parsedOutput: DocumentationAuditOutput | null;
  refusal: string | null;
  provider: AIProviderEvidence | null;
  executionFailure: { category: "transport" | "parsing" | "unknown"; message: string } | null;
  citationEvaluation: {
    passed: boolean;
    availablePaths: string[];
    citedPaths: string[];
    invalidPaths: string[];
    message: string;
  } | null;
  succeeded: boolean;
  durationMs: number;
  completedAt: string;
}

export function selectDocumentationAuditPaths(
  inventory: FileInventoryOutput,
  maximumFiles: number,
  policy: DocumentationAuditorPolicy["contextSelection"] =
    documentationAuditorBaselinePolicy.contextSelection,
): Array<{ path: string; rationale: string }> {
  const documentationExtensions = new Set(policy.documentationExtensions);
  const sourceExtensions = new Set(policy.sourceExtensions);
  const manifestNames = new Set(policy.manifestNames);
  const documents = inventory.entries
    .filter(({ extension }) => documentationExtensions.has(extension))
    .map(({ path }) => ({ path, rationale: "Repository documentation selected for claim review." }));
  const manifests = inventory.entries
    .filter(({ path }) => manifestNames.has(basename(path)) && !documentationExtensions.has(extnameSafe(path)))
    .map(({ path }) => ({ path, rationale: "Project metadata selected to verify documented commands and structure." }));
  const source = inventory.entries
    .filter(
      ({ path, extension }) =>
        path.startsWith(policy.sourcePathPrefix) &&
        sourceExtensions.has(extension),
    )
    .map(({ path }) => ({ path, rationale: "Representative source selected to identify undocumented components." }));
  const seen = new Set<string>();
  const documentBudget = Math.max(
    1,
    Math.floor(maximumFiles * policy.documentFraction),
  );
  const manifestBudget = Math.min(
    policy.maximumManifestFiles,
    Math.max(1, maximumFiles - documentBudget),
  );
  const balanced = [
    ...documents.slice(0, documentBudget),
    ...manifests.slice(0, manifestBudget),
    ...source,
    ...documents.slice(documentBudget),
  ];
  return balanced
    .filter(({ path }) => !seen.has(path) && seen.add(path))
    .slice(0, maximumFiles);
}

function extnameSafe(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot === -1 ? "" : path.slice(dot).toLowerCase();
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

export async function runDocumentationAudit(
  tools: DocumentationAuditTools,
  provider: AIProvider,
  instruction: string,
  maximumContextFiles =
    documentationAuditorBaselinePolicy.contextSelection.defaultMaximumFiles,
  policy: DocumentationAuditorPolicy = documentationAuditorBaselinePolicy,
  excludedPaths: string[] = [],
): Promise<DocumentationAuditResult> {
  const startedAt = performance.now();
  const validatedPolicy = documentationAuditorPolicySchema.parse(policy);
  if (!Number.isInteger(maximumContextFiles) || maximumContextFiles < 2 || maximumContextFiles > 30) {
    throw new Error("maximumContextFiles must be an integer from 2 through 30.");
  }
  const inventory = await executeTool(tools.inventory, {
    path: ".",
    extensions: [],
    excludedPaths,
    maxFiles: 1_000,
    maxDepth: 10,
  });
  if (!inventory.succeeded || !inventory.output) {
    throw new Error(inventory.failure?.message ?? "Repository inventory failed.");
  }
  const candidates = selectDocumentationAuditPaths(
    inventory.output,
    maximumContextFiles,
    validatedPolicy.contextSelection,
  );
  const documentationExtensions = new Set(
    validatedPolicy.contextSelection.documentationExtensions,
  );
  if (!candidates.some(({ path }) => documentationExtensions.has(extnameSafe(path)))) {
    throw new Error("Documentation audit requires at least one documentation file.");
  }
  const reads: ToolCallEvidence<ReadFileOutput>[] = [];
  const context: DocumentationAuditContextItem[] = [];
  let contextBytes = 0;
  for (const candidate of candidates) {
    const evidence = await executeTool(tools.readFile, {
      path: candidate.path,
      maxBytes: validatedPolicy.contextSelection.perFileMaximumBytes,
    });
    reads.push(evidence);
    if (!evidence.succeeded || !evidence.output) continue;
    if (
      contextBytes + evidence.output.sizeBytes >
      validatedPolicy.contextSelection.maximumContextBytes
    ) continue;
    context.push({
      path: evidence.output.path,
      content: evidence.output.content,
      sizeBytes: evidence.output.sizeBytes,
      toolCallId: evidence.toolCallId,
      rationale: candidate.rationale,
    });
    contextBytes += evidence.output.sizeBytes;
  }
  if (context.length === 0) throw new Error("No readable documentation audit context was assembled.");
  const prompt = [
    "ROLE:",
    ...validatedPolicy.instructions.roleLines,
    "",
    "CONTEXT:",
    ...context.map(({ path, content }) => `Source: ${path}\n${content}\n---`),
    "",
    "TASK:",
    instruction.trim(),
  ].join("\n");
  let providerResult: AIProviderResult<DocumentationAuditOutput>;
  let executionFailure: DocumentationAuditResult["executionFailure"] = null;
  try {
    providerResult = await provider.generate({ prompt, outputSchema: documentationAuditOutputSchema });
  } catch (error: unknown) {
    providerResult = {
      rawOutput: "",
      parsedOutput: null,
      refusal: null,
      provider: { model: "unknown", usage: null },
    };
    executionFailure = {
      category: error instanceof AIProviderError ? error.category : "unknown",
      message: error instanceof Error ? error.message : String(error),
    };
  }
  const citationEvaluation = providerResult.parsedOutput === null ? null : (() => {
    const availablePaths = uniqueSorted(context.map(({ path }) => path));
    const citedPaths = uniqueSorted([
      ...providerResult.parsedOutput!.findings.flatMap(({ evidencePaths }) => evidencePaths),
      ...providerResult.parsedOutput!.coverageGaps.flatMap(({ evidencePaths }) => evidencePaths),
    ]);
    const available = new Set(availablePaths);
    const invalidPaths = citedPaths.filter((path) => !available.has(path));
    return {
      passed: invalidPaths.length === 0,
      availablePaths,
      citedPaths,
      invalidPaths,
      message: invalidPaths.length === 0
        ? "Every documentation finding cites assembled repository evidence."
        : `Documentation audit cites unavailable paths: ${invalidPaths.join(", ")}.`,
    };
  })();
  return {
    auditRunId: randomUUID(),
    inventory,
    context,
    reads,
    prompt,
    rawOutput: providerResult.rawOutput,
    parsedOutput: providerResult.parsedOutput,
    refusal: providerResult.refusal,
    provider: executionFailure === null ? providerResult.provider : null,
    executionFailure,
    citationEvaluation,
    succeeded:
      executionFailure === null &&
      providerResult.refusal === null &&
      providerResult.parsedOutput !== null &&
      citationEvaluation?.passed === true,
    durationMs: performance.now() - startedAt,
    completedAt: new Date().toISOString(),
  };
}
