import { describe, expect, it } from "vitest";
import { SimpleHarness } from "../src/harness/simpleHarness.js";
import { FakeProvider } from "../src/providers/fakeProvider.js";

const role = {
    id: "technical-coach",
    instructions: "Explain concepts clearly and practically.",
};

describe("SimpleHarness", () => {
    it("returns the task and provider response", async () => {
        const provider = new FakeProvider("Harness response");
        const harness = new SimpleHarness(provider);

        const task = {
            id: "analyze-task",
            instruction: "Analyze this task",
        };

        const result = await harness.run(role, task);

        expect(result.task).toEqual(task);
        expect(result.output).toBe("Harness response");
        expect(result.durationMs).toBeGreaterThanOrEqual(0);
        expect(new Date(result.completedAt).toString()).not.toBe("Invalid Date");
        expect(result.role).toEqual(role);
        expect(result.prompt).toContain(role.instructions);
        expect(result.prompt).toContain(task.instruction);
        expect(result.runId).toBeTruthy();
    });
    it("rejects an invalid task before calling the provider", async () => {
        const provider = new FakeProvider("This should not be returned");
        const harness = new SimpleHarness(provider);
      
        const role = {
          id: "technical-coach",
          instructions: "Explain concepts clearly and practically.",
        };
      
        const invalidTask = {
          id: "invalid-task",
          instruction: "",
        };
      
        await expect(harness.run(role, invalidTask)).rejects.toThrow();
      });
});