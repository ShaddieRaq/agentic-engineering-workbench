import { randomUUID } from "node:crypto";
import type { FoundryArtifactStore } from "./foundryArtifactStore.js";
import { intakeTurnRecordSchema, type IntakeTurnRecord } from "./intakeTurn.js";
import type { IntakeOperatorAnswer } from "./intakeTurnInput.js";
import {
  intakeTurnOutputSchema,
  type IntakeReconciliation,
  type IntakeTurnOutput,
} from "./intakeTurnOutput.js";
import {
  briefContentOf,
  computeProvenanceConversion,
  type ProjectBrief,
  type ProvenanceConversionSummary,
} from "./projectBrief.js";
import type { ProjectBriefService } from "./projectBriefService.js";
import { collectStandingAdvisories } from "./standingAdvisories.js";

export const PROJECT_INTAKE_AGENT_ID = "project-intake";

// Failed turns do not consume interview budget, so retries need their own
// bound to keep model spend finite.
export const MAX_CONSECUTIVE_TURN_FAILURES = 2;

// Structural subset of AgentApplicationService.run so tests can script turns
// without fabricating complete agent-run artifacts.
export interface IntakeAgentRunService {
  run(request: { agentId: string; input: unknown; model?: string }): Promise<{
    artifactId: string;
    run: {
      succeeded: boolean;
      output: unknown;
      failure: { message: string } | null;
    };
  }>;
}

export interface IntakeTurnResult {
  brief: ProjectBrief;
  record: IntakeTurnRecord;
  reconciliation: IntakeReconciliation | null;
}

export interface IntakeStatusReport {
  briefId: string;
  briefVersion: number;
  status: IntakeTurnRecord["status"];
  completedTurns: number;
  attempts: number;
  maxTurns: number;
  nextQuestions: IntakeTurnRecord["nextQuestions"];
  openIssues: IntakeTurnRecord["openIssues"];
  provenanceConversion: ProvenanceConversionSummary | null;
}

export function deriveIntakeStatus(
  brief: ProjectBrief,
  output: IntakeTurnOutput,
  completedTurns: number,
  maxTurns: number,
): IntakeTurnRecord["status"] {
  const hasBlockingIssues = output.openIssues.some(
    ({ severity }) => severity === "blocking",
  );
  const hasUnresolvedEntries = [
    brief.goals,
    brief.users,
    brief.constraints,
    brief.risks,
    brief.nonGoals,
    brief.assumptions,
    brief.acceptanceCriteria,
  ].some((section) => section.some(({ source }) => source === "unresolved"));

  if (
    !hasBlockingIssues &&
    !hasUnresolvedEntries &&
    brief.openQuestions.length === 0
  ) {
    return "ready-for-decision";
  }
  if (completedTurns >= maxTurns) return "turn-budget-exhausted";
  return "awaiting-answers";
}

export class IntakeSessionController {
  readonly #agentService: IntakeAgentRunService;
  readonly #briefService: ProjectBriefService;
  readonly #store: FoundryArtifactStore;
  readonly #model: string | null;

  constructor(dependencies: {
    agentService: IntakeAgentRunService;
    briefService: ProjectBriefService;
    store: FoundryArtifactStore;
    model?: string | null;
  }) {
    this.#agentService = dependencies.agentService;
    this.#briefService = dependencies.briefService;
    this.#store = dependencies.store;
    this.#model = dependencies.model ?? null;
  }

  async startIntake(input: {
    title: string;
    idea: string;
    maxTurns?: number;
  }): Promise<IntakeTurnResult> {
    const maxTurns = input.maxTurns ?? 10;
    if (!Number.isInteger(maxTurns) || maxTurns < 1) {
      throw new Error("maxTurns must be a positive integer.");
    }

    const { brief } = await this.#briefService.initiateBrief({
      title: input.title,
      ideaSummary: input.idea,
    });

    return this.#executeTurn({
      briefId: brief.briefId,
      currentBrief: brief,
      operatorAnswers: [],
      turnNumber: 1,
      maxTurns,
    });
  }

  async runTurn(input: {
    briefId: string;
    answers: IntakeOperatorAnswer[];
  }): Promise<IntakeTurnResult> {
    const records = await this.#loadTurnRecords(input.briefId);
    const previous = records[records.length - 1] ?? null;
    if (previous === null) {
      throw new Error(
        `Brief ${input.briefId} has no intake turns. Use startIntake first.`,
      );
    }
    // A reopen decision recorded after the last completed turn re-arms the
    // interview regardless of how that turn closed (Decision 088).
    const reopenVersion = await this.#briefService.latestReopenVersion(
      input.briefId,
    );
    const currentVersion = (await this.#briefService.loadBrief(input.briefId))
      .version;
    const reopened =
      reopenVersion !== null && reopenVersion === currentVersion &&
      previous.status !== "awaiting-answers" &&
      previous.status !== "model-failure";
    if (
      previous.status !== "awaiting-answers" &&
      previous.status !== "model-failure" &&
      !reopened
    ) {
      throw new Error(
        `Intake for brief ${input.briefId} is ${previous.status} and cannot accept answers.`,
      );
    }

    let trailingFailures = 0;
    for (let index = records.length - 1; index >= 0; index -= 1) {
      if (records[index]!.status !== "model-failure") break;
      trailingFailures += 1;
    }
    if (trailingFailures >= MAX_CONSECUTIVE_TURN_FAILURES) {
      throw new Error(
        `Intake for brief ${input.briefId} failed ${trailingFailures} consecutive turns; ` +
          "review the model-failure evidence before retrying.",
      );
    }

    // After a model failure the interview resumes against the questions from
    // the last successful turn; a first-turn failure leaves none to cite.
    const questionSource =
      previous.status === "model-failure"
        ? [...records].reverse().find(({ status }) => status === "awaiting-answers")
        : previous;
    const knownQuestionIds = new Set(
      (questionSource?.nextQuestions ?? []).map(({ id }) => id),
    );
    for (const answer of input.answers) {
      if (answer.questionId !== null && !knownQuestionIds.has(answer.questionId)) {
        throw new Error(
          `Answer references unknown question ${answer.questionId} from turn ${previous.turnNumber}.`,
        );
      }
    }

    const currentBrief = await this.#briefService.loadBrief(input.briefId);
    return this.#executeTurn({
      briefId: input.briefId,
      currentBrief,
      operatorAnswers: input.answers,
      turnNumber: previous.turnNumber + 1,
      maxTurns: previous.maxTurns,
    });
  }

  async status(briefId: string): Promise<IntakeStatusReport> {
    const record = await this.#loadLatestTurnRecord(briefId);
    if (record === null) {
      throw new Error(`Brief ${briefId} has no intake turns.`);
    }

    const brief = await this.#briefService.loadBrief(briefId);
    let provenanceConversion: ProvenanceConversionSummary | null = null;
    if (brief.version > 1) {
      const previousBrief = await this.#briefService.loadBrief(
        briefId,
        brief.version - 1,
      );
      provenanceConversion = computeProvenanceConversion(previousBrief, brief);
    }

    const statusBudgetBase =
      (await this.#briefService.latestReopenVersion(briefId)) ?? 1;
    return {
      briefId,
      briefVersion: brief.version,
      status: record.status,
      completedTurns: brief.version - statusBudgetBase,
      attempts: record.turnNumber,
      maxTurns: record.maxTurns,
      nextQuestions: record.nextQuestions,
      openIssues: record.openIssues,
      provenanceConversion,
    };
  }

  async #executeTurn(turn: {
    briefId: string;
    currentBrief: ProjectBrief;
    operatorAnswers: IntakeOperatorAnswer[];
    turnNumber: number;
    maxTurns: number;
  }): Promise<IntakeTurnResult> {
    const startedAt = new Date().toISOString();
    // Interview progress is the brief version chain, not the attempt count:
    // every successful turn appends exactly one version, so failed attempts
    // never consume budget. After a reopen the budget is session-scoped —
    // counted from the version the reopen was recorded on (Decision 088),
    // otherwise a reopened v8 brief would be born budget-exhausted.
    const budgetBaseVersion =
      (await this.#briefService.latestReopenVersion(turn.briefId)) ?? 1;
    const completedTurns = turn.currentBrief.version - budgetBaseVersion;
    // Advisory lifecycle: reopened interviews carry the project's standing
    // advisories so every previously-flagged open edge is decided or
    // explicitly deferred rather than silently forgotten.
    let standingAdvisories: string[] = [];
    let fieldReports: string[] = [];
    if (budgetBaseVersion > 1) {
      const collected = await collectStandingAdvisories(
        this.#store,
        turn.briefId,
      );
      standingAdvisories = collected
        .slice(0, 30)
        .map(({ description }) => description);
      // Field reports (Decision 090): the operator's record of what the
      // shipped generation actually did on real inputs — newest first.
      const { artifacts } = await this.#store.list({
        kind: "field-report",
        briefId: turn.briefId,
        limit: 50,
      });
      const loaded = await Promise.all(
        artifacts.map((summary) => this.#store.load(summary.id)),
      );
      fieldReports = loaded
        .flatMap((stored) =>
          stored.kind === "field-report" ? [stored.artifact] : [],
        )
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, 10)
        .map(
          (report) =>
            `[generation v${report.briefVersion}, recorded by ${report.operatorId}] ${report.report}`,
        );
    }
    const agentInput = {
      briefContent: briefContentOf(turn.currentBrief),
      operatorAnswers: turn.operatorAnswers,
      turnNumber: completedTurns + 1,
      remainingTurns: Math.max(turn.maxTurns - completedTurns - 1, 0),
      ...(standingAdvisories.length > 0 ? { standingAdvisories } : {}),
      ...(fieldReports.length > 0 ? { fieldReports } : {}),
    };

    let agentRunArtifactId: string | null = null;
    let output: IntakeTurnOutput;
    try {
      const response = await this.#agentService.run({
        agentId: PROJECT_INTAKE_AGENT_ID,
        input: agentInput,
        ...(this.#model ? { model: this.#model } : {}),
      });
      agentRunArtifactId = response.artifactId;

      if (!response.run.succeeded || response.run.output === null) {
        throw new Error(
          response.run.failure?.message ??
            "Intake agent run did not produce a valid turn output.",
        );
      }
      output = intakeTurnOutputSchema.parse(response.run.output);
    } catch (error: unknown) {
      await this.#persistTurnRecord({
        ...turn,
        agentRunArtifactId,
        resultingBrief: null,
        output: { nextQuestions: [], openIssues: [] },
        status: "model-failure",
        startedAt,
      });
      throw new Error(
        `Intake turn ${turn.turnNumber} for brief ${turn.briefId} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    const { brief: resultingBrief } = await this.#briefService.appendBriefVersion(
      turn.briefId,
      output.updatedBriefDraft,
    );
    const status = deriveIntakeStatus(
      resultingBrief,
      output,
      // Session-scoped, same base as the pre-turn budget (Decision 088).
      resultingBrief.version - budgetBaseVersion,
      turn.maxTurns,
    );

    const record = await this.#persistTurnRecord({
      ...turn,
      agentRunArtifactId,
      resultingBrief,
      output: {
        nextQuestions: output.nextQuestions,
        openIssues: output.openIssues,
      },
      status,
      startedAt,
    });

    return { brief: resultingBrief, record, reconciliation: output.reconciliation };
  }

  async #persistTurnRecord(turn: {
    briefId: string;
    operatorAnswers: IntakeOperatorAnswer[];
    turnNumber: number;
    maxTurns: number;
    agentRunArtifactId: string | null;
    resultingBrief: ProjectBrief | null;
    output: {
      nextQuestions: IntakeTurnRecord["nextQuestions"];
      openIssues: IntakeTurnRecord["openIssues"];
    };
    status: IntakeTurnRecord["status"];
    startedAt: string;
  }): Promise<IntakeTurnRecord> {
    const record = intakeTurnRecordSchema.parse({
      turnId: randomUUID(),
      briefId: turn.briefId,
      turnNumber: turn.turnNumber,
      maxTurns: turn.maxTurns,
      agentRunArtifactId: turn.agentRunArtifactId,
      operatorAnswers: turn.operatorAnswers,
      resultingBriefVersion: turn.resultingBrief?.version ?? null,
      resultingBriefArtifactId: turn.resultingBrief
        ? `${turn.resultingBrief.briefId}-v${turn.resultingBrief.version}`
        : null,
      nextQuestions: turn.output.nextQuestions,
      openIssues: turn.output.openIssues,
      status: turn.status,
      startedAt: turn.startedAt,
      completedAt: new Date().toISOString(),
    });
    await this.#store.saveIntakeTurnRecord(record);
    return record;
  }

  async #loadTurnRecords(briefId: string): Promise<IntakeTurnRecord[]> {
    const { artifacts } = await this.#store.list({
      kind: "intake-turn",
      briefId,
      limit: 500,
    });

    const records: IntakeTurnRecord[] = [];
    for (const summary of artifacts) {
      const stored = await this.#store.load(summary.id);
      if (stored.kind !== "intake-turn") continue;
      records.push(stored.artifact);
    }
    return records.sort((left, right) => left.turnNumber - right.turnNumber);
  }

  async #loadLatestTurnRecord(briefId: string): Promise<IntakeTurnRecord | null> {
    const records = await this.#loadTurnRecords(briefId);
    return records[records.length - 1] ?? null;
  }
}
