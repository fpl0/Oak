// Wave 6 in the Workbench, against real Strudel (the grader realm in-process): sevenths, applied and borrowed
// chords on the chord band at each depth, guide tones and their lines, the key ribbon and numerals after a key
// change, the mode's colour note, the beat grid in 6/8 and with triplets, pushes and ghost notes, chromatic
// degrees before and after U15.L01, the key panel's modes, borrowed chords and the lift by a step, and the three
// carry-overs (d3 staff paging and ribbon reach, d15 through the Workbench's props is in the browser suite).
// Musical facts are cross-checked with headless Strudel or @oak/theory.
import { beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { evaluateForGrading, initRealm } from "@oak/grader";
import { evalHeadless, midisOf } from "@oak/grader/testing";
import { stepSection } from "../lib/form-view.ts";
import { FULL_HARMONY_DEPTH, type HarmonyDepth, harmonyDepth } from "../lib/harmony-lens.ts";
import {
  bandChords,
  guideLineText,
  keyChangeText,
  keyOfRibbon,
  keyPlanBars,
  rollBeatGrid,
} from "./colour.ts";
import { applyDepth, labelAt } from "./depth.ts";
import { lending, liftCode, liftProblem, modeRows, modeSentence, plainScaleCalls } from "./key-extras.ts";
import { buildModel, type ModelOptions, type WorkbenchModel } from "./model.ts";
import { rowLabel } from "./music.ts";
import { loudnessOf } from "./PianoRoll.tsx";
import { pageOfBar } from "./StaffView.tsx";
import { WORKBENCH_LENS_SHORTCUTS } from "./shortcuts.ts";

setDefaultTimeout(30_000);

beforeAll(async () => {
  await initRealm({ toolbox: [], lockdown: false });
});

async function model(code: string, bars: number, opts: Partial<ModelOptions> = {}): Promise<WorkbenchModel> {
  const meter = (opts.meter as string | undefined) ?? "4/4";
  const result = await evaluateForGrading(code, {
    mode: "lesson",
    bars,
    lint: null,
    ...(meter !== "4/4" ? { meter: meter as "6/8" } : {}),
  });
  const out = buildModel(code, result, { meter: "4/4", key: null, staff: "auto", ...opts });
  if (!out.ok) throw new Error(`${out.error.kind}: ${out.error.message}`);
  return out.model;
}

const CLOSED: HarmonyDepth = { sevenths: false, applied: false, borrowed: false, chromatic: false };
const depthOf = (d: Partial<HarmonyDepth>): HarmonyDepth => ({ ...CLOSED, ...d });
const band = (m: WorkbenchModel, d: HarmonyDepth) =>
  bandChords(m.harmony?.regions ?? [], m.colour?.regions ?? [], d);

const II_V_I = `setcpm(90/4)
chords: chord("<Dm7 G7 C^7 C^7>").voicing().s("piano")`;

describe("sevenths on the chord band, as deep as the learner has been taught", () => {
  test("open: Dm7 G7 Cmaj7 with their numerals; closed: the triads, never a wrong name", async () => {
    const m = await model(II_V_I, 4);
    expect(m.colour?.harmony?.chords.map((c) => c.seventh)).toEqual(["m7", "7", "maj7"]);
    const open = band(m, FULL_HARMONY_DEPTH);
    expect(open.map((b) => b.symbol.replace(/\/.*$/, ""))).toEqual(["Dm7", "G7", "Cmaj7"]);
    expect(open.every((b) => !b.reduced)).toBe(true);
    const closed = band(m, CLOSED);
    expect(closed.map((b) => b.symbol.replace(/\/.*$/, ""))).toEqual(["Dm", "G", "C"]);
    expect(closed.map((b) => (b.rn ?? "").replace(/[0-9]+$/, ""))).toEqual(["ii", "V", "I"]);
    expect(closed.every((b) => b.reduced)).toBe(true);
    // The staff's labels and the chart read the same text as the band.
    const shown = applyDepth(m, CLOSED);
    expect(shown.harmony?.regions.map((r) => r.symbol)).toEqual(closed.map((b) => b.symbol));
    expect(shown.harmony?.labels.map((l) => l.symbol)).toEqual(closed.map((b) => b.symbol));
    expect(applyDepth(m, FULL_HARMONY_DEPTH).harmony?.regions).toBe(m.harmony?.regions);
  });

  test("the gate: chord.dom7 or chord.seventh opens sevenths; lessons open applied and borrowed numerals", () => {
    expect(harmonyDepth(new Set(), new Set())).toEqual(CLOSED);
    expect(harmonyDepth(new Set(["chord.dom7"]), new Set()).sevenths).toBe(true);
    expect(harmonyDepth(new Set(["chord.seventh"]), new Set(["U15.L02"]))).toEqual(
      depthOf({ sevenths: true, applied: true }),
    );
    expect(harmonyDepth(new Set(["tb.n.chromatic"]), new Set(["U16.L01"]))).toEqual(
      depthOf({ borrowed: true, chromatic: true }),
    );
  });
});

const APPLIED = `setcpm(90/4)
chords: chord("<C D7 G7 C>").voicing().s("piano")`;
const BORROWED = `setcpm(90/4)
chords: chord("<C Fm C Ab Bb C>").voicing().s("piano")`;

describe("applied and borrowed chords", () => {
  test("V7/V carries an arrow to V once U15.L02 is done; before it, the symbol stands alone", async () => {
    const m = await model(APPLIED, 4);
    const d7 = (d: HarmonyDepth) => band(m, d)[1];
    const open = d7(depthOf({ sevenths: true, applied: true }));
    expect(open?.kind).toBe("applied");
    expect(open?.rn).toMatch(/^V.*\/V$/);
    expect(open?.arrow).toEqual({ target: "V", resolves: true });
    const before = d7(depthOf({ sevenths: true }));
    expect(before?.symbol.startsWith("D7")).toBe(true);
    expect(before?.rn).toBeNull();
    expect(before?.arrow).toBeNull();
    expect(before?.reduced).toBe(true);
    // The staff's label loses the numeral too.
    expect(applyDepth(m, depthOf({ sevenths: true })).harmony?.labels[1]?.rn).toBeNull();
  });

  test("an applied chord that does not resolve says so", async () => {
    const m = await model(`setcpm(90/4)\nchords: chord("<C D7 F C>").voicing().s("piano")`, 4);
    const b = band(m, FULL_HARMONY_DEPTH)[1];
    expect(b?.arrow?.target).toBe("V");
    expect(b?.arrow?.resolves).toBe(false);
  });

  test("iv, ♭VI and ♭VII are marked as borrowed from C minor once U16.L01 is done", async () => {
    const m = await model(BORROWED, 6);
    const open = band(m, FULL_HARMONY_DEPTH);
    expect(open.map((b) => b.rn)).toEqual(
      ["I", "iv", "I", "♭VI", "♭VII", "I"].map((x) => expect.stringContaining(x)),
    );
    expect(open.map((b) => b.borrowed)).toEqual([
      null,
      "borrowed from C minor",
      null,
      "borrowed from C minor",
      "borrowed from C minor",
      null,
    ]);
    const before = band(m, depthOf({ sevenths: true, applied: true }));
    expect(before.map((b) => b.rn === null)).toEqual([false, true, false, true, true, false]);
    expect(before.map((b) => b.symbol.replace(/\/.*$/, ""))).toEqual(["C", "Fm", "C", "A♭", "B♭", "C"]);
    expect(before.every((b) => b.borrowed === null)).toBe(true);
  });
});

describe("guide tones", () => {
  test("Dm7 G7 Cmaj7: the lines F F E and C B B, placed on notes the voicing plays", async () => {
    const m = await model(II_V_I, 4);
    const g = m.colour?.guide;
    expect(g?.lines.map(guideLineText)).toEqual(["F → F → E", "C → B → B"]);
    for (const line of g?.lines ?? [])
      for (const p of line) {
        expect(p.eventId).not.toBeNull();
        const e = m.byId.get(p.eventId as string);
        expect((e?.midi as number) % 12 === p.midi % 12).toBe(true);
      }
    // Every mark is the 3rd or the 7th of its chord, by pitch class (F and C of Dm7, B and F of G7, E and B of C).
    const marks = [...(g?.marks ?? [])].map(([id, mk]) => ({
      pc: (m.byId.get(id)?.midi as number) % 12,
      bar: m.byId.get(id)?.bar,
      tag: mk.tag,
    }));
    const at = (bar: number, tag: string) => [
      ...new Set(marks.filter((x) => x.bar === bar && x.tag === tag).map((x) => x.pc)),
    ];
    expect(at(1, "3")).toEqual([5]);
    expect(at(1, "7")).toEqual([0]);
    expect(at(2, "3")).toEqual([11]);
    expect(at(2, "7")).toEqual([5]);
    expect(at(3, "3")).toEqual([4]);
    expect(at(3, "7")).toEqual([11]);
    // What Strudel plays in bar 1 really holds F and C.
    const heard = (await midisOf(II_V_I, 1)).map((x) => (x as number) % 12);
    expect(heard).toContain(5);
    expect(heard).toContain(0);
  });

  test("triads have one line (their 3rds); a piece without chords has none", async () => {
    const tri = await model(`setcpm(90/4)\nchords: chord("<C F G C>").voicing().s("piano")`, 4);
    expect(tri.colour?.guide.lines.map(guideLineText)).toEqual(["E → A → B → E"]);
    const mel = await model(`setcpm(90/4)\nmel: n("0 2 4 2").scale("C4:major").s("piano")`, 1);
    expect(mel.colour?.guide.lines).toEqual([]);
    expect(mel.colour?.guide.marks.size).toBe(0);
  });
});

const LIFT = `setcpm(100/4)
mel: n("<[0 2 4 2] [3 2 1 0]>").scale("<C4:major!2 D4:major!2>").s("piano")
chords: chord("<C G D A>").voicing().s("piano")`;

describe("the key plan: the ribbon, and numerals read in the key in force", () => {
  test("C major, then D major from bar 3: +2, up a step; I V I V, never V/V after the lift", async () => {
    const m = await model(LIFT, 4);
    const keys = m.colour?.keys ?? [];
    expect(keys.map((k) => [k.from, k.to, k.text])).toEqual([
      [0, 2, "C major"],
      [2, 4, "D major"],
    ]);
    expect(keys[1]?.change?.text).toBe("+2: up a step");
    expect(keys[0]?.change).toBeNull();
    expect(keyOfRibbon(keys, 3)?.tonic).toBe("D");
    expect(m.harmony?.regions.map((r) => (r.rn ?? "").replace(/[0-9]+$/, ""))).toEqual(["I", "V", "I", "V"]);
    expect(m.harmony?.regions.map((r) => r.fn)).toEqual(["T", "D", "T", "D"]);
    // The lifted bars sound a whole step higher (headless Strudel).
    const heard = await evalHeadless(LIFT, 4);
    const tune = (bar: number) =>
      heard.events.filter((e) => e.track === "mel" && Math.floor(e.onset) === bar).map((e) => e.midi);
    expect(tune(2)).toEqual(tune(0).map((x) => (x as number) + 2));
    // Each note's degree is read in its own key: the first note of bar 3 is 1 (D), not 2.
    const first = m.events.find((e) => e.track === "mel" && e.bar === 3);
    expect(first?.label?.degree?.label).toBe("1");
    expect(first?.label?.display).toBe("D4");
    // A chord line has no .scale() of its own: it follows the plan. The A chord's C♯ in bar 4 is 7 (ti) in D.
    const cs = m.events.find((e) => e.track === "chords" && e.bar === 4 && (e.midi as number) % 12 === 1);
    expect(cs?.label?.degree).toMatchObject({ label: "7", syllable: "ti", inKey: true });
    const e1 = m.events.find((e) => e.track === "chords" && e.bar === 1 && (e.midi as number) % 12 === 4);
    expect(e1?.label?.degree?.label).toBe("3");
    // The blue-note lens reads the key in force too: the tune's F♯ in bar 3 is 3 of D, not a blue ♭5 of C.
    const fs = m.events.find((e) => e.track === "mel" && e.bar === 3 && (e.midi as number) % 12 === 6);
    expect(fs?.label?.degree?.label).toBe("3");
    expect(m.lines?.blue.has(fs?.id as string)).toBe(false);
  });

  test("a piece in one key has one span (the ribbon draws nothing)", async () => {
    const m = await model(II_V_I, 4);
    expect(m.colour?.keys.length).toBe(1);
  });

  test("a key plan is read whole: its bars, when it changes key", () => {
    expect(keyPlanBars(LIFT)).toBe(4);
    expect(keyPlanBars('mel: n("0").scale("<C4:major!16 D4:major!8>")')).toBe(24);
    // Two keys a bar each (U03.L05) is a two-bar plan; one key, or no pattern, is none.
    expect(keyPlanBars('mel: n("0 2").scale("<C4:major G4:major>")')).toBe(2);
    expect(keyPlanBars('mel: n("0").scale("<C4:major!4>")')).toBe(0);
    expect(keyPlanBars('mel: n("0").scale("C4:major")')).toBe(0);
    expect(keyPlanBars('mel: note("c4")')).toBe(0);
  });

  test("the change in words", () => {
    expect(keyChangeText({ semitones: 1, relation: "up-half" })).toBe("+1: up a half step");
    expect(keyChangeText({ semitones: -5, relation: "dominant" })).toBe("−5: to the key a fifth up");
    expect(keyChangeText({ semitones: 4, relation: "other" })).toBe("+4");
  });
});

describe("modes", () => {
  const MIXO = `setcpm(100/4)
mel: n("<[0 2 4 6] [6 5 4 2]>").scale("G4:mixolydian").s("piano")
chords: chord("<G F>").voicing().s("piano")`;

  test("G Mixolydian: every F of the learner's lines is the colour note ♭7 (te)", async () => {
    const m = await model(MIXO, 2);
    expect(m.key).toEqual({ tonic: "G", mode: "mixolydian" });
    const marks = m.colour?.mode ?? new Map();
    expect(marks.size).toBeGreaterThan(0);
    for (const [id, mk] of marks) {
      expect((m.byId.get(id)?.midi as number) % 12).toBe(5);
      expect(mk).toEqual({ display: "♭7", syllable: "te", name: "F", mode: "Mixolydian" });
    }
    // The tune's own F (n 6) is marked, and so are the F chord's.
    expect([...marks.keys()].some((id) => m.byId.get(id)?.track === "mel")).toBe(true);
    // ♭VII is the mode's own chord: a numeral, not "borrowed".
    const b = band(m, CLOSED);
    expect(b[1]?.rn).toBe("♭VII");
    expect(b[1]?.borrowed).toBeNull();
  });

  test("a major piece has no colour note", async () => {
    const m = await model(`setcpm(90/4)\nmel: n("0 3 6 3").scale("C4:major").s("piano")`, 1);
    expect(m.colour?.mode.size).toBe(0);
  });

  test("the key panel's modes: only the unlocked ones (and the piece's own), brightest first", () => {
    const g = { tonic: "G", mode: "mixolydian" } as const;
    expect(modeRows({ tonic: "G", mode: "major" }, new Set())).toEqual([]);
    expect(modeRows(g, new Set()).map((r) => r.name)).toEqual(["G major", "G Mixolydian"]);
    const all = modeRows(g, null);
    expect(all.map((r) => r.name)).toEqual([
      "G Lydian",
      "G major",
      "G Mixolydian",
      "G Dorian",
      "G minor",
      "G Phrygian",
    ]);
    expect(all.map((r) => `${r.colour} ${r.tone}`.trim())).toEqual([
      "♯4 C♯",
      "",
      "♭7 F",
      "♮6 E",
      "",
      "♭2 A♭",
    ]);
    expect(all.find((r) => r.here)?.mode).toBe("mixolydian");
    expect(
      modeRows({ tonic: "D", mode: "minor" }, new Set(["scale.minor", "scale.dorian"])).map((r) => r.name),
    ).toEqual(["D major", "D Dorian", "D minor"]);
    // A blues or a harmonic minor has no mode list.
    expect(modeRows({ tonic: "C", mode: "blues" }, null)).toEqual([]);
    expect(modeSentence(g)).toBe(
      "Mixolydian is major with a lowered 7: F (♭7) is its colour note. It uses the notes of C major with G as home.",
    );
    expect(modeSentence({ tonic: "D", mode: "dorian" })).toContain("minor with a raised 6: B (6)");
    expect(modeSentence({ tonic: "C", mode: "major" })).toBeNull();
  });
});

describe("rhythm II on the roll", () => {
  test("6/8: two dotted-quarter beats, each in three, counted 1 la li 2 la li", async () => {
    const code = `setcpm(60/2)\ndrums: s("bd ~ ~ sd ~ ~")\nhats: s("hh*6").gain(.5)`;
    const m = await model(code, 2, { meter: "6/8" });
    const grid = m.colour?.rhythm?.grid;
    expect(grid?.compound).toBe(true);
    expect(grid?.beats).toBe(2);
    expect(grid?.linesOf(0).map((l) => l.label)).toEqual(["1", "la", "li", "2", "la", "li"]);
    expect(grid?.linesOf(1).map((l) => [l.level, Math.round(l.at * 6)])).toEqual([
      ["beat", 0],
      ["sub", 1],
      ["sub", 2],
      ["beat", 3],
      ["sub", 4],
      ["sub", 5],
    ]);
    expect(m.colour?.rhythm?.view.bpm).toBe(60);
    // 12/8: four beats.
    expect(
      rollBeatGrid("12/8", new Set())
        ?.linesOf(0)
        .filter((l) => l.level === "beat").length,
    ).toBe(4);
  });

  test("4/4 has no extra grid; a triplet's beat is cut in three (1 trip let), the others stay in two", async () => {
    const plain = await model(`setcpm(90/4)\ndrums: s("bd ~ sd ~")\nhats: s("hh*8")`, 1);
    expect(plain.colour?.rhythm?.grid).toBeNull();
    const m = await model(`setcpm(90/4)\ndrums: s("bd ~ sd ~")\nhats: s("hh*2 [hh hh hh] hh*2 hh*2")`, 1);
    const grid = m.colour?.rhythm?.grid;
    expect(grid?.compound).toBe(false);
    expect(grid?.linesOf(0).map((l) => l.label)).toEqual(["1", "&", "2", "trip", "let", "3", "&", "4", "&"]);
    expect(
      grid
        ?.linesOf(0)
        .filter((l) => l.triplet)
        .map((l) => Math.round(l.at * 12)),
    ).toEqual([4, 5]);
    // A bar with no triplet adds nothing.
    expect(grid?.linesOf(5)).toEqual([]);
    // A shuffle is swing, not triplets: the swung hats ask for no triplet grid (contracts §6.10).
    const swung = await model(`setcpm(120/4)\ndrums: s("bd ~ sd ~")\nhats: s("hh*8").swing(4)`, 1);
    expect(swung.colour?.rhythm?.grid).toBeNull();
    const both = await model(
      `setcpm(120/4)\nhats: s("hh*8").swing(4)\nmel: n("0 [2 3 4] 2 ~").scale("C4:major").s("piano")`,
      1,
    );
    expect(both.colour?.rhythm?.grid?.linesOf(0).map((l) => l.label)).toEqual([
      "1",
      "&",
      "2",
      "trip",
      "let",
      "3",
      "&",
      "4",
      "&",
    ]);
    // .ply(3) is triplets on every beat.
    const ply = await model(`setcpm(90/4)\nhats: s("hh hh hh hh").ply(3)`, 1);
    expect(ply.colour?.rhythm?.grid?.linesOf(0).map((l) => l.label)).toEqual(
      "1 trip let 2 trip let 3 trip let 4 trip let".split(" "),
    );
  });

  test("a chord pushed with .early(1/8) is drawn against the beat it comes in ahead of", async () => {
    const code = `setcpm(96/4)\nchords: chord("<C F>").voicing().s("piano").early(1/8)\ndrums: s("bd ~ sd ~")`;
    const m = await model(code, 2);
    const pushes = m.colour?.rhythm?.pushes ?? new Map();
    expect(pushes.size).toBeGreaterThan(0);
    for (const [id, p] of pushes) {
      const e = m.byId.get(id);
      expect(e?.track).toBe("chords");
      expect(p.by).toBe(8);
      expect(p.beat - (e?.onset as number)).toBeCloseTo(1 / 8, 6);
      expect(Number.isInteger(p.beat)).toBe(true);
      expect(p.acrossBar).toBe(true);
    }
    // Headless Strudel agrees: the F chord of bar 2 starts an eighth before bar 2.
    const heard = await evalHeadless(code, 2);
    expect(heard.events.some((e) => e.track === "chords" && e.onset === 7 / 8)).toBe(true);
  });

  test("ghost notes are the quiet hits of .velocity(); loudness is drawn against the line's loudest", async () => {
    const code = `setcpm(96/4)\nhats: s("hh*16").velocity("[1 .35 .6 .35]*4")\ndrums: s("bd ~ sd ~")`;
    const m = await model(code, 1);
    const ghosts = m.colour?.rhythm?.ghosts ?? new Set();
    const hats = m.events.filter((e) => e.track === "hats");
    expect(hats.length).toBe(16);
    expect(hats.filter((e) => ghosts.has(e.id)).length).toBe(8);
    expect(hats.filter((e) => ghosts.has(e.id)).every((e) => e.gain < 0.4)).toBe(true);
    expect(m.events.filter((e) => e.track === "drums").some((e) => ghosts.has(e.id))).toBe(false);
    expect(loudnessOf(0.8, 0.8)).toBe(1);
    expect(loudnessOf(0.75, 0.8)).toBe(1);
    expect(loudnessOf(0.28, 0.8)).toBeCloseTo(0.35, 5);
    expect(loudnessOf(0.01, 0.8)).toBe(0.3);
  });
});

describe("chromatic degrees and syllables", () => {
  test("before U15.L01 ♯4 has no syllable; after it, fi; the raised 7 of a minor key keeps ti either way", async () => {
    const m = await model(`setcpm(84/4)\nmel: n("4 3# 4 6b").scale("C4:major").s("piano")`, 1);
    const fs = m.events.find((e) => e.midi === 66);
    expect(fs?.label?.degree?.label).toBe("♯4");
    expect(labelAt(fs as never, { chromatic: false })?.degree?.syllable).toBe("");
    expect(labelAt(fs as never, { chromatic: true })?.degree?.syllable).toBe("fi");
    const bb = m.events.find((e) => e.midi === 70);
    expect(labelAt(bb as never, { chromatic: false })?.degree?.syllable).toBe("te");
    // What it sounds: G F♯ G B♭.
    expect(await midisOf(`mel: n("4 3# 4 6b").scale("C4:major")`, 1)).toEqual([67, 66, 67, 70]);
    const minor = await model(`setcpm(84/4)\nmel: n("4 5 6 7").scale("A3:harmonic:minor").s("piano")`, 1);
    const gs = minor.events.find((e) => (e.midi as number) % 12 === 8);
    expect(labelAt(gs as never, { chromatic: false })?.degree?.syllable).toBe("ti");
    expect(rowLabel(66, { tonic: "C", mode: "major" }, "degree+solfege", false)).toBe("♯4");
    expect(rowLabel(66, { tonic: "C", mode: "major" }, "degree+solfege", true)).toBe("♯4 fi");
    expect(rowLabel(63, { tonic: "C", mode: "major" }, "degree+solfege", false)).toBe("♭3 me");
  });

  test("from U15.L01 the chord under a note decides: G♯ under E7 is ♯5 (si), A♭ under A♭ stays ♭6 (le)", async () => {
    const m = await model(
      `setcpm(90/4)\nchords: chord("<E7 Ab>").voicing().s("piano")\nmel: note("<g#4 ab4>").s("piano")`,
      2,
      { key: { tonic: "C", mode: "major" }, keyPrefer: "declared" },
    );
    const notes = m.events.filter((e) => e.track === "chords" && (e.midi as number) % 12 === 8);
    const underE7 = notes.find((e) => e.bar === 1);
    const underAb = notes.find((e) => e.bar === 2);
    expect(underE7?.label?.degree?.label).toBe("♭6");
    expect(labelAt(underE7 as never, { chromatic: true })?.degree).toMatchObject({
      label: "♯5",
      syllable: "si",
    });
    expect(labelAt(underE7 as never, { chromatic: true })?.display).toMatch(/^G♯/);
    expect(labelAt(underAb as never, { chromatic: true })?.degree).toMatchObject({
      label: "♭6",
      syllable: "le",
    });
    // A note the code spells itself keeps its spelling.
    const written = m.events.find((e) => e.track === "mel" && e.bar === 2);
    expect(labelAt(written as never, { chromatic: true })?.display).toBe("A♭4");
    // The whole model at a depth: every view reads the same label.
    const open = applyDepth(m, FULL_HARMONY_DEPTH);
    expect(open.byId.get(underE7?.id as string)?.label?.degree?.label).toBe("♯5");
    expect(open.staffSource?.labelOf(underE7?.id as string)?.degree?.label).toBe("♯5");
    const closed = applyDepth(m, CLOSED);
    expect(closed.byId.get(underE7?.id as string)?.label?.degree?.label).toBe("♭6");
  });
});

describe("the key panel: borrowed chords and the lift by a step", () => {
  const all = () => true;
  test("C major borrows Fm, A♭, B♭ and E♭ from C minor, each from its lesson", () => {
    const c = { tonic: "C", mode: "major" } as const;
    expect(lending(c, () => false)).toBeNull();
    expect(lending(c, (l) => l === "U16.L01")?.chords.map((x) => `${x.symbol} ${x.rn}`)).toEqual(["Fm iv"]);
    const full = lending(c, all);
    expect(full?.title).toBe("C minor lends");
    expect(full?.chords.map((x) => `${x.symbol} ${x.rn}`)).toEqual(["Fm iv", "A♭ ♭VI", "B♭ ♭VII", "E♭ ♭III"]);
    // Close position from the root: F A♭ C.
    expect(full?.chords[0]?.midis).toEqual([53, 56, 60]);
    expect(full?.chords[0]?.lowered).toBe("♭6");
    const am = lending({ tonic: "A", mode: "minor" }, all);
    expect(am?.chords.map((x) => `${x.symbol} ${x.rn}`)).toEqual(["A I", "D IV"]);
    expect(lending({ tonic: "D", mode: "dorian" }, all)).toBeNull();
  });

  test("the lift: every plain .scale() plays its bars, then the same a step higher", async () => {
    const code = `setcpm(100/4)\nmel: n("0 2 4 2").scale("C4:major").s("piano")\nbass: n("<0 3>").scale("C2:major").s("sawtooth")`;
    const key = { tonic: "C", mode: "major" } as const;
    expect(plainScaleCalls(code).map((c) => c.text)).toEqual(["C4:major", "C2:major"]);
    const up = liftCode(code, key, 2, 2);
    expect(up?.plan).toBe("<C4:major!2 D4:major!2>");
    expect(up?.bars).toBe(4);
    expect(up?.to).toEqual({ tonic: "D", mode: "major" });
    expect(up?.code).toContain('.scale("<C2:major!2 D2:major!2>")');
    const heard = await evalHeadless(up?.code ?? "", 4);
    const mel = (bar: number) =>
      heard.events.filter((e) => e.track === "mel" && Math.floor(e.onset) === bar).map((e) => e.midi);
    expect(mel(0)).toEqual([60, 64, 67, 64]);
    expect(mel(2)).toEqual([62, 66, 69, 66]);
    const half = liftCode(code, key, 2, 1);
    expect(half?.plan).toBe("<C4:major!2 Db4:major!2>");
    expect((await midisOf(half?.code ?? "", 4)).filter((x) => x === 61).length).toBeGreaterThan(0);
  });

  test("what cannot be lifted says why", () => {
    const key = { tonic: "C", mode: "major" } as const;
    expect(liftProblem('mel: note("c4 e4")', null)).toMatch(/no key yet/);
    expect(liftProblem('mel: note("c4 e4")', key)).toMatch(/n\(\) with \.scale\(\)/);
    expect(liftProblem('mel: n("0").scale("<C4:major D4:major>")', key)).toMatch(/already changes key/);
    expect(liftProblem('const a = n("0").scale("C4:major")\nmel: arrange([4, a])', key)).toMatch(
      /arranged in sections/,
    );
    expect(liftCode('mel: n("0").scale("<C4:major D4:major>")', key, 2, 2)).toBeNull();
  });
});

describe("carry-overs (d3)", () => {
  test("the staff's page is the page of the bar that plays, whatever sounds", () => {
    expect(pageOfBar(0, 8, 4)).toBe(0);
    expect(pageOfBar(8, 8, 4)).toBe(1);
    expect(pageOfBar(13.5, 4, 4)).toBe(3);
    expect(pageOfBar(40, 8, 4)).toBeNull();
    expect(pageOfBar(null, 8, 4)).toBeNull();
  });

  test("the ribbon's arrows walk every section of the piece, not the roll's page", () => {
    const sections = [0, 8, 16, 24, 32].map((startBar) => ({ startBar, bars: 8 })) as never[];
    // From the last section of a 16-bar page (bar 8) the next one is at bar 16, off the page.
    expect((stepSection(sections, sections[1] ?? null, 1) as { startBar: number }).startBar).toBe(16);
    expect((stepSection(sections, sections[4] ?? null, 1) as { startBar: number }).startBar).toBe(32);
    expect((stepSection(sections, sections[0] ?? null, -1) as { startBar: number }).startBar).toBe(0);
  });

  test("the Wave 6 lens keys are listed in the shortcut sheet's rows", () => {
    const keys = WORKBENCH_LENS_SHORTCUTS.map(([k]) => k);
    for (const k of ["Shift+I", "Shift+J", "Shift+V"]) expect(keys).toContain(k);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
