import { z } from "zod";

export const presentationMetricSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  value: z.string(),
  detail: z.string().min(1).nullable(),
}).strict();

export const presentationTimelineStepSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  status: z.enum(["completed", "warning", "failed", "skipped"]),
  detail: z.string().min(1),
  durationMs: z.number().nonnegative().nullable(),
}).strict();

export const presentationFindingSchema = z.object({
  title: z.string().min(1),
  category: z.enum(["stale", "missing", "inconsistent", "accurate"]),
  severity: z.enum(["low", "medium", "high"]),
  explanation: z.string().min(1),
  evidencePaths: z.array(z.string().min(1)),
  recommendation: z.string().min(1),
}).strict();

export const presentationSourceSchema = z.object({
  path: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  rationale: z.string().min(1),
  toolCallId: z.string().min(1),
}).strict();

export const presentationUsageSchema = z.object({
  model: z.string().min(1),
  inputTokens: z.number().int().nonnegative(),
  cachedInputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  reasoningTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  estimatedCostUsd: z.number().nonnegative().nullable(),
  pricingIds: z.array(z.string().min(1)),
}).strict();

export const artifactPresentationSchema = z.object({
  artifactId: z.string().min(1),
  artifactKind: z.enum(["agent-run", "agent-dataset-run", "agent-evaluation"]),
  presentationKind: z.enum(["generic", "documentation-audit"]),
  title: z.string().min(1),
  agentId: z.string().min(1),
  agentVersion: z.string().min(1),
  workspaceId: z.string().min(1).nullable(),
  succeeded: z.boolean().nullable(),
  assessment: z.string().min(1).nullable(),
  overview: z.string().min(1).nullable(),
  completedAt: z.string().min(1),
  durationMs: z.number().nonnegative().nullable(),
  metrics: z.array(presentationMetricSchema),
  findings: z.array(presentationFindingSchema),
  coverageGaps: z.array(z.object({
    area: z.string().min(1),
    reason: z.string().min(1),
    evidencePaths: z.array(z.string().min(1)),
  }).strict()),
  prioritizedActions: z.array(z.string().min(1)),
  sources: z.array(presentationSourceSchema),
  timeline: z.array(presentationTimelineStepSchema),
  usage: presentationUsageSchema.nullable(),
  warnings: z.array(z.string().min(1)),
}).strict();

export const artifactSourceSnapshotSchema = presentationSourceSchema.extend({
  content: z.string(),
}).strict();

export type ArtifactPresentation = z.infer<typeof artifactPresentationSchema>;
export type ArtifactSourceSnapshot = z.infer<typeof artifactSourceSnapshotSchema>;

export interface ArtifactExport {
  format: "json" | "markdown";
  mediaType: "application/json; charset=utf-8" | "text/markdown; charset=utf-8";
  fileName: string;
  content: string;
}
