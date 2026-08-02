import { z } from "zod";
import { documentationAuditorOutputSchema } from "../agents/documentationAuditor/documentationAuditorAgent.js";
import { aiProviderEvidenceSchema } from "../providers/aiProvider.js";
import { summarizeTokenCosts } from "../orchestration/tokenCostComparison.js";
import { fileInventoryOutputSchema } from "../tools/fileInventoryTool.js";
import { readFileOutputSchema } from "../tools/readFileTool.js";
import type { AgentRunResult } from "../agents/agentRunResult.js";
import {
  artifactPresentationSchema,
  artifactSourceSnapshotSchema,
  type ArtifactPresentation,
  type ArtifactSourceSnapshot,
} from "./artifactPresentation.js";

const toolFailureSchema = z.object({
  category: z.enum(["validation", "permission", "timeout", "execution"]),
  message: z.string().min(1),
}).strict();

function toolEvidenceSchema<T extends z.ZodType>(output: T) {
  return z.object({
    toolCallId: z.string().min(1),
    toolId: z.string().min(1),
    input: z.unknown(),
    output: output.nullable(),
    failure: toolFailureSchema.nullable(),
    durationMs: z.number().nonnegative(),
    completedAt: z.string().min(1),
    succeeded: z.boolean(),
  }).strict();
}

const auditContextSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  toolCallId: z.string().min(1),
  rationale: z.string().min(1),
}).strict();

const auditEvidenceSchema = z.object({
  auditRunId: z.string().min(1),
  inventory: toolEvidenceSchema(fileInventoryOutputSchema),
  context: z.array(auditContextSchema),
  reads: z.array(toolEvidenceSchema(readFileOutputSchema)),
  prompt: z.string(),
  rawOutput: z.string(),
  parsedOutput: z.unknown().nullable(),
  refusal: z.string().nullable(),
  provider: aiProviderEvidenceSchema.nullable(),
  executionFailure: z.object({
    category: z.enum(["transport", "parsing", "unknown"]),
    message: z.string().min(1),
  }).strict().nullable(),
  citationEvaluation: z.object({
    passed: z.boolean(),
    availablePaths: z.array(z.string().min(1)),
    citedPaths: z.array(z.string().min(1)),
    invalidPaths: z.array(z.string().min(1)),
    message: z.string().min(1),
  }).strict().nullable(),
  succeeded: z.boolean(),
  durationMs: z.number().nonnegative(),
  completedAt: z.string().min(1),
}).strict();

function plural(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

export function presentDocumentationAudit(
  artifactId: string,
  run: AgentRunResult,
): ArtifactPresentation | null {
  const output = documentationAuditorOutputSchema.safeParse(run.output);
  if (!output.success) return null;
  const evidence = auditEvidenceSchema.safeParse(output.data.auditEvidence);
  if (!evidence.success) return null;
  const audit = evidence.data;
  const inventory = audit.inventory.output;
  const failedReads = audit.reads.filter(({ succeeded }) => !succeeded);
  const contextBytes = audit.context.reduce((total, item) => total + item.sizeBytes, 0);
  const citations = audit.citationEvaluation;
  const usageSummary = summarizeTokenCosts([audit.provider]);
  const usage = audit.provider?.usage ? {
    model: audit.provider.model,
    inputTokens: audit.provider.usage.inputTokens,
    cachedInputTokens: audit.provider.usage.cachedInputTokens,
    outputTokens: audit.provider.usage.outputTokens,
    reasoningTokens: audit.provider.usage.reasoningTokens,
    totalTokens: audit.provider.usage.totalTokens,
    estimatedCostUsd: usageSummary.estimatedCostUsd,
    pricingIds: usageSummary.pricingIds,
  } : null;
  const warnings = [
    ...run.warnings,
    ...(inventory?.truncated ? ["The repository inventory was truncated by its configured limits."] : []),
    ...(failedReads.length > 0 ? [`${plural(failedReads.length, "selected file")} could not be read.`] : []),
    ...(citations && !citations.passed ? [citations.message] : []),
    ...(audit.refusal ? [`The provider refused the audit: ${audit.refusal}`] : []),
    ...(audit.executionFailure ? [`Provider ${audit.executionFailure.category} failure: ${audit.executionFailure.message}`] : []),
  ];
  const modelStatus = audit.executionFailure
    ? "failed"
    : audit.refusal
      ? "warning"
      : output.data.overview
        ? "completed"
        : "skipped";
  const citationStatus = citations === null ? "skipped" : citations.passed ? "completed" : "failed";

  return artifactPresentationSchema.parse({
    artifactId,
    artifactKind: "agent-run",
    presentationKind: "documentation-audit",
    title: "Documentation Audit",
    agentId: run.agentId,
    agentVersion: run.agentVersion,
    workspaceId: run.configuration.workspaceId ?? null,
    succeeded: run.succeeded,
    assessment: run.assessment?.message ?? run.failure?.message ?? null,
    overview: output.data.overview,
    completedAt: run.completedAt,
    durationMs: run.durationMs,
    metrics: [
      { id: "observed", label: "Files discovered", value: String(inventory?.filesObserved ?? 0), detail: inventory?.truncated ? "Inventory truncated" : "Inventory complete within policy" },
      { id: "context", label: "Files inspected", value: String(audit.context.length), detail: `${contextBytes.toLocaleString()} context bytes` },
      { id: "findings", label: "Findings", value: String(output.data.findings.length), detail: `${output.data.findings.filter(({ severity }) => severity === "high").length} high severity` },
      { id: "citations", label: "Citations", value: String(citations?.citedPaths.length ?? 0), detail: citations?.passed ? "All paths validated" : citations?.message ?? "Not evaluated" },
    ],
    findings: output.data.findings,
    coverageGaps: output.data.coverageGaps,
    prioritizedActions: output.data.prioritizedActions,
    sources: audit.context.map(({ content: _content, ...source }) => source),
    timeline: [
      { id: "inventory", label: "Repository inventory", status: audit.inventory.succeeded ? inventory?.truncated ? "warning" : "completed" : "failed", detail: audit.inventory.failure?.message ?? `${plural(inventory?.entries.length ?? 0, "path")} retained as discovery evidence.`, durationMs: audit.inventory.durationMs },
      { id: "selection", label: "Context selection", status: audit.context.length > 0 ? failedReads.length > 0 ? "warning" : "completed" : "failed", detail: `${plural(audit.context.length, "file")} accepted under the aggregate context budget.`, durationMs: null },
      { id: "reads", label: "Bounded file reads", status: failedReads.length > 0 ? "warning" : "completed", detail: `${audit.reads.length - failedReads.length}/${audit.reads.length} selected reads succeeded.`, durationMs: audit.reads.reduce((total, item) => total + item.durationMs, 0) },
      { id: "model", label: "Structured model analysis", status: modelStatus, detail: audit.executionFailure?.message ?? audit.refusal ?? `Structured output produced by ${audit.provider?.model ?? run.configuration.model}.`, durationMs: null },
      { id: "citations", label: "Citation validation", status: citationStatus, detail: citations?.message ?? "Citation validation was not available.", durationMs: null },
      { id: "assessment", label: "Agent assessment", status: run.assessment?.passed ? "completed" : "failed", detail: run.assessment?.message ?? run.failure?.message ?? "No assessment was recorded.", durationMs: null },
      { id: "persistence", label: "Evidence persistence", status: "completed", detail: `Immutable artifact ${artifactId} loaded through its runtime contract.`, durationMs: null },
    ],
    usage,
    warnings,
  });
}

export function getDocumentationAuditSource(
  run: AgentRunResult,
  path: string,
): ArtifactSourceSnapshot | null {
  const output = documentationAuditorOutputSchema.safeParse(run.output);
  if (!output.success) return null;
  const evidence = auditEvidenceSchema.safeParse(output.data.auditEvidence);
  if (!evidence.success) return null;
  const source = evidence.data.context.find((item) => item.path === path);
  return source ? artifactSourceSnapshotSchema.parse(source) : null;
}
