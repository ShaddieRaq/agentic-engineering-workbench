import { z } from "zod";
import { describe, expect, it } from "vitest";
import { ToolRegistry } from "../src/tools/toolRegistry.js";

function tool(id: string) {
  return {
    id,
    description: id,
    inputSchema: z.object({}).strict(),
    outputSchema: z.object({ id: z.string() }).strict(),
    async execute() {
      return { id };
    },
  };
}

describe("ToolRegistry", () => {
  it("resolves tools and creates an allowed subset", () => {
    const registry = new ToolRegistry([tool("beta"), tool("alpha")]);

    expect(registry.ids()).toEqual(["alpha", "beta"]);
    expect(registry.subset(["beta"]).ids()).toEqual(["beta"]);
    expect(() => registry.subset(["missing"])).toThrow(
      "Unknown tool: missing",
    );
  });

  it("rejects duplicate tool IDs", () => {
    expect(() => new ToolRegistry([tool("same"), tool("same")])).toThrow(
      "Tool IDs must be unique",
    );
  });
});
