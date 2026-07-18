import { describe, expect, it } from "vitest";
import { contextItemSchema } from "../src/harness/contextItem.js";

describe("contextItemSchema", () => {
  it("accepts a valid context item", () => {
    const result = contextItemSchema.parse({
      id: "readme",
      source: "README.md",
      content: "This project is an agentic engineering workbench.",
    });

    expect(result.source).toBe("README.md");
  });

  it("rejects empty context content", () => {
    expect(() =>
      contextItemSchema.parse({
        id: "readme",
        source: "README.md",
        content: "",
      }),
    ).toThrow();
  });
});