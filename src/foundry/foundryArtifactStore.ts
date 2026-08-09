import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import {
  architecturePlanSchema,
  type ArchitecturePlan,
} from "./architecturePlan.js";
import {
  architecturePlanDecisionSchema,
  type ArchitecturePlanDecision,
} from "./architecturePlanDecision.js";
import {
  capabilityPlanSchema,
  type CapabilityPlan,
} from "./capabilityPlan.js";
import {
  capabilityPlanDecisionSchema,
  type CapabilityPlanDecision,
} from "./capabilityPlanDecision.js";
import {
  exportFeedbackRecordSchema,
  type ExportFeedbackRecord,
} from "./exportFeedback.js";
import {
  builderNoteSchema,
  builderQuestionSchema,
  operatorAnswerSchema,
  type BuilderNote,
  type BuilderQuestion,
  type OperatorAnswer,
} from "./builderMessage.js";
import {
  sliceSubmissionSchema,
  submissionDecisionSchema,
  type SliceSubmission,
  type SubmissionDecision,
} from "./sliceSubmission.js";
import { testSuiteSchema, type TestSuite } from "./testSuite.js";
import { workOrderSchema, type WorkOrder } from "./workOrder.js";
import {
  buildCompletionSchema,
  type BuildCompletion,
} from "./buildCompletion.js";
import {
  testSuiteDecisionSchema,
  type TestSuiteDecision,
} from "./testSuiteDecision.js";
import { intakeTurnRecordSchema, type IntakeTurnRecord } from "./intakeTurn.js";
import { projectBriefSchema, type ProjectBrief } from "./projectBrief.js";
import {
  projectBriefDecisionSchema,
  type ProjectBriefDecision,
} from "./projectBriefDecision.js";

const MAXIMUM_ARTIFACT_BYTES = 8 * 1024 * 1024;

export type FoundryArtifactKind =
  | "project-brief"
  | "project-brief-decision"
  | "intake-turn"
  | "export-feedback"
  | "architecture-plan"
  | "architecture-plan-decision"
  | "capability-plan"
  | "capability-plan-decision"
  | "test-suite"
  | "test-suite-decision"
  | "work-order"
  | "slice-submission"
  | "submission-decision"
  | "build-completion"
  | "builder-note"
  | "builder-question"
  | "operator-answer";

export interface FoundryArtifactReference {
  id: string;
  kind: FoundryArtifactKind;
  path: string;
}

export type FoundryStoredArtifact =
  | { kind: "project-brief"; artifact: ProjectBrief }
  | { kind: "project-brief-decision"; artifact: ProjectBriefDecision }
  | { kind: "intake-turn"; artifact: IntakeTurnRecord }
  | { kind: "export-feedback"; artifact: ExportFeedbackRecord }
  | { kind: "architecture-plan"; artifact: ArchitecturePlan }
  | { kind: "architecture-plan-decision"; artifact: ArchitecturePlanDecision }
  | { kind: "capability-plan"; artifact: CapabilityPlan }
  | { kind: "capability-plan-decision"; artifact: CapabilityPlanDecision }
  | { kind: "test-suite"; artifact: TestSuite }
  | { kind: "test-suite-decision"; artifact: TestSuiteDecision }
  | { kind: "work-order"; artifact: WorkOrder }
  | { kind: "slice-submission"; artifact: SliceSubmission }
  | { kind: "submission-decision"; artifact: SubmissionDecision }
  | { kind: "build-completion"; artifact: BuildCompletion }
  | { kind: "builder-note"; artifact: BuilderNote }
  | { kind: "builder-question"; artifact: BuilderQuestion }
  | { kind: "operator-answer"; artifact: OperatorAnswer };

export interface FoundryArtifactSummary {
  id: string;
  kind: FoundryArtifactKind;
  path: string;
  briefId: string;
  briefVersion: number;
  createdAt: string;
}

export interface FoundryArtifactQuery {
  kind?: FoundryArtifactKind;
  briefId?: string;
  limit?: number;
}

export interface FoundryArtifactListResult {
  artifacts: FoundryArtifactSummary[];
  rejected: { path: string; reason: string }[];
}

interface FoundryKindDefinition {
  parse(value: unknown): FoundryStoredArtifact;
  summarize(id: string, path: string, stored: FoundryStoredArtifact): FoundryArtifactSummary;
}

const kindDefinitions: Record<FoundryArtifactKind, FoundryKindDefinition> = {
  "project-brief": {
    parse: (value) => ({
      kind: "project-brief",
      artifact: projectBriefSchema.parse(value),
    }),
    summarize: (id, path, stored) => {
      const brief = stored.artifact as ProjectBrief;
      return {
        id,
        kind: "project-brief",
        path,
        briefId: brief.briefId,
        briefVersion: brief.version,
        createdAt: brief.createdAt,
      };
    },
  },
  "project-brief-decision": {
    parse: (value) => ({
      kind: "project-brief-decision",
      artifact: projectBriefDecisionSchema.parse(value),
    }),
    summarize: (id, path, stored) => {
      const decision = stored.artifact as ProjectBriefDecision;
      return {
        id,
        kind: "project-brief-decision",
        path,
        briefId: decision.briefId,
        briefVersion: decision.briefVersion,
        createdAt: decision.decidedAt,
      };
    },
  },
  "intake-turn": {
    parse: (value) => ({
      kind: "intake-turn",
      artifact: intakeTurnRecordSchema.parse(value),
    }),
    summarize: (id, path, stored) => {
      const turn = stored.artifact as IntakeTurnRecord;
      return {
        id,
        kind: "intake-turn",
        path,
        briefId: turn.briefId,
        // Failed turns produce no brief version; 0 marks that explicitly.
        briefVersion: turn.resultingBriefVersion ?? 0,
        createdAt: turn.completedAt,
      };
    },
  },
  "export-feedback": {
    parse: (value) => ({
      kind: "export-feedback",
      artifact: exportFeedbackRecordSchema.parse(value),
    }),
    summarize: (id, path, stored) => {
      const feedback = stored.artifact as ExportFeedbackRecord;
      return {
        id,
        kind: "export-feedback",
        path,
        // Feedback scopes to an export, not a brief; briefId carries the
        // export id so listings remain filterable.
        briefId: feedback.exportId,
        briefVersion: feedback.bundle.finalBriefVersion,
        createdAt: feedback.importedAt,
      };
    },
  },
  "architecture-plan": {
    parse: (value) => ({
      kind: "architecture-plan",
      artifact: architecturePlanSchema.parse(value),
    }),
    summarize: (id, path, stored) => {
      const plan = stored.artifact as ArchitecturePlan;
      return {
        id,
        kind: "architecture-plan",
        path,
        briefId: plan.briefId,
        briefVersion: plan.briefVersion,
        createdAt: plan.createdAt,
      };
    },
  },
  "architecture-plan-decision": {
    parse: (value) => ({
      kind: "architecture-plan-decision",
      artifact: architecturePlanDecisionSchema.parse(value),
    }),
    summarize: (id, path, stored) => {
      const decision = stored.artifact as ArchitecturePlanDecision;
      return {
        id,
        kind: "architecture-plan-decision",
        path,
        briefId: decision.briefId,
        briefVersion: decision.briefVersion,
        createdAt: decision.decidedAt,
      };
    },
  },
  "capability-plan": {
    parse: (value) => ({
      kind: "capability-plan",
      artifact: capabilityPlanSchema.parse(value),
    }),
    summarize: (id, path, stored) => {
      const plan = stored.artifact as CapabilityPlan;
      return {
        id,
        kind: "capability-plan",
        path,
        briefId: plan.briefId,
        briefVersion: plan.briefVersion,
        createdAt: plan.createdAt,
      };
    },
  },
  "capability-plan-decision": {
    parse: (value) => ({
      kind: "capability-plan-decision",
      artifact: capabilityPlanDecisionSchema.parse(value),
    }),
    summarize: (id, path, stored) => {
      const decision = stored.artifact as CapabilityPlanDecision;
      return {
        id,
        kind: "capability-plan-decision",
        path,
        briefId: decision.briefId,
        briefVersion: decision.briefVersion,
        createdAt: decision.decidedAt,
      };
    },
  },
  "test-suite": {
    parse: (value) => ({
      kind: "test-suite",
      artifact: testSuiteSchema.parse(value),
    }),
    summarize: (id, path, stored) => {
      const suite = stored.artifact as TestSuite;
      return {
        id,
        kind: "test-suite",
        path,
        briefId: suite.briefId,
        briefVersion: suite.briefVersion,
        createdAt: suite.createdAt,
      };
    },
  },
  "test-suite-decision": {
    parse: (value) => ({
      kind: "test-suite-decision",
      artifact: testSuiteDecisionSchema.parse(value),
    }),
    summarize: (id, path, stored) => {
      const decision = stored.artifact as TestSuiteDecision;
      return {
        id,
        kind: "test-suite-decision",
        path,
        briefId: decision.briefId,
        briefVersion: decision.briefVersion,
        createdAt: decision.decidedAt,
      };
    },
  },
  "work-order": {
    parse: (value) => ({
      kind: "work-order",
      artifact: workOrderSchema.parse(value),
    }),
    summarize: (id, path, stored) => {
      const workOrder = stored.artifact as WorkOrder;
      return {
        id,
        kind: "work-order",
        path,
        briefId: workOrder.briefId,
        briefVersion: workOrder.briefVersion,
        createdAt: workOrder.createdAt,
      };
    },
  },
  "slice-submission": {
    parse: (value) => ({
      kind: "slice-submission",
      artifact: sliceSubmissionSchema.parse(value),
    }),
    summarize: (id, path, stored) => {
      const submission = stored.artifact as SliceSubmission;
      return {
        id,
        kind: "slice-submission",
        path,
        briefId: submission.briefId,
        briefVersion: submission.briefVersion,
        createdAt: submission.createdAt,
      };
    },
  },
  "submission-decision": {
    parse: (value) => ({
      kind: "submission-decision",
      artifact: submissionDecisionSchema.parse(value),
    }),
    summarize: (id, path, stored) => {
      const decision = stored.artifact as SubmissionDecision;
      return {
        id,
        kind: "submission-decision",
        path,
        briefId: decision.briefId,
        briefVersion: decision.briefVersion,
        createdAt: decision.decidedAt,
      };
    },
  },
  "build-completion": {
    parse: (value) => ({
      kind: "build-completion",
      artifact: buildCompletionSchema.parse(value),
    }),
    summarize: (id, path, stored) => {
      const completion = stored.artifact as BuildCompletion;
      return {
        id,
        kind: "build-completion",
        path,
        briefId: completion.briefId,
        briefVersion: completion.briefVersion,
        createdAt: completion.createdAt,
      };
    },
  },
  "builder-note": {
    parse: (value) => ({
      kind: "builder-note",
      artifact: builderNoteSchema.parse(value),
    }),
    summarize: (id, path, stored) => {
      const note = stored.artifact as BuilderNote;
      return {
        id,
        kind: "builder-note",
        path,
        briefId: note.briefId,
        briefVersion: note.briefVersion,
        createdAt: note.createdAt,
      };
    },
  },
  "builder-question": {
    parse: (value) => ({
      kind: "builder-question",
      artifact: builderQuestionSchema.parse(value),
    }),
    summarize: (id, path, stored) => {
      const question = stored.artifact as BuilderQuestion;
      return {
        id,
        kind: "builder-question",
        path,
        briefId: question.briefId,
        briefVersion: question.briefVersion,
        createdAt: question.createdAt,
      };
    },
  },
  "operator-answer": {
    parse: (value) => ({
      kind: "operator-answer",
      artifact: operatorAnswerSchema.parse(value),
    }),
    summarize: (id, path, stored) => {
      const answer = stored.artifact as OperatorAnswer;
      return {
        id,
        kind: "operator-answer",
        path,
        briefId: answer.briefId,
        briefVersion: answer.briefVersion,
        createdAt: answer.answeredAt,
      };
    },
  },
};

// The decision pattern must be tested before the brief pattern because
// "project-brief-" is a prefix of "project-brief-decision-".
const orderedKinds: FoundryArtifactKind[] = [
  "project-brief-decision",
  "project-brief",
  "intake-turn",
  "export-feedback",
  "architecture-plan-decision",
  "architecture-plan",
  "capability-plan-decision",
  "capability-plan",
  "test-suite-decision",
  "test-suite",
  "work-order",
  "slice-submission",
  "submission-decision",
  "build-completion",
  // "builder-question" before "builder-note" is not required (no prefix
  // relation), but decisions-before-subjects ordering is the house style.
  "builder-question",
  "builder-note",
  "operator-answer",
];

function descriptor(
  fileName: string,
): { kind: FoundryArtifactKind; id: string } | null {
  for (const kind of orderedKinds) {
    const match = new RegExp(`^${kind}-([a-zA-Z0-9-]+)\\.json$`).exec(fileName);
    if (match?.[1]) return { kind, id: match[1] };
  }
  return null;
}

export function projectBriefArtifactId(brief: ProjectBrief): string {
  return `${brief.briefId}-v${brief.version}`;
}

export class FoundryArtifactStore {
  readonly #root: string;

  constructor(runsDirectory = "runs/foundry") {
    this.#root = resolve(runsDirectory);
  }

  async saveProjectBrief(brief: ProjectBrief): Promise<FoundryArtifactReference> {
    const validated = projectBriefSchema.parse(brief);
    return this.#write("project-brief", projectBriefArtifactId(validated), validated);
  }

  async saveProjectBriefDecision(
    decision: ProjectBriefDecision,
  ): Promise<FoundryArtifactReference> {
    const validated = projectBriefDecisionSchema.parse(decision);
    return this.#write("project-brief-decision", validated.decisionId, validated);
  }

  async saveIntakeTurnRecord(
    record: IntakeTurnRecord,
  ): Promise<FoundryArtifactReference> {
    const validated = intakeTurnRecordSchema.parse(record);
    return this.#write(
      "intake-turn",
      `${validated.briefId}-t${validated.turnNumber}`,
      validated,
    );
  }

  async saveExportFeedback(
    record: ExportFeedbackRecord,
  ): Promise<FoundryArtifactReference> {
    const validated = exportFeedbackRecordSchema.parse(record);
    return this.#write("export-feedback", validated.feedbackId, validated);
  }

  async saveArchitecturePlan(
    plan: ArchitecturePlan,
  ): Promise<FoundryArtifactReference> {
    const validated = architecturePlanSchema.parse(plan);
    return this.#write("architecture-plan", validated.planId, validated);
  }

  async saveArchitecturePlanDecision(
    decision: ArchitecturePlanDecision,
  ): Promise<FoundryArtifactReference> {
    const validated = architecturePlanDecisionSchema.parse(decision);
    return this.#write(
      "architecture-plan-decision",
      validated.decisionId,
      validated,
    );
  }

  async saveCapabilityPlan(
    plan: CapabilityPlan,
  ): Promise<FoundryArtifactReference> {
    const validated = capabilityPlanSchema.parse(plan);
    return this.#write("capability-plan", validated.capabilityPlanId, validated);
  }

  async saveCapabilityPlanDecision(
    decision: CapabilityPlanDecision,
  ): Promise<FoundryArtifactReference> {
    const validated = capabilityPlanDecisionSchema.parse(decision);
    return this.#write(
      "capability-plan-decision",
      validated.decisionId,
      validated,
    );
  }

  async saveTestSuite(suite: TestSuite): Promise<FoundryArtifactReference> {
    const validated = testSuiteSchema.parse(suite);
    return this.#write("test-suite", validated.testSuiteId, validated);
  }

  async saveTestSuiteDecision(
    decision: TestSuiteDecision,
  ): Promise<FoundryArtifactReference> {
    const validated = testSuiteDecisionSchema.parse(decision);
    return this.#write("test-suite-decision", validated.decisionId, validated);
  }

  async saveWorkOrder(workOrder: WorkOrder): Promise<FoundryArtifactReference> {
    const validated = workOrderSchema.parse(workOrder);
    return this.#write("work-order", validated.workOrderId, validated);
  }

  async saveSliceSubmission(
    submission: SliceSubmission,
  ): Promise<FoundryArtifactReference> {
    const validated = sliceSubmissionSchema.parse(submission);
    return this.#write("slice-submission", validated.submissionId, validated);
  }

  async saveSubmissionDecision(
    decision: SubmissionDecision,
  ): Promise<FoundryArtifactReference> {
    const validated = submissionDecisionSchema.parse(decision);
    return this.#write("submission-decision", validated.decisionId, validated);
  }

  async saveBuildCompletion(
    completion: BuildCompletion,
  ): Promise<FoundryArtifactReference> {
    const validated = buildCompletionSchema.parse(completion);
    return this.#write("build-completion", validated.completionId, validated);
  }

  async saveBuilderNote(note: BuilderNote): Promise<FoundryArtifactReference> {
    const validated = builderNoteSchema.parse(note);
    return this.#write("builder-note", validated.noteId, validated);
  }

  async saveBuilderQuestion(
    question: BuilderQuestion,
  ): Promise<FoundryArtifactReference> {
    const validated = builderQuestionSchema.parse(question);
    return this.#write("builder-question", validated.questionId, validated);
  }

  async saveOperatorAnswer(
    answer: OperatorAnswer,
  ): Promise<FoundryArtifactReference> {
    const validated = operatorAnswerSchema.parse(answer);
    return this.#write("operator-answer", validated.answerId, validated);
  }

  async load(id: string): Promise<FoundryStoredArtifact> {
    if (!/^[a-zA-Z0-9-]+$/.test(id)) {
      throw new Error("Artifact ID contains unsupported characters.");
    }

    for (const kind of orderedKinds) {
      try {
        return await this.#read(join(this.#root, `${kind}-${id}.json`), kind);
      } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }

    throw new Error(`Unknown foundry artifact: ${id}`);
  }

  async list(query: FoundryArtifactQuery = {}): Promise<FoundryArtifactListResult> {
    const limit = Math.min(Math.max(query.limit ?? 100, 1), 500);
    let names: string[];

    try {
      names = await readdir(this.#root);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { artifacts: [], rejected: [] };
      }
      throw error;
    }

    const artifacts: FoundryArtifactSummary[] = [];
    const rejected: FoundryArtifactListResult["rejected"] = [];

    for (const name of names.sort()) {
      const identified = descriptor(name);
      if (!identified || (query.kind && query.kind !== identified.kind)) continue;
      const path = join(this.#root, name);

      try {
        const stored = await this.#read(path, identified.kind);
        const item = kindDefinitions[identified.kind].summarize(
          identified.id,
          path,
          stored,
        );
        if (query.briefId && item.briefId !== query.briefId) continue;
        artifacts.push(item);
      } catch (error: unknown) {
        rejected.push({
          path,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    artifacts.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    return { artifacts: artifacts.slice(0, limit), rejected };
  }

  async #write(
    kind: FoundryArtifactKind,
    id: string,
    artifact:
      | ProjectBrief
      | ProjectBriefDecision
      | IntakeTurnRecord
      | ExportFeedbackRecord
      | ArchitecturePlan
      | ArchitecturePlanDecision
      | CapabilityPlan
      | CapabilityPlanDecision
      | TestSuite
      | TestSuiteDecision
      | WorkOrder
      | SliceSubmission
      | SubmissionDecision
      | BuildCompletion
      | BuilderNote
      | BuilderQuestion
      | OperatorAnswer,
  ): Promise<FoundryArtifactReference> {
    await mkdir(this.#root, { recursive: true });
    const path = join(this.#root, `${kind}-${id}.json`);
    await writeFile(path, JSON.stringify(artifact, null, 2), {
      encoding: "utf8",
      flag: "wx",
    });
    return { id, kind, path };
  }

  async #read(
    path: string,
    kind: FoundryArtifactKind,
  ): Promise<FoundryStoredArtifact> {
    if (resolve(path) !== join(this.#root, basename(path))) {
      throw new Error("Artifact path escapes the configured foundry directory.");
    }
    const metadata = await stat(path);
    if (!metadata.isFile()) throw new Error("Artifact path is not a file.");
    if (metadata.size > MAXIMUM_ARTIFACT_BYTES) {
      throw new Error(`Artifact exceeds ${MAXIMUM_ARTIFACT_BYTES} bytes.`);
    }
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    return kindDefinitions[kind].parse(parsed);
  }
}
