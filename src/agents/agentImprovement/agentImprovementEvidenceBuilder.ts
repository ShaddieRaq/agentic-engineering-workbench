import { z } from "zod";
import type { AgentManifest } from "../agentManifest.js";
import type { AgentRevisionSurface } from "../agentRevisionSurface.js";
import type { AgentEvaluationView } from "../evaluations/agentEvaluationView.js";
import {
  agentImprovementEvidencePacketSchema,
  type AgentImprovementEvidencePacket,
  type AgentImprovementEvidenceItem,
} from "./agentImprovementEvidence.js";

const MAXIMUM_TRIAL_OUTPUT_BYTES = 8_192;
const MAXIMUM_EVIDENCE_ITEMS = 100;
const DIAGNOSTIC_OUTPUT_FIELDS = [
  "succeeded",
  "disposition",
  "summary",
  "policyEvaluation",
  "citationEvaluation",
  "failure",
  "assessment",
] as const;

export interface AgentImprovementSubjectSnapshot {
  manifest: AgentManifest;
  manifestDigest: string;
  revisionSurface?: AgentRevisionSurface;
}

export interface AgentImprovementObjective {
  target:
    | "reliability"
    | "correctness"
    | "grounding"
    | "cost"
    | "latency"
    | "safety"
    | "operator-defined";
  description: string;
  constraints: string[];
}

function boundedOutput(output: z.infer<ReturnType<typeof z.json>> | null) {
  if (output === null) return null;
  const bytes = Buffer.byteLength(JSON.stringify(output), "utf8");
  return bytes <= MAXIMUM_TRIAL_OUTPUT_BYTES
    ? output
    : {
        omitted: true,
        omissionScope: "improvement-evidence-packet",
        reason:
          `Trial output was omitted only from the improvement evidence packet because it exceeded ${MAXIMUM_TRIAL_OUTPUT_BYTES} bytes.`,
        sizeBytes: bytes,
        causedTrialFailure: false,
      };
}

function diagnosticProjection(
  output: z.infer<ReturnType<typeof z.json>> | null,
) {
  if (output === null || typeof output !== "object" || Array.isArray(output)) {
    return null;
  }

  const diagnostics: Record<string, z.infer<ReturnType<typeof z.json>>> = {};
  for (const field of DIAGNOSTIC_OUTPUT_FIELDS) {
    const value = output[field];
    if (value !== undefined) diagnostics[field] = value;
  }

  return Object.keys(diagnostics).length === 0 ? null : diagnostics;
}

export function buildAgentImprovementEvidencePacket(input: {
  view: AgentEvaluationView;
  subject: AgentImprovementSubjectSnapshot;
  objective?: Partial<AgentImprovementObjective>;
}): AgentImprovementEvidencePacket {
  const { experiment, datasets } = input.view;
  const { manifest, manifestDigest } = input.subject;

  if (experiment.agentId !== manifest.id || experiment.agentVersion !== manifest.version) {
    throw new Error("Evaluation evidence does not match the frozen subject manifest.");
  }
  if (experiment.summary.failedCases === 0) {
    throw new Error("Improvement analysis requires at least one failed evaluation case.");
  }

  const evidenceItems: AgentImprovementEvidenceItem[] = [
    {
      id: `evaluation:${experiment.experimentId}`,
      kind: "evaluation-summary",
      datasetId: null,
      datasetCaseId: null,
      agentRunId: null,
      summary: `${experiment.summary.failedCases}/${experiment.summary.totalCases} cases and ${experiment.summary.failedRuns}/${experiment.summary.totalRuns} trials failed.`,
      details: experiment.summary,
    },
  ];
  const excludedEvidence: Array<{ source: string; reason: string }> = [];

  for (const dataset of datasets) {
    for (const datasetCase of dataset.cases) {
      if (datasetCase.expectation !== null) {
        excludedEvidence.push({
          source: `${dataset.datasetId}/${datasetCase.datasetCaseId}/expectation`,
          reason: "Hidden evaluation ground truth is withheld from the improvement analyst.",
        });
      }
      if (datasetCase.passed) continue;

      if (evidenceItems.length >= MAXIMUM_EVIDENCE_ITEMS) {
        excludedEvidence.push({
          source: `${dataset.datasetId}/${datasetCase.datasetCaseId}`,
          reason: "Evidence item limit reached.",
        });
        continue;
      }
      evidenceItems.push({
        id: `case:${dataset.datasetId}/${datasetCase.datasetCaseId}`,
        kind: "case-outcome",
        datasetId: dataset.datasetId,
        datasetCaseId: datasetCase.datasetCaseId,
        agentRunId: null,
        summary: `${datasetCase.failedRuns}/${datasetCase.totalRuns} trials failed; observed pass rate ${datasetCase.passRate === null ? "unavailable" : `${Math.round(datasetCase.passRate * 100)}%`}.`,
        details: {
          totalRuns: datasetCase.totalRuns,
          passedRuns: datasetCase.passedRuns,
          failedRuns: datasetCase.failedRuns,
          passRate: datasetCase.passRate,
          minimumPassRate: datasetCase.minimumPassRate,
        },
      });

      for (const trial of datasetCase.trials.filter(({ succeeded }) => !succeeded)) {
        if (evidenceItems.length >= MAXIMUM_EVIDENCE_ITEMS) {
          excludedEvidence.push({
            source: trial.agentRunId,
            reason: "Evidence item limit reached.",
          });
          continue;
        }
        evidenceItems.push({
          id: `trial:${trial.agentRunId}`,
          kind: trial.failure === null ? "trial-output" : "runtime-failure",
          datasetId: dataset.datasetId,
          datasetCaseId: datasetCase.datasetCaseId,
          agentRunId: trial.agentRunId,
          summary:
            trial.caseAssessment?.message ??
            trial.assessment?.message ??
            trial.failure?.message ??
            "The trial did not satisfy the case policy.",
          details: {
            runtimeSucceeded: trial.runtimeSucceeded,
            output: boundedOutput(trial.output),
            diagnostics: diagnosticProjection(trial.output),
            assessment: trial.assessment,
            caseAssessment: trial.caseAssessment,
            failure: trial.failure,
            durationMs: trial.durationMs,
          },
        });
      }
    }
  }

  return agentImprovementEvidencePacketSchema.parse({
    packetId: `improvement-${experiment.experimentId}`,
    subject: {
      agentId: manifest.id,
      agentVersion: manifest.version,
      manifestDigest,
      description: manifest.description,
      workflowIds: manifest.components.workflowIds,
      toolIds: manifest.permissions.toolIds,
      datasetIds: manifest.verification.datasetIds,
    },
    objective: {
      target: input.objective?.target ?? "reliability",
      description:
        input.objective?.description ??
        "Explain the failed evaluation cases and recommend the smallest evidence-supported improvement.",
      constraints: input.objective?.constraints ?? [
        "Do not change tools, permissions, datasets, evaluators, or registered source automatically.",
        "Do not use hidden expectations as optimizer evidence.",
      ],
    },
    sourceExperimentIds: [experiment.experimentId],
    execution: {
      workspaceId: experiment.workspaceId,
      model: experiment.model,
      repetitions: experiment.execution.repetitions,
      concurrency: experiment.execution.concurrency,
    },
    aggregate: {
      totalCases: experiment.summary.totalCases,
      passedCases: experiment.summary.passedCases,
      failedCases: experiment.summary.failedCases,
      totalRuns: experiment.summary.totalRuns,
      passedRuns: experiment.summary.passedRuns,
      failedRuns: experiment.summary.failedRuns,
      passRate: experiment.summary.passRate,
    },
    evidenceItems,
    excludedEvidence: excludedEvidence.slice(0, 100),
    revisionSurface: input.subject.revisionSurface
      ? {
          mutableFields: [...input.subject.revisionSurface.mutableFields],
          baselinePolicy: input.subject.revisionSurface.baselinePolicy,
        }
      : null,
  });
}
