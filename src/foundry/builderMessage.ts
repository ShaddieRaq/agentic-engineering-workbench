import { z } from "zod";

// Builder speech channel (Decision 090): the builder can INFORM (notes,
// submission reports) and ASK (questions); it can never act as the
// operator. Every text here is builder-authored and unverified — the
// console renders it labeled as such, and nothing in it participates in
// gate evaluation. Chain identity (brief, suite, slice) is derived
// server-side from the work order, never trusted from the builder.

export const builderNoteSchema = z
  .object({
    noteId: z.uuid(),
    workOrderId: z.uuid(),
    testSuiteId: z.uuid(),
    sliceId: z.uuid(),
    briefId: z.uuid(),
    briefVersion: z.number().int().min(1),
    note: z.string().min(1).max(4_000),
    createdAt: z.string().min(1),
  })
  .strict();

export const builderQuestionSchema = z
  .object({
    questionId: z.uuid(),
    workOrderId: z.uuid(),
    testSuiteId: z.uuid(),
    sliceId: z.uuid(),
    briefId: z.uuid(),
    briefVersion: z.number().int().min(1),
    question: z.string().min(1).max(4_000),
    createdAt: z.string().min(1),
  })
  .strict();

export const operatorAnswerSchema = z
  .object({
    answerId: z.uuid(),
    questionId: z.uuid(),
    briefId: z.uuid(),
    briefVersion: z.number().int().min(1),
    operatorId: z.string().min(1).max(200),
    answer: z.string().min(1).max(8_000),
    answeredAt: z.string().min(1),
  })
  .strict();

export type BuilderNote = z.infer<typeof builderNoteSchema>;
export type BuilderQuestion = z.infer<typeof builderQuestionSchema>;
export type OperatorAnswer = z.infer<typeof operatorAnswerSchema>;
