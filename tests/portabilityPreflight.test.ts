import { describe, expect, it } from "vitest";
import { evaluatePortabilityPreflight } from "../src/portability/portabilityPreflight.js";

function validInput() {
  return {
    nodeVersion: "v20.19.0",
    packageLockPresent: true,
    packageScripts: {
      agents: "tsx src/runAgents.ts",
      test: "vitest run",
      typecheck: "tsc --noEmit",
      "web:build": "vite build",
    },
    gitignore: "node_modules/\n.env\nruns/\n.workbench/\n",
    apiKeyConfigured: false,
  };
}

describe("evaluatePortabilityPreflight", () => {
  it("passes an offline clean-clone configuration with an API-key warning", () => {
    const result = evaluatePortabilityPreflight(validInput());

    expect(result.passed).toBe(true);
    expect(result.checks).toContainEqual({
      id: "api-key",
      status: "warning",
      message: "OPENAI_API_KEY is not configured; offline checks remain available.",
    });
  });

  it("rejects an unsupported Node runtime", () => {
    const result = evaluatePortabilityPreflight({
      ...validInput(),
      nodeVersion: "v20.18.1",
    });

    expect(result.passed).toBe(false);
    expect(result.checks).toContainEqual(
      expect.objectContaining({ id: "node-version", status: "failed" }),
    );
  });

  it("rejects missing local evidence and credential exclusions", () => {
    const result = evaluatePortabilityPreflight({
      ...validInput(),
      gitignore: "node_modules/\n.env\n",
    });

    expect(result.passed).toBe(false);
    expect(result.checks).toContainEqual(
      expect.objectContaining({
        id: "local-data-ignores",
        status: "failed",
        message: "Missing required Git exclusions: .workbench/, runs/.",
      }),
    );
  });
});
