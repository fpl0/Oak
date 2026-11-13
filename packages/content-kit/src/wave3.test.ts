// The Wave 3 schema additions (notation and voice): each new field parses where it belongs, is refused
// where it does not, and the structural rules of `checkExercise` catch the mistakes an author can make
// with it. The shapes are documented in schema/exercise.ts, schema/lesson.ts and schema/catalog.ts.
import { describe, expect, test } from "bun:test";
import { BY_EAR_PITCH, checkExercise, defineDeck, defineMilestone, schemaIssues } from "./define.ts";
import { ladder } from "./fixtures.test-data.ts";
import type { Exercise, MilestoneDef } from "./schema/index.ts";
import { CONTENT_SCHEMA_VERSION } from "./version.ts";
import { ExerciseSchema, StepUiSchema } from "./zod.ts";

const base = { version: 1, prompt: "p", skills: [{ skill: "S02", w: 1 }], role: "practice", tests: [] };
const parses = (x: unknown) => schemaIssues(ExerciseSchema, x).length === 0;
const rules = (x: Exercise) => checkExercise(x, "ex").map((i) => i.rule);
const MEL = 'setcpm(84/4)\n\nmel: n("0 2 4 2").scale("C4:major").s("piano")';
const ref = { solutions: [MEL], bars: 1 };
const palette = { durations: ["4", "2"], accidentals: true, ties: false, rests: true };
const SING_TOL = {
  cents: "learner",
  octave: "per-note",
  driftCompCents: 0,
  minCoverage: 0.4,
  passHitRate: 1,
};

test("the content schema version moved to 2 with the Wave 3 shapes (3 since Wave 4)", () => {
  expect(CONTENT_SCHEMA_VERSION).toBeGreaterThanOrEqual(2);
});

describe("staff writing", () => {
  const write = (answer: object, expect: object) => ({
    ...base,
    kind: "staff-write",
    id: "write",
    hints: ladder,
    answer: { ui: "staff-input", clef: "treble", bars: 1, palette, ...answer },
    expect,
  });
  test("notes on a staff with a key signature: pitch only, or pitch and rhythm against a reference", () => {
    const G = { key: { tonic: "G", mode: "major" } };
    const pitchOnly = { e: "pitches", spelled: ["G4", "F#4"], order: "sequence", withOctave: true };
    const both = {
      e: "events",
      reference: ref,
      matcher: { m: "events", pitch: "absolute", rhythm: "onsets", durations: true },
    };
    for (const e of [pitchOnly, both]) {
      expect(parses(write(G, e))).toBe(true);
      expect(rules(write(G, e) as unknown as Exercise)).toEqual([]);
    }
    expect(parses(write({ key: { tonic: "H", mode: "major" } }, { e: "pitches", spelled: ["C4"] }))).toBe(
      false,
    );
  });
  test("a key signature in order: the answer is placed in key-signature mode", () => {
    const ok = write(
      { mode: "key-signature" },
      { e: "key-signature", key: { tonic: "D", mode: "major" }, order: "sequence" },
    );
    expect(parses(ok)).toBe(true);
    expect(rules(ok as unknown as Exercise)).toEqual([]);
    const noMode = write({}, { e: "key-signature", key: { tonic: "D", mode: "major" } });
    expect(rules(noMode as unknown as Exercise)).toEqual(["staff.key-signature-mode"]);
    const wrongMode = write(
      { mode: "key-signature" },
      { e: "pitches", spelled: ["D4"], order: "sequence", withOctave: false },
    );
    expect(rules(wrongMode as unknown as Exercise)).toEqual(["staff.key-signature-mode"]);
    expect(
      parses(write({ mode: "chords" }, { e: "key-signature", key: { tonic: "D", mode: "major" } })),
    ).toBe(false);
  });
});

describe("singing", () => {
  const sing = (o: object = {}, tol: object = {}) => ({
    ...base,
    kind: "sing",
    id: "sing",
    hints: ladder,
    fallback: "identify",
    mode: "degree",
    stimulus: { src: "generator", family: "fam.deg.sing", level: 1 },
    cue: { context: "cadence", countInBars: 1, click: false, replays: 2 },
    target: { from: "degrees", degrees: ["1", "3", "5", "1"], octaves: [0, 0, 0, 1] },
    tol: { ...SING_TOL, ...tol },
    showTrace: "live",
    ...o,
  });
  test("a degree pattern with octaves, sung on numbers or syllables", () => {
    expect(parses(sing({ labels: "numbers" }))).toBe(true);
    expect(parses(sing({ labels: "syllables" }))).toBe(true);
    expect(parses(sing({ labels: "letters" }))).toBe(false);
    expect(rules(sing() as unknown as Exercise)).toEqual([]);
  });
  test("octaves: one per degree, at most two octaves away", () => {
    const short = sing({ target: { from: "degrees", degrees: ["1", "5"], octaves: [0] } });
    expect(rules(short as unknown as Exercise)).toEqual(["sing.octaves-length"]);
    expect(parses(sing({ target: { from: "degrees", degrees: ["1"], octaves: [3] } }))).toBe(false);
  });
  test("the lenient first sing is a single pitch target", () => {
    expect(parses(sing({ mode: "pitch" }, { lenient: true }))).toBe(true);
    expect(rules(sing({ mode: "pitch" }, { lenient: true }) as unknown as Exercise)).toEqual([]);
    expect(rules(sing({ mode: "echo" }, { lenient: true }) as unknown as Exercise)).toEqual([
      "sing.lenient-mode",
    ]);
  });
});

describe("by-ear transcription", () => {
  const byEar = (accepts: string, pitch: string, o: object = {}) => ({
    ...base,
    kind: "dictation",
    id: "by-ear",
    hints: ladder,
    domain: "melody",
    stimulus: { src: "code", code: MEL, bars: 1, showCode: false },
    cue: { context: "tonic-chord", countInBars: 1, click: false, replays: -1 },
    answer: { ui: "code", starter: 'setcpm(84/4)\n\nmel: n("⟪0 ~ ~ ~⟫").scale("C4:major").s("piano")' },
    reference: ref,
    matcher: { m: "melody", pitch, wPitch: 0.7, wRhythm: 0.3, rhythmTol: [1, 16] },
    byEar: { ab: true, rates: [1, 0.75], accepts },
    ...o,
  });
  test("every transposition rule names the matcher's pitch mode", () => {
    for (const [accepts, pitches] of Object.entries(BY_EAR_PITCH)) {
      const x = byEar(accepts, pitches[0]);
      expect(parses(x)).toBe(true);
      expect(rules(x as unknown as Exercise)).toEqual([]);
    }
  });
  test("a rule that disagrees with the matcher, a non-code answer and a slow first rate are caught", () => {
    expect(rules(byEar("any-key", "absolute") as unknown as Exercise)).toEqual(["by-ear.accepts-matcher"]);
    const pad = byEar("any-key", "transposition-invariant", {
      answer: { ui: "degree-pad", set: ["1", "2", "3"], syllables: false },
    });
    expect(rules(pad as unknown as Exercise)).toEqual(["by-ear.code-answer"]);
    const slow = byEar("exact", "absolute", { byEar: { ab: true, rates: [0.5, 1], accepts: "exact" } });
    expect(rules(slow as unknown as Exercise)).toEqual(["by-ear.rates"]);
    expect(parses(byEar("transposed", "absolute"))).toBe(false);
  });
});

describe("passive listening", () => {
  const listen = (o: object) => ({ ...base, kind: "listen", id: "lab", hints: null, items: [], ...o });
  const passive = { family: "fam.int.in-key", level: 2, items: 12, reveal: "with", gapBeats: 2 };
  test("a passive block stands in for the items", () => {
    expect(parses(listen({ passive }))).toBe(true);
    expect(parses(listen({ items: [{ code: MEL, caption: "c", bars: 1 }], passive }))).toBe(true);
  });
  test("a listen step still needs something to play", () => {
    expect(parses(listen({}))).toBe(false);
    expect(parses(listen({ passive: { ...passive, items: 1 } }))).toBe(false);
    expect(parses(listen({ passive: { ...passive, family: "int.in-key" } }))).toBe(false);
  });
});

describe("modify: the target's roll after a failed try", () => {
  const modify = (target: object) => ({
    ...base,
    kind: "code-modify",
    id: "m",
    hints: ladder,
    code: { starter: MEL },
    reference: ref,
    matcher: { m: "events", pitch: "absolute", rhythm: "onsets", durations: false },
    target,
  });
  test("revealRollAfter counts failed checks, for a hidden roll only", () => {
    expect(parses(modify({ audible: true, showRoll: false, revealRollAfter: 1 }))).toBe(true);
    expect(parses(modify({ audible: true, revealRollAfter: 0 }))).toBe(false);
    expect(
      rules(modify({ audible: true, showRoll: true, revealRollAfter: 1 }) as unknown as Exercise),
    ).toEqual(["modify.reveal-roll"]);
  });
});

test("staff labels on a step", () => {
  const ui = { panels: { roll: true, staff: "treble", keyboard: false } };
  for (const staffLabels of ["none", "note", "degree", "degree+solfege"])
    expect(schemaIssues(StepUiSchema, { ...ui, staffLabels })).toEqual([]);
  expect(schemaIssues(StepUiSchema, { ...ui, staffLabels: "solfege" }).length).toBeGreaterThan(0);
});

describe("fact cards with alternative answers", () => {
  const deck = (accept?: unknown) => ({
    id: "deck.chd.symbols",
    title: "Chord symbols",
    unlock: { skill: "N05", lesson: "U05.L04" },
    newPerDay: 3,
    fastRtMs: 4000,
    answer: "text",
    cards: [
      {
        id: "fact.chord.Cmaj7",
        prompt: { text: "Name `C^7` in lead-sheet form." },
        answer: { text: ["Cmaj7"] },
        ...(accept === undefined ? {} : { accept }),
      },
    ],
  });
  test("accept lists other correct answers", () => {
    const d = defineDeck(deck([{ text: ["CM7"] }, { text: ["C∆7"] }]) as never);
    expect(d.cards[0]?.accept?.length).toBe(2);
  });
  test("an empty or malformed accept list is refused", () => {
    expect(() => defineDeck(deck([]) as never)).toThrow();
    expect(() => defineDeck(deck([{ words: ["CM7"] }]) as never)).toThrow();
  });
});

describe("milestone conditions", () => {
  const ms = (when: unknown): MilestoneDef =>
    ({ id: "ms.05", title: "t", description: "d", when }) as MilestoneDef;
  test("ladder levels, `after` and `anyOf` express ms.05, ms.07 and ms.08", () => {
    expect(defineMilestone(ms({ ladder: { level: 5 }, sessions: ["U10.CP"] })).when.ladder?.level).toBe(5);
    expect(
      defineMilestone(ms({ anyOf: [{ capstones: ["CF-A"] }, { capstones: ["CF-T"] }] })).when.anyOf,
    ).toHaveLength(2);
    expect(defineMilestone(ms({ ladder: { level: 6, after: "J1.L01" } })).when.ladder?.after).toBe("J1.L01");
  });
  test("an empty condition, a level off the ladder or a one-branch anyOf is refused", () => {
    expect(() => defineMilestone(ms({}))).toThrow();
    expect(() => defineMilestone(ms({ ladder: { level: 9 } }))).toThrow();
    expect(() => defineMilestone(ms({ anyOf: [{ capstones: ["CF-A"] }] }))).toThrow();
    expect(() => defineMilestone(ms({ capstones: [] }))).toThrow();
  });
});
