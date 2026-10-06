import { describe, expect, it } from "vitest";
import { runWithConcurrencyLimit } from "./concurrency-limit";

describe("runWithConcurrencyLimit", () => {
  it("never runs more than `limit` tasks at once", async () => {
    let active = 0;
    let maxActive = 0;
    const tasks = Array.from({ length: 10 }, () => async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return "done";
    });

    await runWithConcurrencyLimit(tasks, 3);

    expect(maxActive).toBe(3);
  });

  it("returns results in the same order as the input, regardless of finish order", async () => {
    const delays = [30, 10, 20, 5, 25];
    const tasks = delays.map((ms, i) => async () => {
      await new Promise((r) => setTimeout(r, ms));
      return i;
    });

    const results = await runWithConcurrencyLimit(tasks, 2);

    expect(results).toEqual([0, 1, 2, 3, 4]);
  });

  it("behaves like Promise.all when limit >= task count", async () => {
    const tasks = [1, 2, 3].map((n) => async () => n * 10);
    expect(await runWithConcurrencyLimit(tasks, 10)).toEqual([10, 20, 30]);
  });

  it("rejects with the first error, same as Promise.all", async () => {
    const tasks = [
      async () => 1,
      async () => {
        throw new Error("task B failed");
      },
      async () => 3,
    ];

    await expect(runWithConcurrencyLimit(tasks, 2)).rejects.toThrow(
      "task B failed",
    );
  });

  it("stops starting new tasks after an error, but doesn't touch ones already running", async () => {
    const started: number[] = [];
    const tasks = Array.from({ length: 6 }, (_, i) => async () => {
      started.push(i);
      if (i === 0) throw new Error("boom");
      await new Promise((r) => setTimeout(r, 10));
      return i;
    });

    await expect(runWithConcurrencyLimit(tasks, 2)).rejects.toThrow("boom");
    // Exactly 2 workers, so at most 2 tasks ever start before the error at
    // index 0 is seen and no further ones are picked up.
    expect(started.length).toBeLessThanOrEqual(2);
  });

  it("handles an empty task list", async () => {
    expect(await runWithConcurrencyLimit([], 3)).toEqual([]);
  });

  it("rejects a non-positive or non-integer limit", async () => {
    await expect(runWithConcurrencyLimit([async () => 1], 0)).rejects.toThrow(
      RangeError,
    );
    await expect(runWithConcurrencyLimit([async () => 1], -1)).rejects.toThrow(
      RangeError,
    );
    await expect(runWithConcurrencyLimit([async () => 1], 1.5)).rejects.toThrow(
      RangeError,
    );
  });
});
