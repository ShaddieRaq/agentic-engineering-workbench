import { randomUUID } from "node:crypto";
import { z, type ZodType } from "zod";

export const multiStepWorkflowOptionsSchema = z
  .object({
    maximumSteps: z.number().int().positive().default(10),
    continueOnFailure: z.boolean().default(false),
  })
  .strict();

export type MultiStepWorkflowOptions = z.input<
  typeof multiStepWorkflowOptionsSchema
>;

export interface MultiStepWorkflowStop {
  reason: string;
}

export interface MultiStepWorkflowTransition<TState, TEvidence = unknown> {
  state: TState;
  evidence: TEvidence;
  stop?: MultiStepWorkflowStop;
}

export interface MultiStepWorkflowStep<TState, TEvidence = unknown> {
  id: string;
  description: string;
  execute(
    state: Readonly<TState>,
  ): Promise<MultiStepWorkflowTransition<TState, TEvidence>>;
}

export interface MultiStepWorkflowDefinition<TState> {
  id: string;
  description: string;
  stateSchema: ZodType<TState>;
  steps: MultiStepWorkflowStep<TState>[];
}

export interface MultiStepWorkflowFailure {
  category: "validation" | "execution";
  message: string;
}

export interface MultiStepWorkflowTraceStep {
  stepId: string;
  stepIndex: number;
  stateVersionBefore: number;
  stateVersionAfter: number;
  evidence: unknown;
  stopReason: string | null;
  failure: MultiStepWorkflowFailure | null;
  succeeded: boolean;
  durationMs: number;
  completedAt: string;
}

export interface MultiStepWorkflowResult<TState> {
  workflowRunId: string;
  workflowId: string;
  state: TState;
  stateVersion: number;
  steps: MultiStepWorkflowTraceStep[];
  status: "completed" | "stopped" | "failed" | "step-limit";
  stopReason: string;
  succeeded: boolean;
  durationMs: number;
  completedAt: string;
}

function validateDefinition<TState>(
  definition: MultiStepWorkflowDefinition<TState>,
): void {
  if (definition.id.trim().length === 0) {
    throw new Error("Workflow ID must not be empty.");
  }

  if (definition.steps.length === 0) {
    throw new Error("A multi-step workflow requires at least one step.");
  }

  const stepIds = definition.steps.map(({ id }) => id);

  if (stepIds.some((id) => id.trim().length === 0)) {
    throw new Error("Workflow step IDs must not be empty.");
  }

  if (new Set(stepIds).size !== stepIds.length) {
    throw new Error("Workflow step IDs must be unique.");
  }
}

export async function runMultiStepWorkflow<TState>(
  definition: MultiStepWorkflowDefinition<TState>,
  initialState: TState,
  options: MultiStepWorkflowOptions = {},
): Promise<MultiStepWorkflowResult<TState>> {
  const startedAt = performance.now();
  validateDefinition(definition);
  const policy = multiStepWorkflowOptionsSchema.parse(options);
  let state = definition.stateSchema.parse(initialState);
  let stateVersion = 0;
  const steps: MultiStepWorkflowTraceStep[] = [];
  let status: MultiStepWorkflowResult<TState>["status"] = "completed";
  let stopReason = "All workflow steps completed.";
  const executionPlan = definition.steps.slice(0, policy.maximumSteps);

  for (const [stepIndex, step] of executionPlan.entries()) {
    const stepStartedAt = performance.now();

    try {
      const transition = await step.execute(state);
      const parsedState = definition.stateSchema.safeParse(transition.state);

      if (!parsedState.success) {
        steps.push({
          stepId: step.id,
          stepIndex,
          stateVersionBefore: stateVersion,
          stateVersionAfter: stateVersion,
          evidence: transition.evidence,
          stopReason: null,
          failure: {
            category: "validation",
            message: z.prettifyError(parsedState.error),
          },
          succeeded: false,
          durationMs: performance.now() - stepStartedAt,
          completedAt: new Date().toISOString(),
        });
        status = "failed";
        stopReason = `Step ${step.id} produced invalid workflow state.`;

        if (!policy.continueOnFailure) {
          break;
        }

        continue;
      }

      const stateVersionBefore = stateVersion;
      state = parsedState.data;
      stateVersion += 1;
      steps.push({
        stepId: step.id,
        stepIndex,
        stateVersionBefore,
        stateVersionAfter: stateVersion,
        evidence: transition.evidence,
        stopReason: transition.stop?.reason ?? null,
        failure: null,
        succeeded: true,
        durationMs: performance.now() - stepStartedAt,
        completedAt: new Date().toISOString(),
      });

      if (transition.stop) {
        status = "stopped";
        stopReason = transition.stop.reason;
        break;
      }
    } catch (error: unknown) {
      steps.push({
        stepId: step.id,
        stepIndex,
        stateVersionBefore: stateVersion,
        stateVersionAfter: stateVersion,
        evidence: null,
        stopReason: null,
        failure: {
          category: "execution",
          message: error instanceof Error ? error.message : String(error),
        },
        succeeded: false,
        durationMs: performance.now() - stepStartedAt,
        completedAt: new Date().toISOString(),
      });
      status = "failed";
      stopReason = `Step ${step.id} failed.`;

      if (!policy.continueOnFailure) {
        break;
      }
    }
  }

  if (
    status === "completed" &&
    executionPlan.length < definition.steps.length
  ) {
    status = "step-limit";
    stopReason = `Workflow reached the ${policy.maximumSteps}-step limit.`;
  }

  return {
    workflowRunId: randomUUID(),
    workflowId: definition.id,
    state,
    stateVersion,
    steps,
    status,
    stopReason,
    succeeded: status === "completed" || status === "stopped",
    durationMs: performance.now() - startedAt,
    completedAt: new Date().toISOString(),
  };
}
