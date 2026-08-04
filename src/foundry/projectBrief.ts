import { randomUUID } from "node:crypto";
import { z } from "zod";
import { digestJsonEvidence } from "../agents/agentEvidenceDigest.js";

export const briefProvenanceSourceSchema = z.enum([
  "user-stated",
  "agent-inferred",
  "unresolved",
]);

export const briefEntrySchema = z
  .object({
    id: z.uuid(),
    text: z.string().min(1).max(2_000),
    source: briefProvenanceSourceSchema,
  })
  .strict();

export const acceptanceCriterionSchema = z
  .object({
    id: z.uuid(),
    text: z.string().min(1).max(2_000),
    source: briefProvenanceSourceSchema,
    verification: z.string().min(1).max(2_000),
  })
  .strict();

export const openQuestionSchema = z
  .object({
    id: z.uuid(),
    question: z.string().min(1).max(2_000),
    relatedEntryIds: z.array(z.uuid()).max(50),
  })
  .strict();

const briefEntrySections = [
  "goals",
  "users",
  "constraints",
  "risks",
  "nonGoals",
  "assumptions",
] as const;

const briefContentShape = {
  title: z.string().min(1).max(200),
  ideaSummary: z.string().min(1).max(4_000),
  goals: z.array(briefEntrySchema).max(50),
  users: z.array(briefEntrySchema).max(50),
  constraints: z.array(briefEntrySchema).max(50),
  risks: z.array(briefEntrySchema).max(50),
  nonGoals: z.array(briefEntrySchema).max(50),
  assumptions: z.array(briefEntrySchema).max(50),
  acceptanceCriteria: z.array(acceptanceCriterionSchema).max(50),
  openQuestions: z.array(openQuestionSchema).max(50),
};

interface BriefContentLike {
  goals: BriefEntry[];
  users: BriefEntry[];
  constraints: BriefEntry[];
  risks: BriefEntry[];
  nonGoals: BriefEntry[];
  assumptions: BriefEntry[];
  acceptanceCriteria: AcceptanceCriterion[];
  openQuestions: OpenQuestion[];
}

function refineBriefContent(
  content: BriefContentLike,
  context: z.core.$RefinementCtx,
): void {
  const seenIds = new Set<string>();
  const entryIds = new Set<string>();
  for (const section of briefEntrySections) {
    for (const entry of content[section]) {
      if (seenIds.has(entry.id)) {
        context.addIssue({
          code: "custom",
          path: [section],
          message: `Duplicate brief entry ID: ${entry.id}.`,
        });
      }
      seenIds.add(entry.id);
      entryIds.add(entry.id);
    }
  }
  for (const criterion of content.acceptanceCriteria) {
    if (seenIds.has(criterion.id)) {
      context.addIssue({
        code: "custom",
        path: ["acceptanceCriteria"],
        message: `Duplicate brief entry ID: ${criterion.id}.`,
      });
    }
    seenIds.add(criterion.id);
    entryIds.add(criterion.id);
  }
  for (const question of content.openQuestions) {
    if (seenIds.has(question.id)) {
      context.addIssue({
        code: "custom",
        path: ["openQuestions"],
        message: `Duplicate brief entry ID: ${question.id}.`,
      });
    }
    seenIds.add(question.id);
    for (const relatedId of question.relatedEntryIds) {
      if (!entryIds.has(relatedId)) {
        context.addIssue({
          code: "custom",
          path: ["openQuestions"],
          message: `Open question ${question.id} references unknown entry ${relatedId}.`,
        });
      }
    }
  }
}

export const projectBriefDraftContentShapeSchema = z
  .object(briefContentShape)
  .strict();

export const projectBriefDraftContentSchema =
  projectBriefDraftContentShapeSchema.superRefine(refineBriefContent);

export const projectBriefSchema = z
  .object({
    briefId: z.uuid(),
    version: z.number().int().min(1),
    ...briefContentShape,
    previousVersionArtifactId: z.string().min(1).nullable(),
    previousVersionDigest: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    createdAt: z.string().min(1),
  })
  .strict()
  .superRefine((brief, context) => {
    refineBriefContent(brief, context);

    const isInitial = brief.version === 1;
    if (isInitial && brief.previousVersionArtifactId !== null) {
      context.addIssue({
        code: "custom",
        path: ["previousVersionArtifactId"],
        message: "An initial brief version cannot reference a previous version.",
      });
    }
    if (isInitial && brief.previousVersionDigest !== null) {
      context.addIssue({
        code: "custom",
        path: ["previousVersionDigest"],
        message: "An initial brief version cannot pin a previous digest.",
      });
    }
    if (!isInitial && brief.previousVersionArtifactId === null) {
      context.addIssue({
        code: "custom",
        path: ["previousVersionArtifactId"],
        message: "A later brief version must reference its previous version.",
      });
    }
    if (!isInitial && brief.previousVersionDigest === null) {
      context.addIssue({
        code: "custom",
        path: ["previousVersionDigest"],
        message: "A later brief version must pin its previous digest.",
      });
    }
  });

export type BriefProvenanceSource = z.infer<typeof briefProvenanceSourceSchema>;
export type BriefEntry = z.infer<typeof briefEntrySchema>;
export type AcceptanceCriterion = z.infer<typeof acceptanceCriterionSchema>;
export type OpenQuestion = z.infer<typeof openQuestionSchema>;
export type ProjectBriefDraftContent = z.infer<
  typeof projectBriefDraftContentSchema
>;
export type ProjectBrief = z.infer<typeof projectBriefSchema>;

export function briefContentOf(brief: ProjectBrief): ProjectBriefDraftContent {
  return projectBriefDraftContentSchema.parse({
    title: brief.title,
    ideaSummary: brief.ideaSummary,
    goals: brief.goals,
    users: brief.users,
    constraints: brief.constraints,
    risks: brief.risks,
    nonGoals: brief.nonGoals,
    assumptions: brief.assumptions,
    acceptanceCriteria: brief.acceptanceCriteria,
    openQuestions: brief.openQuestions,
  });
}

export function createInitialProjectBrief(input: {
  title: string;
  ideaSummary: string;
  goals?: BriefEntry[];
  users?: BriefEntry[];
  constraints?: BriefEntry[];
  risks?: BriefEntry[];
  nonGoals?: BriefEntry[];
  assumptions?: BriefEntry[];
  acceptanceCriteria?: AcceptanceCriterion[];
  openQuestions?: OpenQuestion[];
  briefId?: string;
  createdAt?: string;
}): ProjectBrief {
  return projectBriefSchema.parse({
    briefId: input.briefId ?? randomUUID(),
    version: 1,
    title: input.title,
    ideaSummary: input.ideaSummary,
    goals: input.goals ?? [],
    users: input.users ?? [],
    constraints: input.constraints ?? [],
    risks: input.risks ?? [],
    nonGoals: input.nonGoals ?? [],
    assumptions: input.assumptions ?? [],
    acceptanceCriteria: input.acceptanceCriteria ?? [],
    openQuestions: input.openQuestions ?? [],
    previousVersionArtifactId: null,
    previousVersionDigest: null,
    createdAt: input.createdAt ?? new Date().toISOString(),
  });
}

export function createNextBriefVersion(input: {
  previous: ProjectBrief;
  previousArtifactId: string;
  updated: Omit<
    ProjectBrief,
    | "briefId"
    | "version"
    | "previousVersionArtifactId"
    | "previousVersionDigest"
    | "createdAt"
  >;
  createdAt?: string;
}): ProjectBrief {
  const previous = projectBriefSchema.parse(input.previous);
  return projectBriefSchema.parse({
    ...input.updated,
    briefId: previous.briefId,
    version: previous.version + 1,
    previousVersionArtifactId: input.previousArtifactId,
    previousVersionDigest: digestJsonEvidence(previous),
    createdAt: input.createdAt ?? new Date().toISOString(),
  });
}

export interface ProvenanceConversionSummary {
  trackedEntries: number;
  convertedToUserStated: number;
  newlyAdded: number;
  removed: number;
}

function collectEntries(brief: ProjectBrief): Map<string, BriefProvenanceSource> {
  const entries = new Map<string, BriefProvenanceSource>();
  for (const section of briefEntrySections) {
    for (const entry of brief[section]) entries.set(entry.id, entry.source);
  }
  for (const criterion of brief.acceptanceCriteria) {
    entries.set(criterion.id, criterion.source);
  }
  return entries;
}

export function computeProvenanceConversion(
  previous: ProjectBrief,
  next: ProjectBrief,
): ProvenanceConversionSummary {
  const previousEntries = collectEntries(previous);
  const nextEntries = collectEntries(next);

  let trackedEntries = 0;
  let convertedToUserStated = 0;
  for (const [id, previousSource] of previousEntries) {
    const nextSource = nextEntries.get(id);
    if (nextSource === undefined) continue;
    trackedEntries += 1;
    if (previousSource !== "user-stated" && nextSource === "user-stated") {
      convertedToUserStated += 1;
    }
  }

  let newlyAdded = 0;
  for (const id of nextEntries.keys()) {
    if (!previousEntries.has(id)) newlyAdded += 1;
  }
  let removed = 0;
  for (const id of previousEntries.keys()) {
    if (!nextEntries.has(id)) removed += 1;
  }

  return { trackedEntries, convertedToUserStated, newlyAdded, removed };
}
