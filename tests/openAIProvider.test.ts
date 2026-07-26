import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { OpenAIProvider } from "../src/providers/openaiProvider.js";
import type OpenAI from "openai";
describe("OpenAIProvider", () => {
  it("returns raw and parsed structured output", async () => {
    const parse = vi.fn().mockResolvedValue({
      output_text: '{"answer":"Structured response"}',
      output_parsed: {
        answer: "Structured response",
      },
      output: [],
    });

    const client = {
      responses: {
        parse,
      },
    } as unknown as OpenAI;

    const provider = new OpenAIProvider("test-api-key", client);
    const outputSchema = z.object({
      answer: z.string(),
    });

    const result = await provider.generate({
      prompt: "Return a structured response.",
      outputSchema,
    });

    expect(parse).toHaveBeenCalledOnce();
    expect(parse.mock.calls[0]?.[0]).toMatchObject({
      model: "gpt-5.4",
      input: "Return a structured response.",
      text: {
        format: {
          type: "json_schema",
          name: "agent_response",
          strict: true,
        },
      },
    });
    expect(result).toEqual({
      rawOutput: '{"answer":"Structured response"}',
      parsedOutput: {
        answer: "Structured response",
      },
      refusal: null,
    });
  });
  it("preserves a structured-output refusal", async () => {
    const parse = vi.fn().mockResolvedValue({
      output_text: "",
      output_parsed: null,
      output: [
        {
          type: "message",
          content: [
            {
              type: "refusal",
              refusal: "I cannot provide that response.",
            },
          ],
        },
      ],
    });

    const client = {
      responses: {
        parse,
      },
    } as unknown as OpenAI;

    const provider = new OpenAIProvider("test-api-key", client);

    const result = await provider.generate({
      prompt: "Return a structured response.",
      outputSchema: z.object({
        answer: z.string(),
      }),
    });

    expect(result).toEqual({
      rawOutput: "",
      parsedOutput: null,
      refusal: "I cannot provide that response.",
    });
  });
  it("returns a plain-text provider result", async () => {
    const create = vi.fn().mockResolvedValue({
      output_text: "Plain response",
    });

    const client = {
      responses: {
        create,
      },
    } as unknown as OpenAI;

    const provider = new OpenAIProvider("test-api-key", client);

    const result = await provider.generate({
      prompt: "Return a plain response.",
    });

    expect(create).toHaveBeenCalledWith({
      model: "gpt-5.4",
      input: "Return a plain response.",
    });
    expect(result).toEqual({
      rawOutput: "Plain response",
      parsedOutput: null,
      refusal: null,
    });
  });
});