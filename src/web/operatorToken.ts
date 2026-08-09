import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

// Decision 090: decision-class web routes must prove operator presence.
// The token is minted once, stored inside the Workbench tree (a path
// builder sessions are denied from reading), and surfaced only in the
// operator's own server terminal. Possession therefore demonstrates
// access to the operator's terminal or browser — the same trust root as
// the CLI's interactive-terminal guard (Decision 089).
export async function loadOrCreateOperatorToken(path: string): Promise<string> {
  try {
    const existing = (await readFile(path, "utf8")).trim();
    if (existing.length >= 32) return existing;
  } catch {
    // Missing or unreadable: mint below.
  }
  const token = randomBytes(32).toString("hex");
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${token}\n`, { encoding: "utf8", mode: 0o600 });
  return token;
}

export function operatorTokenMatches(
  expected: string,
  provided: unknown,
): boolean {
  if (typeof provided !== "string" || provided.length === 0) return false;
  // Hashing both sides gives timingSafeEqual equal-length buffers without
  // leaking the expected token's length.
  const left = createHash("sha256").update(expected).digest();
  const right = createHash("sha256").update(provided).digest();
  return timingSafeEqual(left, right);
}
