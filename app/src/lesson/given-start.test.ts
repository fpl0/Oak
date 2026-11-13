// The lesson host's starting value for a Wave 5 chart (review:journey): a bar grid starts from its given bars,
// filled with the exercise's own chords, so the given box shows its chord and the answer sent carries it.
import { describe, expect, test } from "bun:test";
import u11cp from "../../../content/core/U11/CP/checkpoint.ts";
import { answerSpecOf, givenStart } from "./model.ts";

type Item = { id: string; answer?: { ui?: string }; correct?: { rn?: string[] } };

describe("a bar grid's given bars (U11.CP chart-the-blues)", () => {
  const items = (u11cp as unknown as { authored: Item[] }).authored;
  const chart = items.find((i) => i.id === "chart-the-blues") as Item;
  test("the grid starts with bar 1 filled (I7) and the rest empty", () => {
    expect(chart.answer?.ui).toBe("bar-grid");
    const v = givenStart(chart as never, answerSpecOf(chart as never)) as string[];
    expect(v).toHaveLength(12);
    expect(v[0]).toBe("I7");
    expect(v.slice(1).every((x) => x === "")).toBe(true);
  });
});
