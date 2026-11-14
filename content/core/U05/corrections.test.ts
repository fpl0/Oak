// Corrections pass (before the learner starts the course): the U05 findings of the outside review (theory-c A3,
// A4, A5, B), each pinned on the SHIPPED step it was found in and graded as content CI grades it, and each musical
// claim the fix makes checked by evaluating Strudel headless. (The authored variants in each lesson.ts pin pass
// and fail; this file pins the words and the claims.)
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { readFileSync } from "node:fs";
import type { Exercise, LessonDef, SessionId } from "@oak/content-kit";
import { evaluate, grade } from "../../validate/harness.ts";
import checkpoint from "./CP/checkpoint.ts";
import L04 from "./L04/lesson.ts";
import L07 from "./L07/lesson.ts";
import L08 from "./L08/lesson.ts";

setDefaultTimeout(120_000);

const T = (bpm: number) => `setcpm(${bpm}/4)\n\n`;
const step = (lesson: LessonDef, id: string): Exercise => {
  const ex = lesson.steps.find((s) => s.id === id)?.exercise;
  if (!ex) throw new Error(`${lesson.id} ${id}: no exercise`);
  return ex as Exercise;
};
const run = (ex: Exercise, lesson: Pick<LessonDef, "id" | "key" | "meter" | "bpm">, code: string) =>
  grade(ex, { name: "probe", response: { code }, expect: "pass" }, lesson, lesson.id as SessionId);
const said = (r: { messages?: string[] }) => (r.messages ?? []).join("\n");
const prose = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("U05.L04: `.arp()` positions follow the written order of the stack (theory-c A3)", () => {
  test('`n("[4,0,2]").arp("0 1 2")` plays G, C, E: position 0 is the note written first', async () => {
    const r = await evaluate(`${T(92)}chords: n("[4,0,2]").arp("0 1 2").scale("C4:major").s("piano")`, 1);
    expect(r.events.map((e) => e.midi)).toEqual([67, 60, 64]);
  });
  test("the lesson no longer says the positions count from the lowest note in general", () => {
    const text = `${prose("./L04/lesson.mdx")}\n${JSON.stringify(L04)}`;
    expect(text).not.toContain("they point into the stack, lowest note first");
    expect(text).not.toContain("counting from the lowest as 0");
    expect(text).toContain("in the order its notes are written");
  });
});

describe("U05.L07 S5 and U05.L08 S1, the voicing gate: the loop's last chord leads back to its first (theory-c A4)", () => {
  const roots = (r: string) => `bass: note("${r}").s("ebass").lpf(800)`;
  const chords = (p: string) => `chords: note("${p}").s("piano")`;
  test("U05.L07: smooth inside, but E G C back to C E G moves every voice 3 to 5 half steps: fail, at bar 5", async () => {
    const code = `${T(80)}${roots("<c2 f2 g2 c2>")}\n${chords("<[c4,e4,g4] [c4,f4,a4] [d4,g4,b4] [e4,g4,c5]>")}`;
    const r = await run(step(L07, "S5"), L07, code);
    expect(r.passed).toBe(false);
    expect(said(r)).toContain("Bar 5: E4 leaps 4 half steps to C4.");
  });
  test("U05.L07: smooth paths that close the loop pass, the reviewer's own among them", async () => {
    for (const p of [
      "<[c4,e4,g4] [c4,f4,a4] [b3,d4,g4] [c4,e4,g4]>",
      "<[e4,g4,c5] [f4,a4,c5] [d4,g4,b4] [e4,g4,c5]>",
      "<[g3,c4,e4] [a3,c4,f4] [g3,b3,d4] [g3,c4,e4]>",
    ])
      expect(
        (await run(step(L07, "S5"), L07, `${T(80)}${roots("<c2 f2 g2 c2>")}\n${chords(p)}`)).passed,
      ).toBe(true);
  });
  test("U05.L08: the transposed twin in G fails the same way", async () => {
    const code = `${T(92)}${roots("<g2 c2 d2 g2>")}\n${chords("<[g3,b3,d4] [g3,c4,e4] [a3,d4,f#4] [b3,d4,g4]>")}`;
    const r = await run(step(L08, "S1"), L08, code);
    expect(r.passed).toBe(false);
    expect(said(r)).toContain("Bar 5: B3 leaps 4 half steps to G3.");
  });
  test("U05.CP voice-the-loop: G back to the first C is a change too", async () => {
    const ex = checkpoint.authored.find((e) => e.id === "voice-the-loop") as Exercise;
    const ctx = {
      id: "U05.CP",
      key: { tonic: "C", mode: "major" },
      meter: "4/4",
      bpm: 80,
    } as unknown as LessonDef;
    const loop = (p: string) => `${T(80)}${roots("<c2 a1 f2 g2>")}\n${chords(p)}`;
    expect((await run(ex, ctx, loop("<[c4,e4,g4] [c4,e4,a4] [c4,f4,a4] [d4,g4,b4]>"))).passed).toBe(false);
    expect((await run(ex, ctx, loop("<[g3,c4,e4] [a3,c4,e4] [a3,c4,f4] [g3,b3,d4]>"))).passed).toBe(true);
  });
});

describe("U05.L07: voice leading is not defined as 'the nearest note' (theory-c B)", () => {
  test("the reference itself moves F4 three half steps to D4 while G4 is two away", async () => {
    const r = await evaluate(`${T(80)}chords: note("<[c4,f4,a4] [b3,d4,g4]>").s("piano")`, 2);
    const bar = (b: number) => r.events.filter((e) => Math.floor(e.onset) === b).map((e) => e.midi as number);
    expect(bar(0)).toEqual([60, 65, 69]);
    expect(bar(1)).toEqual([59, 62, 67]);
  });
  test("the definition in the lesson names how the voices move, not the nearest note", () => {
    const text = `${prose("./L07/lesson.mdx")}\n${L07.objective}`;
    expect(text).not.toContain(
      "Moving each note of a chord to the nearest note of the next is **voice leading**",
    );
    expect(text).toContain("the way each voice moves from one chord to the next is **voice leading**");
  });
});

describe("U05.L08 S6 'Lift them': an anchor below Strudel's own lowers the chords (theory-c A5)", () => {
  const ex = step(L08, "S6");
  const line = (anchor: string) =>
    `${T(92)}bass: note("<c2 f2 g2 c2>").s("ebass").lpf(800)\nchords: chord("<C F G C>")${anchor}.voicing().s("rhodes")`;
  test("the musical claim: g3 places every chord lower than no anchor, c5 changes nothing, g5 lifts every chord", async () => {
    const tops = async (anchor: string) => {
      const r = await evaluate(`${T(92)}chords: chord("<C F G C>")${anchor}.voicing().s("piano")`, 4);
      return [0, 1, 2, 3].map((b) =>
        Math.max(...r.events.filter((e) => Math.floor(e.onset) === b).map((e) => e.midi as number)),
      );
    };
    const plain = await tops("");
    const low = await tops('.anchor("g3")');
    const high = await tops('.anchor("g5")');
    expect(await tops('.anchor("c5")')).toEqual(plain);
    for (let b = 0; b < 4; b++) {
      expect(low[b] as number).toBeLessThan(plain[b] as number);
      expect(high[b] as number).toBeGreaterThan(plain[b] as number);
    }
  });
  test('the reviewer\'s `.anchor("g3")`, and C5 itself, fail and say why', async () => {
    for (const a of ['.anchor("g3")', '.anchor("c5")']) {
      const r = await run(ex, L08, line(a));
      expect(r.passed).toBe(false);
      expect(said(r)).toContain("does not lift the chords. With no anchor, Strudel anchors them at C5");
    }
  });
  test("anchors above C5 pass, as names in either case or as MIDI numbers", async () => {
    for (const a of ['.anchor("g5")', '.anchor("e5")', '.anchor("c6")', '.anchor("G5")', ".anchor(76)"])
      expect((await run(ex, L08, line(a))).passed).toBe(true);
  });
});
