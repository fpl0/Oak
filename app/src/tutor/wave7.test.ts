// Wave 7 in the panel (pure parts): voicing, tension, clave and register words as chips that light their bars and
// switch the matching track lens on (Voicings, Tensions, Clave, Registers; the other track words their own lens);
// the bars come from the Workbench's track lenses (`model.track`) as `useSubjectHarmony` keeps them.
import { describe, expect, test } from "bun:test";
import type { MusicToken } from "@oak/api";
import type { TermEntry } from "@oak/content-kit";
import { keyOf, voicingType } from "@oak/theory";
import { terms as COURSE_TERMS } from "../../../content/terms.ts";
import { switchLensOn } from "./lens-switch.ts";
import { describeToken, type TokenContext } from "./music-tokens.ts";
import { claveFromSlug, claveText, TRACK_WORDS, type TrackMarks, trackMarksOf } from "./track-chips.ts";

const tok = (value: string) => ({ kind: "term", value }) as Exclude<MusicToken, { kind: "reveal" }>;

/** A Workbench analysis as `model.track` and `model.events` give it (workbench/track-lens.ts). */
const EVENTS = [
  { id: "c1a", bar: 1, midi: 53 },
  { id: "c1b", bar: 1, midi: 57 },
  { id: "c1c", bar: 1, midi: 60 },
  { id: "c1d", bar: 1, midi: 64 },
  { id: "c2a", bar: 2, midi: 53 },
  { id: "c2b", bar: 2, midi: 57 },
  { id: "c2c", bar: 2, midi: 59 },
  { id: "c2d", bar: 2, midi: 64 },
  { id: "c3a", bar: 3, midi: 52 },
  { id: "c3b", bar: 3, midi: 59 },
  { id: "c3c", bar: 3, midi: 64 },
  { id: "m2", bar: 2, midi: 66 },
  { id: "m4", bar: 4, midi: 73 },
  { id: "m5", bar: 5, midi: 72 },
];
const TRACK = {
  voicings: [
    { at: 0, ids: ["c1a", "c1b", "c1c", "c1d"], label: "rootless A" },
    { at: 1, ids: ["c2a", "c2b", "c2c", "c2d"], label: "rootless B" },
    { at: 2, ids: ["c3a", "c3b", "c3c"], label: "shell" },
    { at: 3, ids: ["zz"], label: "rootless A" },
  ],
  tensions: new Map([
    ["m2", { tag: "♯11", avoid: false }],
    ["m4", { tag: "13", avoid: false }],
    ["m5", { tag: "11", avoid: true }],
  ]),
  clave: {
    type: "son",
    direction: "3-2",
    windows: [
      { bar: 1, holds: true },
      { bar: 3, holds: true },
      { bar: 5, holds: false },
    ],
  },
  registers: { clashes: [{ bar: 3 }, { bar: 3 }, { bar: 7 }] },
};
const MARKS = trackMarksOf(TRACK, EVENTS) as TrackMarks;

function ctxOf(over: Partial<TokenContext> = {}): TokenContext {
  return {
    terms: COURSE_TERMS as readonly TermEntry[],
    introduced: null,
    tools: [],
    unlocked: null,
    key: keyOf("C major"),
    track: MARKS,
    ...over,
  };
}

describe("the Workbench's track lenses as bars", () => {
  test("voicings by type (an event the model no longer has is skipped), tensions, the clave, clashes", () => {
    expect(MARKS.voicings).toEqual({ "rootless-a": [1], "rootless-b": [2], shell: [3] });
    expect(MARKS.voicingNotes.shell).toEqual([52, 59, 64]);
    expect(MARKS.tensions).toEqual({ "♯11": [2], "13": [4], "11": [5], avoid: [5] });
    expect(MARKS.clave).toEqual({ type: "son", direction: "3-2", bars: [1, 2, 3, 4] });
    expect(MARKS.clashes).toEqual([3, 7]);
    expect(trackMarksOf(null)).toBeNull();
  });
});

describe("voicing, tension, clave and register chips", () => {
  test("a voicing type lights its bars, plays the learner's own chord and switches the Voicings lens on", () => {
    const a = describeToken(tok("a-voicing"), ctxOf());
    expect(a).toMatchObject({
      variant: "voicing",
      label: "A voicing",
      highlight: { from: 1, to: 1 },
      where: [1],
      play: [[53, 57, 60, 64]],
      lens: { group: "track", id: "voicings", label: "Voicings" },
    });
    expect(a?.title).toContain("Here: rootless A voicings in bar 1.");
    expect(describeToken(tok("rootless-voicing"), ctxOf())?.where).toEqual([1, 2]);
    // With no hand voicing of that type here, it says so and plays a model of it on Dm7, read as that type.
    const drop = describeToken(tok("drop-2"), ctxOf());
    expect(drop?.where).toBeUndefined();
    expect(drop?.title).toContain("The music on screen has none.");
    expect(voicingType(drop?.play?.[0] as number[], "Dm7").type).toBe("drop-2");
    for (const [slug, type] of [
      ["shell-voicing", "shell"],
      ["a-voicing", "rootless-a"],
      ["b-voicing", "rootless-b"],
      ["close-position", "close"],
    ] as const) {
      const play = describeToken(tok(slug), ctxOf({ track: null }))?.play?.[0] as number[];
      expect(voicingType(play, "Dm7").type).toBe(type);
    }
  });

  test("a tension lights the bars of its melody notes and switches the Tensions lens on", () => {
    expect(describeToken(tok("extension"), ctxOf())).toMatchObject({
      variant: "tension",
      where: [2, 4, 5],
      lens: { group: "track", id: "tensions" },
    });
    expect(describeToken(tok("avoid-note"), ctxOf())?.where).toEqual([5]);
    expect(describeToken(tok("altered-dominant"), ctxOf())?.where).toEqual([2]);
  });

  test("the clave by its glossary word, and by type and direction, lights the windows that hold it", () => {
    expect(describeToken(tok("clave"), ctxOf())).toMatchObject({
      variant: "clave",
      where: [1, 2, 3, 4],
      highlight: { from: 1, to: 4 },
      lens: { group: "track", id: "clave", label: "Clave" },
    });
    const son = describeToken(tok("son-3-2"), ctxOf());
    expect(son).toMatchObject({ label: "son 3-2", variant: "clave", where: [1, 2, 3, 4] });
    expect(son?.title).toContain("0 3 6 | 2 4; the three side first. Here it holds in bars 1–4.");
    const other = describeToken(tok("son-2-3"), ctxOf());
    expect(other?.where).toBeUndefined();
    expect(other?.title).toContain("The music on screen plays son 3-2.");
    expect(claveFromSlug("rumba-clave-2-3")).toEqual({ type: "rumba", direction: "2-3" });
    expect(claveFromSlug("son-3-3")).toBeNull();
    expect(claveText("rumba", "3-2")).toBe("0 3 7 | 2 4");
  });

  test("a register lights the bars with a clash and switches the Registers lens on", () => {
    expect(describeToken(tok("register"), ctxOf())).toMatchObject({
      variant: "register",
      where: [3, 7],
      lens: { group: "track", id: "registers" },
    });
    expect(describeToken(tok("register"), ctxOf())?.aria).toBe("term register, in bar 3 and bar 7");
  });

  test("the other track words switch their own lens on; a word the learner has not met is a preview", () => {
    const lensOf = (slug: string) => describeToken(tok(slug), ctxOf())?.lens;
    expect(lensOf("chord-scale")).toMatchObject({ id: "chordScales" });
    expect(lensOf("laid-back")).toMatchObject({ id: "microtiming" });
    expect(lensOf("polyrhythm")).toMatchObject({ id: "polyLanes" });
    expect(lensOf("density")).toMatchObject({ id: "density" });
    const early = describeToken(tok("a-voicing"), ctxOf({ introduced: new Set(["term.chord-symbol"]) }));
    expect(early).toMatchObject({ preview: true });
    expect(early?.title).toContain("(Comes in J3.L01.)");
    // Every word the chips know is a glossary term.
    const ids = new Set(COURSE_TERMS.map((t) => t.id as string));
    for (const id of Object.keys(TRACK_WORDS)) expect(ids.has(id)).toBe(true);
  });
});

describe("the track lens a chip switches", () => {
  const lenses = (available: boolean, shown = false) => {
    const set: string[] = [];
    return {
      set,
      l: {
        shown: {},
        available: {},
        set: () => {},
        chords: { shown: {}, available: {}, set: () => {} },
        music: { shown: {}, available: {}, set: () => {} },
        track: {
          shown: { voicings: shown },
          available: { voicings: available },
          set: (id: string, on: boolean) => void set.push(`${id}:${on}`),
        },
      } as unknown as Parameters<typeof switchLensOn>[0],
    };
  };
  const VOICINGS = { group: "track", id: "voicings", label: "Voicings" } as const;

  test("only ever on, and only a lens the learner has opened", () => {
    const open = lenses(true);
    expect(switchLensOn(open.l, VOICINGS)).toBe(true);
    expect(open.set).toEqual(["voicings:true"]);
    const locked = lenses(false);
    expect(switchLensOn(locked.l, VOICINGS)).toBe(false);
    expect(locked.set).toEqual([]);
    const already = lenses(true, true);
    expect(switchLensOn(already.l, VOICINGS)).toBe(false);
    expect(already.set).toEqual([]);
  });
});
