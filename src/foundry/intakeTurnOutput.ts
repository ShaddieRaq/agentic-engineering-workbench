import { z } from "zod";
import {
  projectBriefDraftContentSchema,
  projectBriefDraftContentShapeSchema,
  type ProjectBriefDraftContent,
} from "./projectBrief.js";

export const intakeQuestionIntentSchema = z.enum([
  "resolve-unresolved",
  "confirm-inferred",
  "elicit-new",
]);

export const intakeNextQuestionSchema = z
  .object({
    id: z.uuid(),
    question: z.string().min(1).max(2_000),
    targetEntryIds: z.array(z.uuid()).max(50),
    intent: intakeQuestionIntentSchema,
  })
  .strict();

export const intakeOpenIssueSchema = z
  .object({
    id: z.uuid(),
    description: z.string().min(1).max(2_000),
    severity: z.enum(["blocking", "advisory"]),
    relatedEntryIds: z.array(z.uuid()).max(50),
  })
  .strict();

// The structural contract sent to the provider: no cross-reference checks and
// no reconciliation field, so structural model slips (duplicate ids, dangling
// references) survive parsing long enough to be deterministically repaired.
export const intakeTurnModelOutputSchema = z
  .object({
    updatedBriefDraft: projectBriefDraftContentShapeSchema,
    nextQuestions: z.array(intakeNextQuestionSchema).max(10),
    openIssues: z.array(intakeOpenIssueSchema).max(50),
  })
  .strict();

export const intakeReconciliationSectionSchema = z.enum([
  "goals",
  "users",
  "constraints",
  "risks",
  "nonGoals",
  "assumptions",
  "acceptanceCriteria",
  "openQuestions",
]);

export const intakeReconciliationSchema = z
  .object({
    remintedEntries: z
      .array(
        z
          .object({
            originalId: z.uuid(),
            mintedId: z.uuid(),
            section: intakeReconciliationSectionSchema,
          })
          .strict(),
      )
      .max(50),
    removedReferences: z
      .array(
        z
          .object({
            context: z.enum(["nextQuestions", "openIssues", "openQuestions"]),
            ownerId: z.uuid(),
            removedId: z.uuid(),
          })
          .strict(),
      )
      .max(100),
    droppedQuestionIds: z.array(z.uuid()).max(10),
  })
  .strict();

function collectBriefEntryIds(brief: ProjectBriefDraftContent): Set<string> {
  const ids = new Set<string>();
  for (const section of [
    brief.goals,
    brief.users,
    brief.constraints,
    brief.risks,
    brief.nonGoals,
    brief.assumptions,
    brief.acceptanceCriteria,
  ]) {
    for (const entry of section) ids.add(entry.id);
  }
  return ids;
}

export const intakeTurnOutputSchema = z
  .object({
    updatedBriefDraft: projectBriefDraftContentSchema,
    nextQuestions: z.array(intakeNextQuestionSchema).max(10),
    openIssues: z.array(intakeOpenIssueSchema).max(50),
    reconciliation: intakeReconciliationSchema.nullable(),
  })
  .strict()
  .superRefine((turn, context) => {
    const entryIds = collectBriefEntryIds(turn.updatedBriefDraft);

    turn.nextQuestions.forEach((question, index) => {
      if (question.intent !== "elicit-new" && question.targetEntryIds.length === 0) {
        context.addIssue({
          code: "custom",
          path: ["nextQuestions", index, "targetEntryIds"],
          message: `A ${question.intent} question must target at least one brief entry.`,
        });
      }
      for (const targetId of question.targetEntryIds) {
        if (!entryIds.has(targetId)) {
          context.addIssue({
            code: "custom",
            path: ["nextQuestions", index, "targetEntryIds"],
            message: `Question ${question.id} targets unknown brief entry ${targetId}.`,
          });
        }
      }
    });

    turn.openIssues.forEach((issue, index) => {
      for (const relatedId of issue.relatedEntryIds) {
        if (!entryIds.has(relatedId)) {
          context.addIssue({
            code: "custom",
            path: ["openIssues", index, "relatedEntryIds"],
            message: `Open issue ${issue.id} references unknown brief entry ${relatedId}.`,
          });
        }
      }
    });
  });

export type IntakeQuestionIntent = z.infer<typeof intakeQuestionIntentSchema>;
export type IntakeNextQuestion = z.infer<typeof intakeNextQuestionSchema>;
export type IntakeOpenIssue = z.infer<typeof intakeOpenIssueSchema>;
export type IntakeTurnModelOutput = z.infer<typeof intakeTurnModelOutputSchema>;
export type IntakeReconciliation = z.infer<typeof intakeReconciliationSchema>;
export type IntakeTurnOutput = z.infer<typeof intakeTurnOutputSchema>;
