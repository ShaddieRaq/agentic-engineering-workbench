import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  runMultiStepWorkflow,
  type MultiStepWorkflowDefinition,
} from "../src/workflows/multiStepWorkflow.js";

const stateSchema = z.object({ count: z.number().int().nonnegative() }).strict();

function definition(stepCount = 2): MultiStepWorkflowDefinition<{ count: number }> {
  return {
    id: "test-workflow",
    description: "Exercise workflow state.",
    stateSchema,
    steps: Array.from({ length: stepCount }, (_, index) => ({
      id: `step-${index + 1}`,
      description: "Increment state.",
      async execute(state) {
        return {
          state: { count: state.count + 1 },
          evidence: { observedCount: state.count },
        };
      },
    })),
  };
}

describe("runMultiStepWorkflow", () => {
  it("passes validated state through ordered steps and records trace evidence", async () => {
    const result = await runMultiStepWorkflow(definition(), { count: 0 });

    expect(result.state).toEqual({ count: 2 });
    expect(result.stateVersion).toBe(2);
    expect(result.steps.map(({ stepId }) => stepId)).toEqual([
      "step-1",
      "step-2",
    ]);
    expect(result.steps[0]).toMatchObject({
      evidence: { observedCount: 0 },
      stateVersionBefore: 0,
      stateVersionAfter: 1,
      succeeded: true,
    });
    expect(result.status).toBe("completed");
    expect(result.succeeded).toBe(true);
  });

  it("honors an explicit successful stop condition", async () => {
    const workflow = definition();
    workflow.steps[0] = {
      id: "step-1",
      description: "Stop after one step.",
      async execute() {
        return {
          state: { count: 1 },
          evidence: { decision: "enough" },
          stop: { reason: "Required evidence collected." },
        };
      },
    };

    const result = await runMultiStepWorkflow(workflow, { count: 0 });

    expect(result.steps).toHaveLength(1);
    expect(result.status).toBe("stopped");
    expect(result.stopReason).toBe("Required evidence collected.");
    expect(result.succeeded).toBe(true);
  });

  it("stops before executing beyond the configured step limit", async () => {
    const result = await runMultiStepWorkflow(
      definition(3),
      { count: 0 },
      { maximumSteps: 2 },
    );

    expect(result.state).toEqual({ count: 2 });
    expect(result.steps).toHaveLength(2);
    expect(result.status).toBe("step-limit");
    expect(result.succeeded).toBe(false);
  });

  it("records a step exception without rejecting the workflow", async () => {
    const workflow = definition();
    workflow.steps[0] = {
      id: "step-1",
      description: "Fail.",
      async execute() {
        throw new Error("Step unavailable.");
      },
    };

    const result = await runMultiStepWorkflow(workflow, { count: 0 });

    expect(result.state).toEqual({ count: 0 });
    expect(result.steps[0]?.failure).toEqual({
      category: "execution",
      message: "Step unavailable.",
    });
    expect(result.status).toBe("failed");
    expect(result.succeeded).toBe(false);
  });

  it("can preserve a failure and continue independent later work", async () => {
    const laterStep = vi.fn(async (state: Readonly<{ count: number }>) => ({
      state: { count: state.count + 1 },
      evidence: { recovered: true },
    }));
    const workflow = definition();
    workflow.steps[0] = {
      id: "step-1",
      description: "Fail.",
      async execute() {
        throw new Error("Optional step failed.");
      },
    };
    workflow.steps[1] = {
      id: "step-2",
      description: "Continue.",
      execute: laterStep,
    };

    const result = await runMultiStepWorkflow(
      workflow,
      { count: 0 },
      { continueOnFailure: true },
    );

    expect(laterStep).toHaveBeenCalledOnce();
    expect(result.state).toEqual({ count: 1 });
    expect(result.steps.map(({ succeeded }) => succeeded)).toEqual([
      false,
      true,
    ]);
    expect(result.status).toBe("failed");
    expect(result.succeeded).toBe(false);
  });
});
