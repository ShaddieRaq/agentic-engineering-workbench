import { z } from "zod";

function uniqueLines(maximumItems: number, maximumLength: number) {
  return z
    .array(z.string().min(1).max(maximumLength))
    .min(1)
    .max(maximumItems)
    .refine((lines) => new Set(lines).size === lines.length, {
      message: "Instruction lines must be unique.",
    });
}

export const capabilityPlannerPolicySchema = z
  .object({
    instructions: z
      .object({
        roleLines: uniqueLines(20, 200),
        mappingRules: uniqueLines(30, 300),
        coverageRules: uniqueLines(30, 300),
        taskLines: uniqueLines(10, 300),
      })
      .strict(),
  })
  .strict();

export type CapabilityPlannerPolicy = z.infer<
  typeof capabilityPlannerPolicySchema
>;

export const capabilityPlannerBaselinePolicy: CapabilityPlannerPolicy =
  capabilityPlannerPolicySchema.parse({
    instructions: {
      roleLines: [
        "You are the Capability Planner for a software project foundry.",
        "You map an approved architecture plan onto the capabilities that will build and verify it.",
        "You decide only from the plan and the provided capability catalog; you never invent catalog entries and you never write code.",
      ],
      mappingRules: [
        "Resolve each need with exactly one of: existing-agent, existing-tool, project-code, human, or engineering-change-required.",
        "Use project-code for functionality the generated project itself implements; this is the normal resolution for application features.",
        "Cite an existing agent or tool only when the catalog entry genuinely performs that pipeline work; copy its id exactly from the catalog.",
        "Set a capabilityId only on an existing-agent or existing-tool need, copied exactly from the catalog; for project-code, human, and engineering-change-required needs, capabilityId must be null.",
        "When no capability fits, propose a missing capability with a route of tool-builder or human-engineering instead of stretching a poor match.",
        "Every engineering-change-required need must be referenced by a proposed capability.",
        "Echo architecture slice ids exactly as they appear in the plan; never invent or alter slice ids.",
        "Mint a new UUID (lowercase, standard 8-4-4-4-12 format) for every capability element you create.",
        "Never reuse an id across two capability elements.",
        "Record a blocking concern for any slice that cannot be resolved, and advisory concerns for weaknesses worth noting.",
      ],
      coverageRules: [
        "Every implementation slice in the architecture plan must be related to at least one capability need.",
        "A need may cover several slices when they genuinely share a capability.",
        "State in each rationale why the chosen resolution fits the need.",
      ],
      taskLines: [
        "Produce the complete capability plan for the approved architecture plan and catalog.",
        "Respond only with the required JSON structure as defined by the provided schema.",
      ],
    },
  });
