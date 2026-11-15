import { describe, expect, test } from "bun:test";
import { rhythmItem } from "./gym-items.ts";
import { checkRhythmLab, checkRhythmTask, stepName } from "./rhythm-lab.ts";

const clave = rhythmItem("clave-son");
const [identify, grid] = clave.tasks as [
  Extract<(typeof clave.tasks)[number], { kind: "identify" }>,
  Extract<(typeof clave.tasks)[number], { kind: "dictate" }>,
];

describe("the rhythm lab's checks", () => {
  test("the right answers pass; the grid's answer in any order passes", () => {
    const c = checkRhythmLab(clave.tasks, {
      [identify.id]: identify.answer,
      [grid.id]: [...grid.answer].reverse(),
    });
    expect(c.passed).toBe(true);
    expect(c.summary).toBe("2 of 2 right.");
  });

  test("the same clave facing the other way (the right figure, wrong direction) fails both tasks", () => {
    // Son 3-2 is the son clave's strokes with its bars swapped: the right function, the wrong result.
    const swapped = grid.answer.map((s) => (s + 8) % 16).sort((a, b) => a - b);
    const c = checkRhythmLab(clave.tasks, { [identify.id]: "son 3-2", [grid.id]: swapped });
    expect(c.passed).toBe(false);
    expect(c.results[0]?.text).toBe("Not that one. Loop two bars and listen again, counting along.");
    expect(c.results[1]?.bars).toEqual([false, false]);
    expect(c.results[1]?.text).toBe(
      "Bar 1: 3 hits where nothing sounds, 2 hits missing. Bar 2: 2 hits where nothing sounds, 3 hits missing.",
    );
  });

  test("feedback counts, never places: one hit late in bar 2", () => {
    const late = grid.answer.map((s, i) => (i === grid.answer.length - 1 ? s + 1 : s));
    const r = checkRhythmTask(grid, late);
    expect(r.ok).toBe(false);
    expect(r.bars).toEqual([true, false]);
    expect(r.text).toBe("Bar 2: 1 hit where nothing sounds, 1 hit missing.");
    expect(r.text).not.toMatch(/eighth|step \d/);
  });

  test("nothing chosen or written says so", () => {
    expect(checkRhythmTask(identify, null).text).toBe("Choose an answer first.");
    expect(checkRhythmTask(grid, []).text).toBe("Nothing written on the grid yet.");
  });

  test("a one-bar grid names no bar; steps are named for screen readers", () => {
    const tres = rhythmItem("tresillo").tasks[1] as typeof grid;
    expect(checkRhythmTask(tres, [0, 3]).text).toBe("1 hit missing.");
    expect(stepName(grid, 11)).toBe("bar 2, eighth 4");
    expect(stepName(tres, 3)).toBe("eighth 4");
  });
});
