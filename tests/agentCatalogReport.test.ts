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
      totalAgents: 2,
      statusCounts: {
        experimental: 0,
        active: 2,
        deprecated: 0,
        retired: 0,
      },
      valid: true,
      validationIssues: [],
    });
    expect(report.agents.map(({ id, version }) => `${id}@${version}`)).toEqual([
      "change-risk-reviewer@1.0.0",
      "repository-assistant@1.0.0",
    ]);
  });
});
