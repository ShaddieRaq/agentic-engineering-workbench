import { z } from "zod";
import {
  capabilityResolutionSchema,
  type CapabilityPlanOutput,
} from "../../foundry/capabilityPlan.js";
import type { AgentOutputAssessment } from "../agentRegistration.js";

// Hidden-expectation vocabulary for the capability planner. The judgment under
// test is the reuse-vs-build discrimination: does the planner reuse a catalog
// capability that already covers a need, keep ordinary work as project-code,
// recognize a genuine capability gap as something to BUILD, and not fabricate
// capabilities it does not need. Each field is a deterministic check over the
// reconciled plan output.
export const capabilityPlannerExpectationSchema = z
  .object({
    forbidBlockingConcerns: z.boolean().default(false),
    requireBlockingConcern: z.boolean().default(false),
    // Proposals count ceiling. 0 = the planner must fabricate no new
    // capabilities (everything is reuse or ordinary project code).
    maxProposedCapabilities: z.number().int().min(0).nullable().default(null),
    // At least one proposed capability — the planner recognized a real gap
    // instead of hand-waving it as ordinary code.
    requireProposedCapability: z.boolean().default(false),
    // At least one need must resolve as each listed resolution.
    requireResolutions: z.array(capabilityResolutionSchema).default([]),
    // No need may resolve as any listed resolution.
    forbidResolutions: z.array(capabilityResolutionSchema).default([]),
    // Some need must reuse each listed catalog capability by id — the planner
    // recognized available reuse rather than reinventing it.
    requireResolutionCitingCapabilityIds: z.array(z.string().min(1)).default([]),
  })
  .strict();

export type CapabilityPlannerExpectation = z.infer<
  typeof capabilityPlannerExpectationSchema
>;

export function assessCapabilityPlannerExpectation(
  output: CapabilityPlanOutput,
  rawExpected: unknown,
): AgentOutputAssessment {
  const expected = capabilityPlannerExpectationSchema.parse(rawExpected);
  const failures: string[] = [];

  const resolutions = new Set(output.needs.map((need) => need.resolution));
  const blocking = output.concerns.filter(
    ({ severity }) => severity === "blocking",
  );

  if (expected.requireBlockingConcern && blocking.length === 0) {
    failures.push("Expected at least one blocking concern.");
  }
  if (expected.forbidBlockingConcerns && blocking.length > 0) {
    failures.push(
      `Expected no blocking concerns but found ${blocking.length}.`,
    );
  }

  if (
    expected.maxProposedCapabilities !== null &&
    output.proposedCapabilities.length > expected.maxProposedCapabilities
  ) {
    failures.push(
      `Expected at most ${expected.maxProposedCapabilities} proposed ` +
        `capability(ies) but found ${output.proposedCapabilities.length} — ` +
        "the planner fabricated capabilities the catalog or project code covers.",
    );
  }
  if (expected.requireProposedCapability && output.proposedCapabilities.length === 0) {
    failures.push(
      "Expected at least one proposed capability for the gap, but the " +
        "planner proposed none.",
    );
  }

  for (const resolution of expected.requireResolutions) {
    if (!resolutions.has(resolution)) {
      failures.push(`Expected at least one need resolved as "${resolution}".`);
    }
  }
  for (const resolution of expected.forbidResolutions) {
    if (resolutions.has(resolution)) {
      failures.push(`Expected no need resolved as "${resolution}", but one was.`);
    }
  }
  for (const capabilityId of expected.requireResolutionCitingCapabilityIds) {
    const cited = output.needs.some((need) => need.capabilityId === capabilityId);
    if (!cited) {
      failures.push(
        `Expected a need to reuse the existing catalog capability ` +
          `"${capabilityId}", but no need cited it.`,
      );
    }
  }

  if (failures.length > 0) {
    return { passed: false, message: failures.join(" ") };
  }
  return {
    passed: true,
    message:
      `Capability plan met the expectation (${output.needs.length} need(s), ` +
      `${output.proposedCapabilities.length} proposal(s)).`,
  };
}
