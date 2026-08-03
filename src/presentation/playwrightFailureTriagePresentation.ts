import { z } from "zod";
import type { AgentRunResult } from "../agents/agentRunResult.js";
import { playwrightFailureTriageAgentOutputSchema } from "../agents/playwrightFailureTriage/playwrightFailureTriageAgent.js";
import {
  playwrightFailureDiagnosisSchema,
  playwrightFailureTriageInputSchema,
} from "../agents/playwrightFailureTriage/playwrightFailureTriage.js";
import { summarizeTokenCosts } from "../orchestration/tokenCostComparison.js";
import { aiProviderEvidenceSchema } from "../providers/aiProvider.js";
import { readFileOutputSchema } from "../tools/readFileTool.js";
import { verificationCommandOutputSchema } from "../tools/verificationCommandTool.js";
import {
  artifactPresentationSchema,
  artifactSourceSnapshotSchema,
  type ArtifactPresentation,
  type ArtifactSourceSnapshot,
} from "./artifactPresentation.js";

const toolFailureSchema = z
  .object({
    category: z.enum(["validation", "permission", "timeout", "execution"]),
    message: z.string().min(1),
  })
  .strict();

function toolEvidenceSchema<T extends z.ZodType>(output: T) {
  return z
    .object({
      toolCallId: z.string().min(1),
      toolId: z.string().min(1),
      input: z.unknown(),
      output: output.nullable(),
      failure: toolFailureSchema.nullable(),
      durationMs: z.number().nonnegative(),
      completedAt: z.string().min(1),
      succeeded: z.boolean(),
    })
    .strict();
}

const triageEvidenceSchema = z
  .object({
    triageRunId: z.string().min(1),
    input: playwrightFailureTriageInputSchema,
    reads: z.array(toolEvidenceSchema(readFileOutputSchema)),
    verification: toolEvidenceSchema(verificationCommandOutputSchema).nullable(),
    prompt: z.string(),
    rawOutput: z.string(),
    parsedOutput: playwrightFailureDiagnosisSchema.nullable(),
    refusal: z.string().nullable(),
    provider: aiProviderEvidenceSchema.nullable(),
    executionFailure: z
      .object({
        category: z.enum(["transport", "parsing", "unknown"]),
        message: z.string().min(1),
      })
      .strict()
      .nullable(),
    citationEvaluation: z
      .object({
        passed: z.boolean(),
        availablePaths: z.array(z.string().min(1)),
        citedPaths: z.array(z.string().min(1)),
        invalidPaths: z.array(z.string().min(1)),
        usedFailureReport: z.boolean(),
        usedVerificationWithoutEvidence: z.boolean(),
        message: z.string().min(1),
      })
      .strict()
      .nullable(),
    succeeded: z.boolean(),
    durationMs: z.number().nonnegative(),
    completedAt: z.string().min(1),
  })
  .strict();

function confidenceSeverity(
  confidence: "low" | "medium" | "high",
): "low" | "medium" | "high" {
  return confidence;
}

export function presentPlaywrightFailureTriage(
  artifactId: string,
  run: AgentRunResult,
): ArtifactPresentation | null {
  const output = playwrightFailureTriageAgentOutputSchema.safeParse(run.output);
  if (!output.success) return null;
  const parsedEvidence = triageEvidenceSchema.safeParse(
    output.data.triageEvidence,
  );
  if (!parsedEvidence.success) return null;
  const evidence = parsedEvidence.data;
  const diagnosis = evidence.parsedOutput;
  const successfulReads = evidence.reads.flatMap((read) =>
    read.output === null ? [] : [{ ...read.output, toolCallId: read.toolCallId }],
  );
  const failedReads = evidence.reads.filter(({ succeeded }) => !succeeded);
  const citation = evidence.citationEvaluation;
  const usageSummary = summarizeTokenCosts([evidence.provider]);
  const usage = evidence.provider?.usage
    ? {
        model: evidence.provider.model,
        inputTokens: evidence.provider.usage.inputTokens,
        cachedInputTokens: evidence.provider.usage.cachedInputTokens,
        outputTokens: evidence.provider.usage.outputTokens,
        reasoningTokens: evidence.provider.usage.reasoningTokens,
        totalTokens: evidence.provider.usage.totalTokens,
        estimatedCostUsd: usageSummary.estimatedCostUsd,
        pricingIds: usageSummary.pricingIds,
      }
    : null;
  const verificationResult = evidence.verification?.output;
  const warnings = [
    ...run.warnings,
    ...failedReads.map(
      ({ input, failure }) =>
        `Source read ${JSON.stringify(input)} failed: ${failure?.message ?? "unknown failure"}`,
    ),
    ...(citation && !citation.passed ? [citation.message] : []),
    ...(evidence.refusal ? [`Provider refusal: ${evidence.refusal}`] : []),
    ...(evidence.executionFailure
      ? [`Provider ${evidence.executionFailure.category} failure: ${evidence.executionFailure.message}`]
      : []),
  ];

  return artifactPresentationSchema.parse({
    artifactId,
    artifactKind: "agent-run",
    presentationKind: "playwright-failure-triage",
    title: `Failure Triage: ${evidence.input.testTitle}`,
    agentId: run.agentId,
    agentVersion: run.agentVersion,
    workspaceId: run.configuration.workspaceId ?? null,
    succeeded: run.succeeded,
    assessment: run.assessment?.message ?? run.failure?.message ?? null,
    overview: diagnosis?.summary ?? null,
    completedAt: run.completedAt,
    durationMs: run.durationMs,
    metrics: [
      {
        id: "classification",
        label: "Classification",
        value: diagnosis?.classification ?? "Unavailable",
        detail: diagnosis?.likelyRootCause ?? "No diagnosis was produced",
      },
      {
        id: "confidence",
        label: "Confidence",
        value: diagnosis?.confidence ?? "Unavailable",
        detail: null,
      },
      {
        id: "sources",
        label: "Sources read",
        value: String(successfulReads.length),
        detail: `${failedReads.length} failed read(s)`,
      },
      {
        id: "verification",
        label: "Focused verification",
        value: evidence.verification === null
          ? "Not requested"
          : verificationResult?.passed
            ? "Passed"
            : "Failed",
        detail: verificationResult == null
          ? null
          : `${verificationResult.executable} ${verificationResult.arguments.join(" ")}`,
      },
    ],
    findings: diagnosis === null
      ? []
      : [{
          title: diagnosis.classification.replaceAll("-", " "),
          category: diagnosis.classification,
          severity: confidenceSeverity(diagnosis.confidence),
          explanation: diagnosis.likelyRootCause,
          evidencePaths: diagnosis.evidence.flatMap(({ source, path }) =>
            source === "repository-file" && path !== null ? [path] : [],
          ),
          recommendation:
            diagnosis.recommendedActions[0]?.action ??
            "Gather additional failure evidence.",
        }],
    coverageGaps: diagnosis?.needsMoreEvidence.map((reason, index) => ({
      area: `Evidence gap ${index + 1}`,
      reason,
      evidencePaths: [],
    })) ?? [],
    prioritizedActions: diagnosis?.recommendedActions.map(
      ({ priority, owner, action }) => `${priority} · ${owner}: ${action}`,
    ) ?? [],
    sources: successfulReads.map(({ content: _content, ...source }) => ({
      ...source,
      rationale: "Candidate source supplied for failure triage.",
    })),
    timeline: [
      {
        id: "reads",
        label: "Bounded source reads",
        status: failedReads.length > 0 ? "warning" : "completed",
        detail: `${successfulReads.length}/${evidence.reads.length} source reads succeeded.`,
        durationMs: evidence.reads.reduce(
          (total, read) => total + read.durationMs,
          0,
        ),
      },
      {
        id: "verification",
        label: "Focused verification",
        status: evidence.verification === null
          ? "skipped"
          : evidence.verification.failure !== null
            ? "failed"
            : verificationResult?.passed
              ? "completed"
              : "warning",
        detail: evidence.verification === null
          ? "No verification command was requested."
          : evidence.verification.failure?.message ??
            `Command completed with exit code ${verificationResult?.exitCode ?? "unknown"}.`,
        durationMs: evidence.verification?.durationMs ?? null,
      },
      {
        id: "model",
        label: "Structured diagnosis",
        status: evidence.executionFailure
          ? "failed"
          : evidence.refusal
            ? "warning"
            : diagnosis
              ? "completed"
              : "skipped",
        detail: evidence.executionFailure?.message ??
          evidence.refusal ??
          `Structured diagnosis produced by ${evidence.provider?.model ?? run.configuration.model}.`,
        durationMs: null,
      },
      {
        id: "citations",
        label: "Grounding validation",
        status: citation === null
          ? "skipped"
          : citation.passed
            ? "completed"
            : "failed",
        detail: citation?.message ?? "Grounding validation was unavailable.",
        durationMs: null,
      },
      {
        id: "assessment",
        label: "Agent assessment",
        status: run.assessment?.passed ? "completed" : "failed",
        detail: run.assessment?.message ?? run.failure?.message ?? "No assessment was recorded.",
        durationMs: null,
      },
    ],
    usage,
    warnings,
  });
}

export function getPlaywrightFailureTriageSource(
  run: AgentRunResult,
  path: string,
): ArtifactSourceSnapshot | null {
  const output = playwrightFailureTriageAgentOutputSchema.safeParse(run.output);
  if (!output.success) return null;
  const evidence = triageEvidenceSchema.safeParse(output.data.triageEvidence);
  if (!evidence.success) return null;
  const read = evidence.data.reads.find(({ output: item }) => item?.path === path);
  if (!read?.output) return null;
  return artifactSourceSnapshotSchema.parse({
    path: read.output.path,
    content: read.output.content,
    sizeBytes: read.output.sizeBytes,
    rationale: "Candidate source supplied for failure triage.",
    toolCallId: read.toolCallId,
  });
}
