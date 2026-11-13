// Teaching review of U08–U11, A1 and U09.CP–U11.CP (Wave 5 adversarial review): regression checks for what a
// learner can type that the lessons themselves teach as right. Swing has two spellings unlocked together in
// Shuffle, `.swingBy(1/3, 4)` and its short form `.swing(4)`, so no graded step may demand one name only; and
// every hint that places a scale degree by its half-step neighbour says what the key really has.
import { describe, expect, test } from "bun:test";
import { type Exercise, flattenExercise } from "@oak/content-kit";
import { pcOf, scalePcs } from "@oak/theory";
import { loadCheckpointFiles, loadLessons } from "../lib/load.bun.ts";

const W5 = /^(U08|U09|U10|U11|A1)\./;
const W5_CP = /^U(09|10|11)\.CP$/;

const { lessons } = await loadLessons();
const { defs: checkpoints } = await loadCheckpointFiles();

/** Every exercise of the Wave 5 lessons and checkpoints, flattened, with where it lives. */
const exercises: { where: string; ex: Exercise }[] = [
  ...lessons
    .filter((l) => W5.test(l.def.id))
    .flatMap((l) =>
      l.def.steps.flatMap((s) =>
        s.exercise ? flattenExercise(s.exercise).map((ex) => ({ where: `${l.def.id} ${s.id}`, ex })) : [],
      ),
    ),
  ...checkpoints
    .filter((c) => W5_CP.test(c.id))
    .flatMap((c) =>
      [...c.authored, c.make].flatMap((e) => flattenExercise(e).map((ex) => ({ where: c.id, ex }))),
    ),
];

describe("U08–U11 teaching", () => {
  test("a step that requires the swing call accepts both spellings, .swingBy() and .swing()", () => {
    const narrow: string[] = [];
    for (const { where, ex } of exercises)
      for (const c of "constraints" in ex ? (ex.constraints ?? []) : []) {
        if (c.c !== "must-use") continue;
        const tools = Array.isArray(c.tool) ? c.tool : [c.tool];
        if (tools.includes("tb.swingBy") !== tools.includes("tb.swing")) narrow.push(`${where}/${ex.id}`);
      }
    expect(narrow).toEqual([]);
  });

  test("G major pentatonic's hint places the two left-out degrees where G major has them", () => {
    const g = scalePcs({ tonic: "G", mode: "major" });
    // Degree 7 is F♯, the one black key; degree 4 is C, a half step above degree 3 (B), not below degree 5.
    expect(g[6]).toBe(pcOf("F#"));
    const step = (from: number, to: number) => ((g[to] ?? 0) - (g[from] ?? 0) + 12) % 12;
    expect(step(2, 3)).toBe(1);
    expect(step(3, 4)).toBe(2);
    const l01 = lessons.find((l) => l.def.id === "U11.L01")?.def;
    const s6 = l01?.steps.find((s) => s.id === "S6")?.exercise;
    const hints = (s6?.hints ?? []).map((h) => (typeof h === "string" ? h : h.text)).join(" ");
    expect(hints).toContain("Degree 4 is C, the white key a half step above degree 3, B.");
    expect(hints).not.toContain("half step below degree 5");
  });
});
