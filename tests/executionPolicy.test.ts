import { describe, expect, it } from "vitest";
import { parseExecutionOptions } from "../src/orchestration/executionPolicy.js";

describe("parseExecutionOptions", () => {
  it("defaults to one sequential execution", () => {
    expect(parseExecutionOptions()).toEqual({
      repetitions: 1,
      concurrency: 1,
    });
  });

  it("accepts repetition and concurrency limits", () => {
    expect(
      parseExecutionOptions({
        repetitions: 3,
        concurrency: 2,
      }),
    ).toEqual({
      repetitions: 3,
      concurrency: 2,
    });
  });

  it.each([0, -1, 1.5])(
    "rejects invalid concurrency %s",
    (concurrency) => {
      expect(() =>
        parseExecutionOptions({ concurrency }),
      ).toThrow();
    },
  );
  it.each([0, -1, 1.5])(
    "rejects invalid repetition count %s",
    (repetitions) => {
      expect(() =>
        parseExecutionOptions({ repetitions }),
      ).toThrow();
    },
  );
});