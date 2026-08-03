import type { AIProvider } from "../../providers/aiProvider.js";
import type { ToolRegistry } from "../../tools/toolRegistry.js";
import { AgentRegistry } from "../agentRegistry.js";
import { runAgent } from "../agentRunner.js";
import { verifyAgentDataset } from "../agentVerification.js";
import {
  runAgentDataset,
  type AgentDatasetRunResult,
} from "../datasets/agentDatasetRunner.js";
import {
  createAgentEvaluationExperiment,
  type AgentEvaluationExperiment,
} from "./agentEvaluationExperiment.js";
import {
  buildAgentEvaluationView,
  compareAgentEvaluationViews,
  type AgentEvaluationComparison,
} from "./agentEvaluationView.js";
import type {
  FrozenAgentCandidateEvaluationPlan,
} from "./agentCandidateEvaluationPlan.js";

export interface AgentCandidateEvaluationSide {
  experiment: AgentEvaluationExperiment;
  datasetRuns: AgentDatasetRunResult[];
}

export interface AgentCandidateEvaluationExecution {
  plan: FrozenAgentCandidateEvaluationPlan["evidence"];
  baseline: AgentCandidateEvaluationSide;
  candidate: AgentCandidateEvaluationSide;
  comparison: AgentEvaluationComparison;
}

async function runSide(input: {
  plan: FrozenAgentCandidateEvaluationPlan;
  side: "baseline" | "candidate";
  tools: ToolRegistry;
  provider: AIProvider;
  workspaceRoot: string;
}): Promise<AgentCandidateEvaluationSide> {
  const registration = input.side === "baseline"
    ? input.plan.baselineRegistration
    : input.plan.candidateRegistration;
  const agents = new AgentRegistry([registration]);
  const datasetRuns: AgentDatasetRunResult[] = [];

  for (const dataset of input.plan.datasets) {
    datasetRuns.push(
      await runAgentDataset(
        dataset,
        agents,
        (agentId, runInput) =>
          runAgent(agentId, runInput, {
            agents,
            tools: input.tools,
            provider: input.provider,
            workspaceRoot: input.workspaceRoot,
            workspaceId: input.plan.evidence.workspaceId,
            model: input.plan.evidence.model,
            ...(input.side === "candidate"
              ? { candidate: input.plan.evidence.candidate }
              : {}),
          }),
        input.plan.evidence.execution,
      ),
    );
  }

  const experiment = createAgentEvaluationExperiment({
    agentId: input.plan.evidence.subject.agentId,
    agentVersion: input.plan.evidence.subject.agentVersion,
    workspaceId: input.plan.evidence.workspaceId,
    model: input.plan.evidence.model,
    repetitions: input.plan.evidence.execution.repetitions,
    concurrency: input.plan.evidence.execution.concurrency,
    ...(input.side === "candidate"
      ? { candidate: input.plan.evidence.candidate }
      : {}),
    datasets: datasetRuns.map((datasetRun) => ({
      datasetRun,
      verification: verifyAgentDataset(
        input.plan.baselineRegistration.manifest,
        datasetRun,
      ),
      artifactId: datasetRun.datasetRunId,
    })),
  });

  return { experiment, datasetRuns };
}

async function view(side: AgentCandidateEvaluationSide) {
  const runs = new Map(
    side.datasetRuns.map((datasetRun) => [
      datasetRun.datasetRunId,
      datasetRun,
    ]),
  );
  return buildAgentEvaluationView(side.experiment, async (id) => {
    const artifact = runs.get(id);
    if (!artifact) {
      throw new Error(`Frozen evaluation dataset run is missing: ${id}.`);
    }
    return { kind: "agent-dataset-run", artifact };
  });
}

export async function runFrozenAgentCandidateEvaluation(input: {
  plan: FrozenAgentCandidateEvaluationPlan;
  tools: ToolRegistry;
  providerFactory(model: string): AIProvider;
  workspaceRoot: string;
}): Promise<AgentCandidateEvaluationExecution> {
  const baseline = await runSide({
    plan: input.plan,
    side: "baseline",
    tools: input.tools,
    provider: input.providerFactory(input.plan.evidence.model),
    workspaceRoot: input.workspaceRoot,
  });
  const candidate = await runSide({
    plan: input.plan,
    side: "candidate",
    tools: input.tools,
    provider: input.providerFactory(input.plan.evidence.model),
    workspaceRoot: input.workspaceRoot,
  });
  const comparison = compareAgentEvaluationViews(
    await view(baseline),
    await view(candidate),
  );

  return {
    plan: input.plan.evidence,
    baseline,
    candidate,
    comparison,
  };
}
