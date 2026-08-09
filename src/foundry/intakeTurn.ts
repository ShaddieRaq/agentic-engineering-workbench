import { z } from "zod";
import { intakeOperatorAnswerSchema } from "./intakeTurnInput.js";
import {
  intakeNextQuestionSchema,
  intakeOpenIssueSchema,
} from "./intakeTurnOutput.js";

export const intakeTurnStatusSchema = z.enum([
  "awaiting-answers",
  "ready-for-decision",
  "turn-budget-exhausted",
  "model-failure",
]);

export const intakeTurnRecordSchema = z
  .object({
    turnId: z.uuid(),
    briefId: z.uuid(),
    turnNumber: z.number().int().min(1),
    maxTurns: z.number().int().min(1),
    agentRunArtifactId: z.string().min(1).nullable(),
    operatorAnswers: z.array(intakeOperatorAnswerSchema).max(50),
    resultingBriefVersion: z.number().int().min(1).nullable(),
    resultingBriefArtifactId: z.string().min(1).nullable(),
    nextQuestions: z.array(intakeNextQuestionSchema).max(10),
    openIssues: z.array(intakeOpenIssueSchema).max(50),
    status: intakeTurnStatusSchema,
    startedAt: z.string().min(1),
    completedAt: z.string().min(1),
    // Repeat-question guard evidence (2026-08-09): model questions whose
    // normalized text was already asked in a prior turn, filtered before
    // reaching the operator. Optional so prior records load unchanged.
    filteredDuplicateQuestions: z.array(z.string().min(1)).max(10).optional(),
  })
  .strict()
  .superRefine((record, context) => {
    const failed = record.status === "model-failure";
    if (failed && record.resultingBriefVersion !== null) {
      context.addIssue({
        code: "custom",
        path: ["resultingBriefVersion"],
        message: "A failed turn cannot produce a brief version.",
      });
    }
    if (failed && record.resultingBriefArtifactId !== null) {
      context.addIssue({
        code: "custom",
        path: ["resultingBriefArtifactId"],
        message: "A failed turn cannot produce a brief artifact.",
      });
    }
    if (!failed && record.resultingBriefVersion === null) {
      context.addIssue({
        code: "custom",
        path: ["resultingBriefVersion"],
        message: "A completed turn must record the resulting brief version.",
      });
    }
    if (!failed && record.resultingBriefArtifactId === null) {
      context.addIssue({
        code: "custom",
        path: ["resultingBriefArtifactId"],
        message: "A completed turn must record the resulting brief artifact.",
      });
    }
  });

export type IntakeTurnStatus = z.infer<typeof intakeTurnStatusSchema>;
export type IntakeTurnRecord = z.infer<typeof intakeTurnRecordSchema>;
