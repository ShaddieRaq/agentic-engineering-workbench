import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "../src/orchestration/mapWithConcurrency.js";

function createDeferred() {
  let resolve!: () => void;

  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });

  return { promise, resolve };
}

describe("mapWithConcurrency", () => {
  it("limits active work while preserving input order", async () => {
    const starts = [createDeferred(), createDeferred(), createDeferred()];
    const releases = [createDeferred(), createDeferred(), createDeferred()];
    const completionOrder: number[] = [];

    const resultPromise = mapWithConcurrency(
      [1, 2, 3],
      2,
      async (value) => {
        starts[value - 1]!.resolve();
        await releases[value - 1]!.promise;
        completionOrder.push(value);

        return value * 10;
      },
    );

    await Promise.all([starts[0]!.promise, starts[1]!.promise]);

    releases[1]!.resolve();
    await starts[2]!.promise;

    releases[2]!.resolve();
    releases[0]!.resolve();

    const results = await resultPromise;

    expect(completionOrder).toEqual([2, 3, 1]);
    expect(results).toEqual([10, 20, 30]);
  });
});