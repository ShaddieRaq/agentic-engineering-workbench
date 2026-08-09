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
    // Advisory lifecycle: open edges recorded on prior generations'
    // approved artifacts, injected into reopened interviews so each is
    // decided or explicitly deferred instead of silently forgotten.
    standingAdvisories: z.array(z.string().min(1).max(2_000)).max(30).optional(),
    // Usage-feedback channel (Decision 090): operator-recorded field
    // reports from the completed generation — what the shipped software
    // actually did on real inputs. Injected into reopened interviews.
    fieldReports: z.array(z.string().min(1).max(8_000)).max(10).optional(),
  })
  .strict();

export type IntakeOperatorAnswer = z.infer<typeof intakeOperatorAnswerSchema>;
export type IntakeTurnInput = z.infer<typeof intakeTurnInputSchema>;
