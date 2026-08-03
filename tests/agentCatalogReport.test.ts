import { describe, expect, it } from "vitest";
import { buildAgentCatalogReport } from "../src/agents/agentCatalogReport.js";
import { platformAgentRegistry } from "../src/agents/platformAgentRegistry.js";
import { createPlatformToolRegistry } from "../src/tools/toolRegistry.js";

describe("buildAgentCatalogReport", () => {
  it("reports versioned inventory and lifecycle status", () => {
    const report = buildAgentCatalogReport(
      platformAgentRegistry,
      createPlatformToolRegistry(process.cwd()),
    );

    expect(report).toMatchObject({
      totalAgents: 5,
      statusCounts: {
        experimental: 2,
        active: 3,
        deprecated: 0,
        retired: 0,
      },
      valid: true,
      validationIssues: [],
    });
    expect(report.agents.map(({ id, version }) => `${id}@${version}`)).toEqual([
      "change-risk-reviewer@1.0.0",
      "documentation-auditor@1.0.0",
      "playwright-failure-triage@0.1.0",
      "repository-assistant@1.0.0",
      "tool-builder@0.1.0",
    ]);
  });
});
