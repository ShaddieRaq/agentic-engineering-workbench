import { z } from "zod";
import { projectBriefDraftContentSchema } from "./projectBrief.js";

export const intakeOperatorAnswerSchema = z
  .object({
    questionId: z.uuid().nullable(),
    answer: z.string().min(1).max(8_000),
  })
  .strict();

export const intakeTurnInputSchema = z
  .object({
    briefContent: projectBriefDraftContentSchema,
    operatorAnswers: z.array(intakeOperatorAnswerSchema).max(50),
    turnNumber: z.number().int().min(1),
    remainingTurns: z.number().int().min(0),
  })
  .strict();

export type IntakeOperatorAnswer = z.infer<typeof intakeOperatorAnswerSchema>;
export type IntakeTurnInput = z.infer<typeof intakeTurnInputSchema>;
