import type { AgentManifest } from "./agentManifest.js";

/**
 * Models trusted to sit in a JUDGMENT seat (Decision 091). An advanced-tier
 * agent — one whose output is a verdict the rest of the system trusts — may
 * only run operationally on one of these. This allowlist is deliberately
 * small and grows only as the model matrix produces evidence that another
 * model is strong enough for judgment; it is a receipt, not a guess.
 *
 * The pattern matches "gpt-5.4" and dated snapshots ("gpt-5.4-2026-08-01")
 * but NOT "gpt-5.4-mini".
 */
const floorApprovedModelPattern = /^gpt-5\.4(?:-\d{4}-\d{2}-\d{2})?$/;

export function isFloorApprovedModel(model: string): boolean {
  return floorApprovedModelPattern.test(model);
}

/** True when the manifest marks a judgment seat (must run on a strong model). */
export function requiresStrongModel(manifest: AgentManifest): boolean {
  return manifest.reasoningTier === "advanced";
}

/**
 * Enforces the Decision 091 floor: an advanced-tier (judgment-seat) agent may
 * only run OPERATIONALLY on a floor-approved model, so a weak model can never
 * end up in the judge's chair by accident.
 *
 * Measurement is the deliberate exception: the model matrix passes
 * allowBelowFloor so a judge can still be MEASURED on a weak model — that
 * measurement is exactly how a model earns (or fails) its place on the
 * allowlist. Only the measurement path opts out; every operational path
 * (run, verify, the improvement analyst) enforces.
 */
export function assertModelMeetsFloor(
  manifest: AgentManifest,
  model: string,
  options: { allowBelowFloor?: boolean } = {},
): void {
  if (options.allowBelowFloor) return;
  if (!requiresStrongModel(manifest)) return;
  if (isFloorApprovedModel(model)) return;
  throw new Error(
    `Agent ${manifest.id} is an advanced (judgment-seat) agent and must run on a ` +
      `floor-approved strong model, not "${model}". Measure it with the model matrix, ` +
      `which is allowed to run below the floor deliberately.`,
  );
}
