import { describe, expect, it } from "vitest";
import { taskSpecSchema } from "../src/harness/taskSpec.js";

describe("taskSpecSchema", () => {
  it("accepts a valid task", () => {
    const result = taskSpecSchema.parse({
      id: "analyze-task",
      instruction: "Analyze this task",
    });

    expect(result.id).toBe("analyze-task");
  });

  it("rejects an empty instruction", () => {
    expect(() =>
      taskSpecSchema.parse({
        id: "analyze-task",
        instruction: "",
      }),
    ).toThrow();
  });
});