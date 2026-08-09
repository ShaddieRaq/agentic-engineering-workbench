import { homedir } from "node:os";
import { join } from "node:path";

// Operator-typed paths arrive from browser forms, where the shell never
// expands anything: a leading space broke a completion (2026-08-08) and
// an unexpanded ~ nested a builder workspace inside the workbench
// (2026-08-09). One normalizer at the web boundary for both classes.
export function normalizeOperatorPath(input: string): string {
  const trimmed = input.trim();
  if (trimmed === "~") return homedir();
  if (trimmed.startsWith("~/")) return join(homedir(), trimmed.slice(2));
  return trimmed;
}
