import { describe, expect, it, vi } from "vitest";
import { SimpleHarness } from "../src/harness/simpleHarness.js";
import { FakeProvider } from "../src/providers/fakeProvider.js";
import { NonEmptyOutputEvaluator } from "../src/evaluations/evaluateNonEmptyOutput.js";
import { MinimumLengthEvaluator } from "../src/evaluations/minimumLengthEvaluator.js";
import { z } from "zod";

const role = {
    id: "technical-coach",
    instructions: "Explain concepts clearly and practically.",
};

describe("SimpleHarness", () => {
    it("returns the task and provider response", async () => {
        const provider = new FakeProvider("Harness response");
        const harness = new SimpleHarness(
            provider,
            [new NonEmptyOutputEvaluator()],
            "test-harness",
        );

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
        expect(result.context).toEqual([]);
        expect(result.evaluations).toEqual([
            {
                evaluatorId: "non-empty-output",
                passed: true,
                message: "The agent produced output.",
            },
        ]);
        expect(result.harnessId).toBe("test-harness");
        expect(result.scenarioId).toBeNull();
    });
    it("records the configured scenario ID", async () => {
        const harness = new SimpleHarness(
            new FakeProvider("Harness response"),
            [],
            "test-harness",
            "test-scenario",
        );

        const result = await harness.run(role, {
            id: "analyze-task",
            instruction: "Analyze this task",
        });

        expect(result.scenarioId).toBe("test-scenario");
    });
    it("rejects an invalid task before calling the provider", async () => {
        const provider = new FakeProvider("This should not be returned");
        const harness = new SimpleHarness(provider, [
            new NonEmptyOutputEvaluator(),
        ],
            "test-harness");

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
    it("rejects invalid context before calling the provider", async () => {
        const provider = new FakeProvider("This should not be returned");
        const harness = new SimpleHarness(provider, [
            new NonEmptyOutputEvaluator(),
        ],
            "test-harness");

        const role = {
            id: "technical-coach",
            instructions: "Explain concepts clearly and practically.",
        };

        const task = {
            id: "explain-harness",
            instruction: "Explain what an agentic harness is.",
        };

        const invalidContext = [
            {
                id: "readme",
                source: "README.md",
                content: "",
            },
        ];

        await expect(
            harness.run(role, task, invalidContext),
        ).rejects.toThrow();
    });
    it("includes valid context in the prompt and result", async () => {
        const provider = new FakeProvider("Context-aware response");
        const harness = new SimpleHarness(provider, [
            new NonEmptyOutputEvaluator(),
        ],
            "test-harness");

        const role = {
            id: "technical-coach",
            instructions: "Explain concepts clearly and practically.",
        };

        const task = {
            id: "analyze-project",
            instruction: "Explain what this project does.",
        };

        const context = [
            {
                id: "readme",
                source: "README.md",
                content: "This project is an agentic engineering workbench.",
            },
        ];

        const result = await harness.run(role, task, context);

        expect(result.context).toEqual(context);
        expect(result.prompt).toContain("Source: README.md");
        expect(result.prompt).toContain(
            "This project is an agentic engineering workbench.",
        );
    });
    it("runs every configured evaluator", async () => {
        const provider = new FakeProvider("Hello");
        const harness = new SimpleHarness(provider, [
            new NonEmptyOutputEvaluator(),
            new MinimumLengthEvaluator(10),
        ],
            "test-harness");

        const result = await harness.run(
            {
                id: "coach",
                instructions: "Explain clearly.",
            },
            {
                id: "example",
                instruction: "Explain the example.",
            },
            [],
        );

        expect(result.evaluations).toEqual([
            {
                evaluatorId: "non-empty-output",
                passed: true,
                message: "The agent produced output.",
            },
            {
                evaluatorId: "minimum-length",
                passed: false,
                message: "The output had 5 characters but required at least 10.",
            },
        ]);
        expect(result.passed).toBe(false);
    });
    it("uses the provider request contract", async () => {
        const provider = new FakeProvider("Harness response");
        const generateSpy = vi.spyOn(provider, "generate");

        const harness = new SimpleHarness(provider, [], "test-harness");

        const result = await harness.run(role, {
            id: "analyze-task",
            instruction: "Analyze this task",
        });

        expect(generateSpy).toHaveBeenCalledWith({
            prompt: result.prompt,
        });
        expect(result.output).toBe("Harness response");
    });
    it("passes the scenario output schema to the provider", async () => {
        const provider = new FakeProvider("Structured response");
        const generateSpy = vi.spyOn(provider, "generate");
        const outputSchema = z.object({
            answer: z.string(),
        });

        const harness = new SimpleHarness(
            provider,
            [],
            "test-harness",
            "test-scenario",
            outputSchema,
        );

        const result = await harness.run(role, {
            id: "structured-task",
            instruction: "Return a structured answer.",
        });

        expect(generateSpy).toHaveBeenCalledWith({
            prompt: result.prompt,
            outputSchema,
        });
    });
    it("preserves raw and parsed provider evidence", async () => {
        const provider = new FakeProvider("Unused response");
    
        vi.spyOn(provider, "generate").mockResolvedValue({
          rawOutput: '{"answer":"Structured response"}',
          parsedOutput: {
            answer: "Structured response",
          },
          refusal: null,
        });
    
        const harness = new SimpleHarness(
          provider,
          [],
          "test-harness",
          "test-scenario",
        );
    
        const result = await harness.run(role, {
          id: "structured-task",
          instruction: "Return a structured answer.",
        });
    
        expect(result.output).toBe('{"answer":"Structured response"}');
        expect(result.parsedOutput).toEqual({
          answer: "Structured response",
        });
        expect(result.refusal).toBeNull();
      });
});
