export interface PortabilityPreflightInput {
  nodeVersion: string;
  packageLockPresent: boolean;
  packageScripts: Record<string, string>;
  gitignore: string;
  apiKeyConfigured: boolean;
}

export interface PortabilityCheck {
  id: string;
  status: "passed" | "failed" | "warning";
  message: string;
}

export interface PortabilityPreflightResult {
  passed: boolean;
  checks: PortabilityCheck[];
}

const requiredScripts = ["agents", "test", "typecheck", "web:build"];
const requiredIgnoredPaths = [".env", ".workbench/", "runs/"];

function supportedNodeVersion(version: string): boolean {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (match === null) return false;

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);

  return major > 20 || (
    major === 20
    && (minor > 19 || (minor === 19 && patch >= 0))
  );
}

function ignoredEntries(gitignore: string): Set<string> {
  return new Set(
    gitignore
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#")),
  );
}

export function evaluatePortabilityPreflight(
  input: PortabilityPreflightInput,
): PortabilityPreflightResult {
  const ignored = ignoredEntries(input.gitignore);
  const missingScripts = requiredScripts.filter(
    (script) => typeof input.packageScripts[script] !== "string",
  );
  const missingIgnores = requiredIgnoredPaths.filter(
    (path) => !ignored.has(path),
  );

  const checks: PortabilityCheck[] = [
    {
      id: "node-version",
      status: supportedNodeVersion(input.nodeVersion) ? "passed" : "failed",
      message: supportedNodeVersion(input.nodeVersion)
        ? `Node ${input.nodeVersion} satisfies the >=20.19.0 runtime requirement.`
        : `Node ${input.nodeVersion} does not satisfy the >=20.19.0 runtime requirement.`,
    },
    {
      id: "package-lock",
      status: input.packageLockPresent ? "passed" : "failed",
      message: input.packageLockPresent
        ? "package-lock.json is available for npm ci."
        : "package-lock.json is missing; reproducible npm ci is unavailable.",
    },
    {
      id: "package-scripts",
      status: missingScripts.length === 0 ? "passed" : "failed",
      message: missingScripts.length === 0
        ? "Required catalog, build, typecheck, and test scripts are available."
        : `Missing required package scripts: ${missingScripts.join(", ")}.`,
    },
    {
      id: "local-data-ignores",
      status: missingIgnores.length === 0 ? "passed" : "failed",
      message: missingIgnores.length === 0
        ? "Credentials, workspace metadata, and run evidence are ignored by Git."
        : `Missing required Git exclusions: ${missingIgnores.join(", ")}.`,
    },
    {
      id: "api-key",
      status: input.apiKeyConfigured ? "passed" : "warning",
      message: input.apiKeyConfigured
        ? "OPENAI_API_KEY is configured for live model runs."
        : "OPENAI_API_KEY is not configured; offline checks remain available.",
    },
  ];

  return {
    passed: checks.every(({ status }) => status !== "failed"),
    checks,
  };
}
