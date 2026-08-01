import { describe, expect, it } from "vitest";
import { parseRepetitionOptions } from "../src/orchestration/repetitionPolicy.js";

describe("parseRepetitionOptions", () => {
  it("defaults to one repetition", () => {
    expect(parseRepetitionOptions({})).toEqual({
      repetitions: 1,
    });
  });

  it("accepts a positive integer", () => {
    expect(
      parseRepetitionOptions({
        repetitions: 3,
      }),
    ).toEqual({
      repetitions: 3,
    });
  });

  it.each([0, -1, 1.5])(
    "rejects invalid repetition count %s",
    (repetitions) => {
      expect(() =>
        parseRepetitionOptions({ repetitions }),
      ).toThrow();
    },
  );
});
