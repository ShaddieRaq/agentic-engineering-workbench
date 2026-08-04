import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FoundryArtifactStore } from "../src/foundry/foundryArtifactStore.js";
import {
  IntakeSessionController,
  type IntakeAgentRunService,
} from "../src/foundry/intakeSessionController.js";
import type { IntakeTurnOutput } from "../src/foundry/intakeTurnOutput.js";
import type { ProjectBriefDraftContent } from "../src/foundry/projectBrief.js";
import { ProjectBriefService } from "../src/foundry/projectBriefService.js";

const createdDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    createdDirectories.map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
  createdDirectories.length = 0;
});

function content(overrides: Partial<ProjectBriefDraftContent> = {}): ProjectBriefDraftContent {
  return {
    title: "Recipe planner",
    ideaSummary: "Plan weekly meals from pantry contents.",
    goals: [],
    users: [],
    constraints: [],
    risks: [],
    nonGoals: [],
    assumptions: [],
    acceptanceCriteria: [],
    openQuestions: [],
    ...overrides,
  };
}

function question(targetEntryIds: string[] = []) {
  return {
    id: randomUUID(),
    question: "Who are the users?",
    targetEntryIds,
    intent: "elicit-new" as const,
  };
}

type ScriptStep =
  | { kind: "output"; output: IntakeTurnOutput }
  | { kind: "failure"; message: string };

function scriptedAgentService(steps: ScriptStep[]): IntakeAgentRunService & {
  calls: unknown[];
} {
  let index = 0;
  const calls: unknown[] = [];
  return {
    calls,
    async run(request) {
      calls.push(request.input);
      const step = steps[index];
      index += 1;
      if (!step) throw new Error("Scripted agent service exhausted.");
      if (step.kind === "failure") {
        return {
          artifactId: `agent-run-${index}`,
          run: {
            succeeded: false,
            output: null,
            failure: { message: step.message },
          },
        };
      }
      return {
        artifactId: `agent-run-${index}`,
        run: { succeeded: true, output: step.output, failure: null },
      };
    },
  };
}

async function createController(steps: ScriptStep[]) {
  const root = await mkdtemp(join(tmpdir(), "intake-controller-"));
  createdDirectories.push(root);
  const store = new FoundryArtifactStore(root);
  const briefService = new ProjectBriefService(store);
  const agentService = scriptedAgentService(steps);
  const controller = new IntakeSessionController({
    agentService,
    briefService,
    store,
  });
  return { controller, briefService, store, agentService };
}

describe("IntakeSessionController", () => {
  it("runs a scripted interview to ready-for-decision with full lineage", async () => {
    const unresolvedGoal = {
      id: randomUUID(),
      text: "Placeholder goal",
      source: "unresolved" as const,
    };
    const q1 = question([unresolvedGoal.id]);
    const resolvedGoal = { ...unresolvedGoal, source: "user-stated" as const };
    const criterion = {
      id: randomUUID(),
      text: "A weekly plan covers seven days.",
      source: "user-stated" as const,
      verification: "Generate a plan and count the days.",
    };

    const { controller, briefService, agentService } = await createController([
      {
        kind: "output",
        output: {
          updatedBriefDraft: content({ goals: [unresolvedGoal] }),
          nextQuestions: [{ ...q1, intent: "resolve-unresolved" }],
          openIssues: [],
        },
      },
      {
        kind: "output",
        output: {
          updatedBriefDraft: content({ goals: [resolvedGoal] }),
          nextQuestions: [question()],
          openIssues: [
            {
              id: randomUUID(),
              description: "No acceptance criteria yet.",
              severity: "blocking",
              relatedEntryIds: [],
            },
          ],
        },
      },
      {
        kind: "output",
        output: {
          updatedBriefDraft: content({
            goals: [resolvedGoal],
            acceptanceCriteria: [criterion],
          }),
          nextQuestions: [],
          openIssues: [],
        },
      },
    ]);

    const started = await controller.startIntake({
      title: "Recipe planner",
      idea: "Plan weekly meals from pantry contents.",
      maxTurns: 5,
    });
    expect(started.brief.version).toBe(2);
    expect(started.record.status).toBe("awaiting-answers");

    const second = await controller.runTurn({
      briefId: started.brief.briefId,
      answers: [
        {
          questionId: started.record.nextQuestions[0]!.id,
          answer: "The goal is confirmed as stated.",
        },
      ],
    });
    expect(second.brief.version).toBe(3);
    expect(second.record.status).toBe("awaiting-answers");

    const third = await controller.runTurn({
      briefId: started.brief.briefId,
      answers: [
        {
          questionId: second.record.nextQuestions[0]!.id,
          answer: "QA engineers; add a seven-day criterion.",
        },
      ],
    });
    expect(third.brief.version).toBe(4);
    expect(third.record.status).toBe("ready-for-decision");

    const lineage = await briefService.verifyLineage(started.brief.briefId);
    expect(lineage.valid).toBe(true);
    expect(lineage.latestVersion).toBe(4);

    const status = await controller.status(started.brief.briefId);
    expect(status.status).toBe("ready-for-decision");
    expect(status.provenanceConversion).not.toBeNull();
    expect(agentService.calls).toHaveLength(3);
  });

  it("marks the turn budget exhausted when unresolved content remains", async () => {
    const { controller } = await createController([
      {
        kind: "output",
        output: {
          updatedBriefDraft: content({
            goals: [
              { id: randomUUID(), text: "Placeholder", source: "unresolved" },
            ],
          }),
          nextQuestions: [question()],
          openIssues: [],
        },
      },
    ]);

    const started = await controller.startIntake({
      title: "Recipe planner",
      idea: "Plan weekly meals.",
      maxTurns: 1,
    });
    expect(started.record.status).toBe("turn-budget-exhausted");

    await expect(
      controller.runTurn({
        briefId: started.brief.briefId,
        answers: [{ questionId: null, answer: "More detail." }],
      }),
    ).rejects.toThrowError(/turn-budget-exhausted/);
  });

  it("persists a model-failure record and rethrows", async () => {
    const { controller, store } = await createController([
      { kind: "failure", message: "Provider exploded." },
    ]);

    await expect(
      controller.startIntake({ title: "Recipe planner", idea: "Plan meals." }),
    ).rejects.toThrowError(/Provider exploded/);

    const { artifacts } = await store.list({ kind: "intake-turn" });
    expect(artifacts).toHaveLength(1);
    const stored = await store.load(artifacts[0]!.id);
    expect(stored.kind).toBe("intake-turn");
    if (stored.kind === "intake-turn") {
      expect(stored.artifact.status).toBe("model-failure");
      expect(stored.artifact.resultingBriefVersion).toBeNull();
      expect(stored.artifact.agentRunArtifactId).toBe("agent-run-1");
    }
  });

  it("resumes with a retry turn after a model failure", async () => {
    const goal = {
      id: randomUUID(),
      text: "Track daily habits",
      source: "user-stated" as const,
    };
    const q1 = question([goal.id]);
    const openQuestion = {
      id: randomUUID(),
      question: "Which platforms must be supported?",
      relatedEntryIds: [goal.id],
    };
    const { controller, store } = await createController([
      {
        kind: "output",
        output: {
          updatedBriefDraft: content({
            goals: [goal],
            openQuestions: [openQuestion],
          }),
          nextQuestions: [{ ...q1, intent: "confirm-inferred" }],
          openIssues: [],
        },
      },
      { kind: "failure", message: "Model cited an invalid entry." },
      {
        kind: "output",
        output: {
          updatedBriefDraft: content({ goals: [goal] }),
          nextQuestions: [],
          openIssues: [],
        },
      },
    ]);

    const started = await controller.startIntake({
      title: "Habit tracker",
      idea: "Track habits.",
      maxTurns: 5,
    });
    const answers = [{ questionId: q1.id, answer: "Goal confirmed." }];

    await expect(
      controller.runTurn({ briefId: started.brief.briefId, answers }),
    ).rejects.toThrowError(/invalid entry/i);

    const retried = await controller.runTurn({
      briefId: started.brief.briefId,
      answers,
    });
    expect(retried.record.turnNumber).toBe(3);
    expect(retried.record.status).toBe("ready-for-decision");

    const { artifacts } = await store.list({ kind: "intake-turn" });
    expect(artifacts).toHaveLength(3);
  });

  it("rejects answers citing unknown question ids before calling the model", async () => {
    const { controller, agentService } = await createController([
      {
        kind: "output",
        output: {
          updatedBriefDraft: content(),
          nextQuestions: [question()],
          openIssues: [
            {
              id: randomUUID(),
              description: "Users unknown.",
              severity: "blocking",
              relatedEntryIds: [],
            },
          ],
        },
      },
    ]);

    const started = await controller.startIntake({
      title: "Recipe planner",
      idea: "Plan meals.",
      maxTurns: 5,
    });
    expect(agentService.calls).toHaveLength(1);

    await expect(
      controller.runTurn({
        briefId: started.brief.briefId,
        answers: [{ questionId: randomUUID(), answer: "Answer to nothing." }],
      }),
    ).rejects.toThrowError(/unknown question/i);
    expect(agentService.calls).toHaveLength(1);
  });

  it("rejects further turns after ready-for-decision", async () => {
    const { controller } = await createController([
      {
        kind: "output",
        output: {
          updatedBriefDraft: content({
            goals: [
              { id: randomUUID(), text: "Confirmed goal", source: "user-stated" },
            ],
          }),
          nextQuestions: [],
          openIssues: [],
        },
      },
    ]);

    const started = await controller.startIntake({
      title: "Recipe planner",
      idea: "Plan meals.",
      maxTurns: 5,
    });
    expect(started.record.status).toBe("ready-for-decision");

    await expect(
      controller.runTurn({
        briefId: started.brief.briefId,
        answers: [{ questionId: null, answer: "One more thought." }],
      }),
    ).rejects.toThrowError(/ready-for-decision/);
  });
});
