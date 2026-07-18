import { describe, expect, it } from "vitest";
import { roleSpecSchema } from "../src/harness/roleSpec.js";

describe("roleSpecSchema", () => {
  it("accepts a valid role", () => {
    const result = roleSpecSchema.parse({
      id: "technical-coach",
      instructions: "Explain concepts clearly and practically.",
    });

    expect(result.id).toBe("technical-coach");
  });

  it("rejects empty instructions", () => {
    expect(() =>
      roleSpecSchema.parse({
        id: "technical-coach",
        instructions: "",
      }),
    ).toThrow();
  });
});