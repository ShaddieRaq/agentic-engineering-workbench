import "dotenv/config";
import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import { evaluatePortabilityPreflight } from "./portability/portabilityPreflight.js";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const root = process.cwd();
  const packageJson = JSON.parse(
    await readFile(resolve(root, "package.json"), "utf8"),
  ) as { scripts?: Record<string, string> };
  const result = evaluatePortabilityPreflight({
    nodeVersion: process.version,
    packageLockPresent: await exists(resolve(root, "package-lock.json")),
    packageScripts: packageJson.scripts ?? {},
    gitignore: await readFile(resolve(root, ".gitignore"), "utf8"),
    apiKeyConfigured: Boolean(process.env.OPENAI_API_KEY),
  });

  console.log(`Portability preflight: ${result.passed ? "passed" : "failed"}`);
  for (const check of result.checks) {
    console.log(`[${check.status}] ${check.id}: ${check.message}`);
  }

  if (!result.passed) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error("Portability preflight failed:", error);
  process.exit(1);
});
