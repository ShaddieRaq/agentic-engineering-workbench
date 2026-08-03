import { z } from "zod";

const uniqueStrings = z
  .array(z.string().min(1).max(200))
  .max(50)
  .refine((values) => new Set(values).size === values.length, {
    message: "Values must be unique.",
  });

export const agentImprovementEvidenceKindSchema = z.enum([
  "evaluation-summary",
  "case-outcome",
  "trial-output",
  "assessment",
  "runtime-failure",
  "usage",
  "operator-feedback",
]);

export const agentImprovementEvidenceItemSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9:._/-]*$/).max(300),
    kind: agentImprovementEvidenceKindSchema,
    datasetId: z.string().min(1).max(200).nullable(),
    datasetCaseId: z.string().min(1).max(200).nullable(),
    agentRunId: z.string().min(1).max(200).nullable(),
    summary: z.string().min(1).max(2_000),
    details: z.json(),
  })
  .strict();

export const agentImprovementRevisionSurfaceSchema = z
  .object({
    mutableFields: uniqueStrings.min(1),
    baselinePolicy: z.record(z.string().min(1), z.json()),
  })
  .strict()
  .superRefine((surface, context) => {
    const allowed = new Set(surface.mutableFields);

    for (const field of Object.keys(surface.baselinePolicy)) {
      if (!allowed.has(field)) {
        context.addIssue({
          code: "custom",
          path: ["baselinePolicy", field],
          message: "Baseline policy contains a field outside the revision surface.",
        });
      }
    }
  });

export const agentImprovementEvidencePacketSchema = z
  .object({
    packetId: z.string().min(1).max(200),
    subject: z
      .object({
        agentId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
        agentVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
        manifestDigest: z.string().regex(/^[a-f0-9]{64}$/),
        description: z.string().min(1).max(2_000),
        workflowIds: uniqueStrings,
        toolIds: uniqueStrings,
        datasetIds: uniqueStrings,
      })
      .strict(),
    objective: z
      .object({
        target: z.enum([
          "reliability",
          "correctness",
          "grounding",
          "cost",
          "latency",
          "safety",
          "operator-defined",
        ]),
        description: z.string().min(1).max(2_000),
        constraints: z.array(z.string().min(1).max(500)).max(20),
      })
      .strict(),
    sourceExperimentIds: uniqueStrings.min(1).max(10),
    execution: z
      .object({
        workspaceId: z.string().min(1).max(200),
        model: z.string().min(1).max(200),
        repetitions: z.number().int().positive(),
        concurrency: z.number().int().positive(),
      })
      .strict(),
    aggregate: z
      .object({
        totalCases: z.number().int().nonnegative(),
        passedCases: z.number().int().nonnegative(),
        failedCases: z.number().int().nonnegative(),
        totalRuns: z.number().int().nonnegative(),
        passedRuns: z.number().int().nonnegative(),
        failedRuns: z.number().int().nonnegative(),
        passRate: z.number().min(0).max(1).nullable(),
      })
      .strict(),
    evidenceItems: z
      .array(agentImprovementEvidenceItemSchema)
      .min(1)
      .max(100)
      .refine(
        (items) => new Set(items.map(({ id }) => id)).size === items.length,
        { message: "Improvement evidence item IDs must be unique." },
      ),
    excludedEvidence: z
      .array(
        z
          .object({
            source: z.string().min(1).max(500),
            reason: z.string().min(1).max(1_000),
          })
          .strict(),
      )
      .max(100),
    revisionSurface: agentImprovementRevisionSurfaceSchema.nullable(),
  })
  .strict()
  .superRefine((packet, context) => {
    if (packet.aggregate.passedCases + packet.aggregate.failedCases !== packet.aggregate.totalCases) {
      context.addIssue({
        code: "custom",
        path: ["aggregate"],
        message: "Case totals do not match aggregate evidence.",
      });
    }
    if (packet.aggregate.passedRuns + packet.aggregate.failedRuns !== packet.aggregate.totalRuns) {
      context.addIssue({
        code: "custom",
        path: ["aggregate"],
        message: "Run totals do not match aggregate evidence.",
      });
    }
    const expectedPassRate = packet.aggregate.totalRuns === 0
      ? null
      : packet.aggregate.passedRuns / packet.aggregate.totalRuns;
    if (packet.aggregate.passRate !== expectedPassRate) {
      context.addIssue({
        code: "custom",
        path: ["aggregate", "passRate"],
        message: "Pass rate does not match aggregate run evidence.",
      });
    }
    if (Buffer.byteLength(JSON.stringify(packet), "utf8") > 262_144) {
      context.addIssue({
        code: "custom",
        message: "Improvement evidence packet exceeds 262144 bytes.",
      });
    }
  });

export type AgentImprovementEvidenceItem = z.infer<
  typeof agentImprovementEvidenceItemSchema
>;
export type AgentImprovementEvidencePacket = z.infer<
  typeof agentImprovementEvidencePacketSchema
>;
