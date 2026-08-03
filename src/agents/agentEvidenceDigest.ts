import { createHash } from "node:crypto";

export function digestJsonEvidence(value: unknown): string {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error("Digest evidence must be JSON-serializable.");
  }
  return createHash("sha256").update(serialized).digest("hex");
}
