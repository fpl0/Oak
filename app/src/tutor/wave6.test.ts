// Wave 6 in the panel (pure parts): applied and borrowed numerals, keys and modes as chips that light their bars and
// switch the matching lens on (an applied or borrowed numeral the Roman numerals lens, a key in a piece that changes
// key the Key lens, a mode the Degrees lens); numerals read in the key in force at their bar after a lift; the key
// plan from a patterned `.scale()` and from the Workbench's `keyPlanView`.
import { describe, expect, test } from "bun:test";
import type { MusicToken } from "@oak/api";
import type { TermEntry } from "@oak/content-kit";
import { keyOf } from "@oak/theory";
import { terms as COURSE_TERMS } from "../../../content/terms.ts";
import { barsWhere, type ChordAt, chordMapFromCode, keyAtBar, keyPlanFromCode } from "./harmony-chips.ts";
import { switchLensOn } from "./lens-switch.ts";
import { describeToken, keyFromSlug, keyName, type TokenContext } from "./music-tokens.ts";
import { keySpansOfView } from "./use-subject-harmony.ts";

const C = keyOf("C major");
const D_DORIAN = keyOf("D dorian");

/** C7's shape: verse with V7/V, chorus with bVI bVII I, the last chorus a whole step up. */
const C7 = [
  "setcpm(96/4)",
  'const chordsVerse = chord("<C Am D7 G7>").voicing()',
  "chords: arrange([8, chordsVerse], [8, chordsVerse], [8, chordsVerse])",
  'mel: n("0").scale("<C4:major!16 D4:major!8>")',
].join("\n");

/** The chords of a 24-bar piece as the Workbench's analysis gives them: bars 1–16 in C, 17–24 lifted to D. */
const MAP: ChordAt[] = [
  ...["C", "Am", "D7", "G7", "C", "Am", "D7", "G7", "F", "G", "C", "Am", "F", "Ab", "Bb", "C"].map(
    (symbol, i) => ({
      bar: i + 1,
      symbol,
    }),
  ),
  ...["G", "A", "D", "Bm", "G", "Bb", "C", "D"].map((symbol, i) => ({ bar: i + 17, symbol })),
  { bar: 20, beat: 3, symbol: "E7" },
];

const tok = (kind: MusicToken["kind"], value: string) =>
  ({ kind, value }) as Exclude<MusicToken, { kind: "reveal" }>;

function ctxOf(over: Partial<TokenContext> = {}): TokenContext {
  return {
    terms: COURSE_TERMS as readonly TermEntry[],
    introduced: null,
    tools: [],
    unlocked: null,
    key: C,
    harmony: MAP,
    ...over,
  };
}

describe("the key plan of the music on screen", () => {
  test("from a patterned .scale(): display bars, inclusive; a single scale is no plan", () => {
    expect(keyPlanFromCode(C7)).toEqual([
      { from: 1, to: 16, key: { tonic: "C", mode: "major" } },
      { from: 17, to: 24, key: { tonic: "D", mode: "major" } },
    ]);
    expect(keyPlanFromCode('mel: n("0 2").scale("C4:major")')).toEqual([]);
    expect(keyPlanFromCode(null)).toEqual([]);
    const plan = keyPlanFromCode(C7);
    expect(keyAtBar(plan, 16, null)).toEqual({ tonic: "C", mode: "major" });
    expect(keyAtBar(plan, 17, null)).toEqual({ tonic: "D", mode: "major" });
    expect(keyAtBar([], 17, C)).toEqual(C);
  });

  test("from the Workbench's keyPlanView: 1-based spans; one key is no plan", () => {
    const view = {
      spans: [
        { fromBar: 1, toBar: 48, key: C },
        { fromBar: 49, toBar: 56, key: keyOf("D major") },
      ],
    };
    expect(keySpansOfView(view)).toEqual([
      { from: 1, to: 48, key: C },
      { from: 49, to: 56, key: keyOf("D major") },
    ]);
    expect(keySpansOfView({ spans: [{ fromBar: 1, toBar: 8, key: C }] })).toEqual([]);
    expect(keySpansOfView(null)).toEqual([]);
  });

  test("a numeral is read in the key in force at its bar: V7/V is D7 in C and E7 in D", () => {
    const plan = keyPlanFromCode(C7);
    expect(barsWhere(MAP, { kind: "rn", value: "V7/V" }, C, plan)).toEqual([3, 7, 20]);
    // Without the plan, the lifted bar's E7 is V7/vi of C, not V7/V.
    expect(barsWhere(MAP, { kind: "rn", value: "V7/V" }, C)).toEqual([3, 7]);
    expect(barsWhere(MAP, { kind: "rn", value: "bVI" }, C, plan)).toEqual([14, 22]);
    expect(barsWhere(MAP, { kind: "rn", value: "bVII" }, C, plan)).toEqual([15, 23]);
    // A chord symbol is the same chord in any key.
    expect(barsWhere(MAP, { kind: "chord", value: "Bb" }, C, plan)).toEqual([15, 22]);
  });

  test("chordMapFromCode still reads a seventh chord's bars", () => {
    expect(chordMapFromCode(C7, C).slice(2, 4)).toEqual([
      { bar: 3, symbol: "D7", rn: "V7/V" },
      { bar: 4, symbol: "G7", rn: "V7" },
    ]);
  });
});

describe("applied and borrowed numerals: chips that light their bars and switch the numeral lens on", () => {
  const plan = keyPlanFromCode(C7);

  test("V7/V: an applied chord, its bars, the Roman numerals lens", () => {
    const info = describeToken(tok("rn", "V7/V"), ctxOf({ keyPlan: plan }));
    expect(info?.label).toBe("V7/V");
    expect(info?.title).toContain("an applied chord: the V of the chord it leans into");
    expect(info?.title).toContain("In C major it is D7.");
    expect(info?.where).toEqual([3, 7, 20]);
    expect(info?.highlight).toEqual({ from: 3, to: 3 });
    expect(info?.lens).toEqual({ group: "chords", id: "romanNumerals", label: "Roman numerals" });
    expect(info?.title).toContain("Turns the Roman numerals lens on.");
  });

  test("bVI and iv: borrowed chords with one note changed; the lens too", () => {
    const bVI = describeToken(tok("rn", "bVI"), ctxOf({ keyPlan: plan }));
    expect(bVI?.label).toBe("♭VI");
    expect(bVI?.title).toContain("a chord borrowed from the other key on the same home note");
    expect(bVI?.where).toEqual([14, 22]);
    expect(bVI?.lens?.id).toBe("romanNumerals");
    const iv = describeToken(tok("rn", "iv"), ctxOf());
    expect(iv?.title).toContain("borrowed");
    expect(iv?.lens?.id).toBe("romanNumerals");
  });

  test("a chord of the key is not an outside chord: no lens, the Wave 4 hover", () => {
    const v = describeToken(tok("rn", "V7"), ctxOf());
    expect(v?.title).toContain("a chord that pulls back home (dominant)");
    expect(v?.lens).toBeUndefined();
    const ii = describeToken(tok("rn", "ii"), ctxOf());
    expect(ii?.lens).toBeUndefined();
  });

  test("in A minor the Picardy I and the Dorian IV say what they are", () => {
    const am = keyOf("A minor");
    expect(describeToken(tok("rn", "I"), ctxOf({ key: am, harmony: [] }))?.title).toContain(
      "a major home chord ending a minor piece",
    );
    expect(describeToken(tok("rn", "IV"), ctxOf({ key: am, harmony: [] }))?.title).toContain("Dorian");
    // The minor key's own iv is no outside chord.
    expect(describeToken(tok("rn", "iv"), ctxOf({ key: am, harmony: [] }))?.lens).toBeUndefined();
  });
});

describe("keys: in a piece that changes key, a key chip lights its bars and switches the Key lens on", () => {
  const plan = keyPlanFromCode(C7);

  test("[[term:d-major]] after a lift", () => {
    const info = describeToken(tok("term", "d-major"), ctxOf({ keyPlan: plan }));
    expect(info?.variant).toBe("key");
    expect(info?.label).toBe("D major");
    expect(info?.highlight).toEqual({ from: 17, to: 24 });
    expect(info?.title).toContain("In force in bars 17–24.");
    expect(info?.lens).toEqual({ group: "music", id: "keyPlan", label: "Key" });
    expect(info?.aria).toBe("key D major, in bars 17–24");
  });

  test("a piece in one key: the key chip plays and describes, no bars, no lens (the ribbon would draw nothing)", () => {
    const info = describeToken(tok("term", "d-major"), ctxOf());
    expect(info?.highlight).toBeUndefined();
    expect(info?.lens).toBeUndefined();
    expect(info?.title).toContain("Its relative minor is B minor.");
  });

  test("a key in a colour mode: named as a proper name, its parent and its colour note", () => {
    expect(keyFromSlug("d-dorian")).toEqual({ tonic: "D", mode: "dorian" });
    expect(keyFromSlug("g-mixolydian")).toEqual({ tonic: "G", mode: "mixolydian" });
    expect(keyName(D_DORIAN)).toBe("D Dorian");
    expect(keyName(C)).toBe("C major");
    const info = describeToken(tok("term", "d-dorian"), ctxOf({ key: D_DORIAN, harmony: [] }));
    expect(info?.label).toBe("D Dorian");
    expect(info?.title).toContain("The notes of C major from D; its colour note is ♮6.");
  });
});

describe("modes: a mode chip names its colour note, lights its bars and switches the Degrees lens on", () => {
  test("[[term:dorian]] in a D Dorian vamp", () => {
    const info = describeToken(tok("term", "dorian"), ctxOf({ key: D_DORIAN, harmony: [] }));
    expect(info?.variant).toBe("mode");
    expect(info?.label).toBe("Dorian");
    expect(info?.title).toContain("In D Dorian its colour note is B, degree 6.");
    expect(info?.degree).toBe("6");
    expect(info?.lens).toEqual({ group: "base", id: "degrees", label: "Degrees" });
    // Its scale: D E F G A B C D.
    expect(info?.play?.map((c) => (c[0] as number) % 12)).toEqual([2, 4, 5, 7, 9, 11, 0, 2]);
  });

  test("a piece whose bridge is in another mode: the chip lights the bars in that mode, on its home note", () => {
    const plan = [
      { from: 1, to: 8, key: keyOf("G major") },
      { from: 9, to: 16, key: keyOf("G mixolydian") },
    ];
    const info = describeToken(
      tok("term", "term.mixolydian"),
      ctxOf({ key: keyOf("G major"), keyPlan: plan }),
    );
    expect(info?.highlight).toEqual({ from: 9, to: 16 });
    expect(info?.title).toContain("In G Mixolydian its colour note is F, degree ♭7.");
  });

  test("a mode not met yet is a preview, still a chip", () => {
    const info = describeToken(tok("term", "lydian"), ctxOf({ introduced: new Set(["term.dorian"]) }));
    expect(info?.preview).toBe(true);
    expect(info?.title).toContain("(Comes in U14.");
  });
});

describe("switchLensOn: only on, and only a lens the learner has", () => {
  function fake(over: { degrees?: boolean; rn?: boolean; key?: boolean; avail?: boolean }) {
    const sets: string[] = [];
    const avail = over.avail ?? true;
    const lenses = {
      shown: { degrees: over.degrees ?? false, solfege: false, noteNames: true },
      available: { degrees: avail, solfege: avail, noteNames: true },
      set: (id: string, on: boolean) => void sets.push(`base.${id}=${on}`),
      chords: {
        prefs: { chordSymbols: true, romanNumerals: over.rn ?? false },
        shown: { chordSymbols: true, romanNumerals: over.rn ?? false },
        available: { chordSymbols: true, romanNumerals: avail },
        set: (id: string, on: boolean) => void sets.push(`chords.${id}=${on}`),
        toggle: () => {},
      },
      music: {
        prefs: { guideTones: true, keyPlan: over.key ?? false, beatGrid: true },
        shown: { guideTones: true, keyPlan: over.key ?? false, beatGrid: true },
        available: { guideTones: true, keyPlan: avail, beatGrid: true },
        set: (id: string, on: boolean) => void sets.push(`music.${id}=${on}`),
        toggle: () => {},
      },
    };
    return { lenses: lenses as unknown as Parameters<typeof switchLensOn>[0], sets };
  }

  test("each group's lens is switched on when it is off and unlocked", () => {
    const f = fake({});
    expect(switchLensOn(f.lenses, { group: "chords", id: "romanNumerals", label: "Roman numerals" })).toBe(
      true,
    );
    expect(switchLensOn(f.lenses, { group: "music", id: "keyPlan", label: "Key" })).toBe(true);
    expect(switchLensOn(f.lenses, { group: "base", id: "degrees", label: "Degrees" })).toBe(true);
    expect(f.sets).toEqual(["chords.romanNumerals=true", "music.keyPlan=true", "base.degrees=true"]);
  });

  test("already on, or not unlocked yet: nothing is changed", () => {
    const on = fake({ degrees: true, rn: true, key: true });
    expect(switchLensOn(on.lenses, { group: "chords", id: "romanNumerals", label: "x" })).toBe(false);
    expect(switchLensOn(on.lenses, { group: "music", id: "keyPlan", label: "x" })).toBe(false);
    expect(switchLensOn(on.lenses, { group: "base", id: "degrees", label: "x" })).toBe(false);
    const locked = fake({ avail: false });
    expect(switchLensOn(locked.lenses, { group: "music", id: "keyPlan", label: "x" })).toBe(false);
    expect(on.sets).toEqual([]);
    expect(locked.sets).toEqual([]);
  });
});
