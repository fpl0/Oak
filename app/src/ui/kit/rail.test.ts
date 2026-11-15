// The step rail's position text and words (docs/design/retry.md §6.1): what onboarding's header says.
import { describe, expect, test } from "bun:test";
import { type RailStep, railPositionText } from "./basics.tsx";

const steps = (current: number, sub?: string): RailStep[] =>
  ["Welcome", "Your first loop", "Microphone", "Done for today"].map((label, i) => ({
    id: String(i),
    label,
    state: i < current ? (i === 1 ? "skipped" : "done") : i === current ? "current" : "todo",
    ...(i === current && sub ? { sub } : {}),
  }));

describe("railPositionText", () => {
  test("names the current step, its number and the total", () => {
    expect(railPositionText(steps(0))).toBe("Step 1 of 4 · Welcome");
    expect(railPositionText(steps(2, "2 of 3: a quiet moment"))).toBe(
      "Step 3 of 4 · Microphone · 2 of 3: a quiet moment",
    );
  });

  test("says nothing when no step is current", () => {
    expect(railPositionText(steps(9))).toBeNull();
  });
});
