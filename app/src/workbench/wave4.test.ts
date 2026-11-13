// Wave 4 in the Workbench, against real Strudel (the grader realm in-process): the chord band and the chord
// lenses read from the grader's harmonyView (hand-stacked triads, chord().voicing(), a separate bass making a
// slash chord, a melody over the Band's chords), the chord-tone and range lenses, the staff's chord labels and the
// lead sheet with a pickup, the panels' rules (lenses vs a lesson step) and the voicing comparison's pattern.
// Every musical fact is cross-checked with headless Strudel or @oak/theory.
import { beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { evaluateForGrading, initRealm } from "@oak/grader";
import { evalHeadless, midisOf } from "@oak/grader/testing";
import { chordLabelTexts } from "@oak/notation";
import { readChord, romanText } from "@oak/theory";
import {
  changesAsChordPattern,
  chordTonePercent,
  rangeLines,
  rnDisplay,
  staffChordLabels,
} from "./harmony.ts";
import { buildModel, leadEvents, type ModelOptions, staffPage, type WorkbenchModel } from "./model.ts";
import {
  chordDisplay,
  initialPanelState,
  NO_PANELS,
  PANEL_SWITCHES,
  PANEL_UNLOCKS,
  panelAvailability,
} from "./panels.ts";
import { WORKBENCH_LOOP_SHORTCUTS } from "./shortcuts.ts";

setDefaultTimeout(30_000);

beforeAll(async () => {
  await initRealm({ toolbox: [], lockdown: false });
});

async function model(
  code: string,
  bars: number,
  opts: Partial<ModelOptions> = {},
  band?: string,
): Promise<WorkbenchModel> {
  const result = await evaluateForGrading(code, {
    mode: "lesson",
    bars,
    lint: null,
    ...(band ? { band } : {}),
  });
  const out = buildModel(code, result, { meter: "4/4", key: null, staff: "auto", ...opts });
  if (!out.ok) throw new Error(`${out.error.kind}: ${out.error.message}`);
  return out.model;
}

const C = { tonic: "C", mode: "major" } as const;
const symbols = (m: WorkbenchModel) => m.harmony?.regions.map((r) => r.symbol) ?? [];
const numerals = (m: WorkbenchModel) => m.harmony?.regions.map((r) => r.rn) ?? [];

describe("the chord band reads the chords as they sound", () => {
  test("hand-stacked triads in n(): C G Am F = I V vi IV, T D T PD", async () => {
    const code = 'chords: n("<[0,2,4] [4,6,8] [5,7,9] [3,5,7]>").scale("C3:major").s("piano")';
    // Headless Strudel: bar 2 is G3 B3 D4, bar 3 A3 C4 E4.
    const b2 = (await evalHeadless(code, 4)).events.filter((e) => e.onset === 1).map((e) => e.midi);
    expect(b2).toEqual([55, 59, 62]);
    expect(readChord([7, 11, 2], 7)?.leadSheet).toBe("G");
    const m = await model(code, 4);
    expect(symbols(m)).toEqual(["C", "G", "Am", "F"]);
    expect(numerals(m)).toEqual(["I", "V", "vi", "IV"]);
    expect(m.harmony?.regions.map((r) => r.fn)).toEqual(["T", "D", "T", "PD"]);
    expect(m.harmony?.regions.map((r) => [r.from, r.to])).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
    ]);
    expect(m.harmony?.source).toBe("learner");
  });

  test("chord().voicing() over a bass names the written chords; alone, its lowest voice is the bass", async () => {
    const withBass = `chords: chord("<C Am F G>").voicing().s("piano")
bass: note("<c2 a1 f1 g1>").s("piano")`;
    const m = await model(withBass, 4, { key: C });
    expect(symbols(m)).toEqual(["C", "Am", "F", "G"]);
    expect(numerals(m)).toEqual(["I", "vi", "IV", "V"]);
    // Strudel's default voicing of C puts E lowest (E4 G4 C5): without a bass that is what sounds, C/E = I6.
    const alone = 'chords: chord("<C Am F G>").voicing().s("piano")';
    const c = (await evalHeadless(alone, 1)).events.map((e) => e.midi as number);
    expect(Math.min(...c) % 12).toBe(4);
    const m2 = await model(alone, 4, { key: C });
    expect(symbols(m2)[0]).toBe("C/E");
    expect(numerals(m2)[0]).toBe("I6");
  });

  test("the Band's bass under the learner's chords decides the inversion (what you hear)", async () => {
    const band = 'bass: note("<c2 a1 f1 g1>").s("piano")';
    const m = await model('chords: chord("<C Am F G>").voicing().s("piano")', 4, { key: C }, band);
    expect(m.harmony?.source).toBe("learner");
    expect(symbols(m)).toEqual(["C", "Am", "F", "G"]);
  });

  test("a Band bass that is not heard (a step's tracks, a mute) never changes the learner's chords", async () => {
    // U06.L06's Make: IV I V vi in n() over the axis Band played with its drums only. Its bass (C G A F) is in the
    // Band's code, but silent: the band reads F C G Am, not F/C C/G G/A Am/F.
    const band = 'bass: note("<c2 g1 a1 f1>").s("piano")';
    const code = 'chords: n("[0,2,4]").add(n("<3 0 4 5>")).scale("C3:major").s("pad")';
    const heard = await model(code, 4, { key: C }, band);
    expect(numerals(heard)).toEqual(["IV64", "I64", "Vadd9", "IVmaj7"].map((r) => rnDisplay(r, C)));
    const drumsOnly = await model(code, 4, { key: C, bandHeard: ["drums"] }, band);
    expect(symbols(drumsOnly)).toEqual(["F", "C", "G", "Am"]);
    expect(numerals(drumsOnly)).toEqual(["IV", "I", "V", "vi"]);
    // The roll still shows every Band part.
    expect(drumsOnly.events.some((e) => e.band && e.track === "band.bass")).toBe(true);
  });

  test("a separate bass makes a slash chord: G over B is G/B = V6 (theory agrees)", async () => {
    const code = `chords: n("<[0,2,4] [4,6,8]>").scale("C4:major").s("piano")
bass: note("<c2 b1>").s("piano")`;
    expect(await midisOf('bass: note("<c2 b1>")', 2)).toEqual([36, 35]);
    const m = await model(code, 2);
    expect(symbols(m)).toEqual(["C", "G/B"]);
    expect(numerals(m)).toEqual(["I", "V6"]);
    expect(m.harmony?.regions[1]?.inversion).toBe(1);
    expect(readChord([7, 11, 2], 11)?.leadSheet).toBe("G/B");
  });

  test("the diminished triad's numeral prints with the degree sign", async () => {
    const code = 'chords: n("<[6,8,10] [0,2,4]>").scale("C3:major").s("piano")';
    const m = await model(code, 2);
    expect(symbols(m)).toEqual(["B°", "C"]);
    expect(numerals(m)).toEqual(["vii°", "I"]);
    expect(rnDisplay("viio", C)).toBe("vii°");
    expect(rnDisplay(null, C)).toBeNull();
  });

  test("a chord struck on every beat is one region, a change in the bar starts another", async () => {
    const code = 'chords: n("<[[0,2,4]*4] [[3,5,7]*2 [4,6,8]*2]>").scale("C3:major").s("piano")';
    const m = await model(code, 2);
    expect(symbols(m)).toEqual(["C", "F", "G"]);
    expect(m.harmony?.labels.map((l) => [l.bar, l.beat, l.symbol])).toEqual([
      [0, 1, "C"],
      [1, 1, "F"],
      [1, 3, "G"],
    ]);
  });

  test("a melody over the Band's chords shows the Band's chords (and its bass decides the inversion)", async () => {
    const band = `chords: n("<[0,2,4] [3,5,7]>").scale("C3:major").s("piano")
bass: note("<c2 f2>").s("piano")`;
    const code = 'mel: n("<[4 2 0 2] [5 3 5 7]>").scale("C4:major").s("piano")';
    const m = await model(code, 2, {}, band);
    expect(m.harmony?.source).toBe("band");
    expect(symbols(m)).toEqual(["C", "F"]);
    expect(numerals(m)).toEqual(["I", "IV"]);
  });

  test("no chords anywhere: no band", async () => {
    const m = await model('mel: n("0 2 4 2").scale("C4:major").s("piano")', 1);
    expect(m.harmony).toBeNull();
  });
});

describe("the chord-tone lens", () => {
  test("the toolbox demo: E C on beats 1 and 3 over C are chord tones; bar 2's F A over F too", async () => {
    const code = `chords: n("<[0,2,4] [3,5,7]>").scale("C3:major").s("piano")
mel: n("<[4 2 0 2] [5 3 5 7]>").scale("C4:major").s("piano")`;
    expect(await midisOf('mel: n("<[4 2 0 2] [5 3 5 7]>").scale("C4:major")', 2)).toEqual([
      67, 64, 60, 64, 69, 65, 69, 72,
    ]);
    const m = await model(code, 2);
    const h = m.harmony;
    expect(h?.strong).toEqual({ total: 4, chordTones: 4 });
    expect(chordTonePercent(h ?? null)).toBe(100);
    const roles = [...(h?.melody.values() ?? [])].map((x) => x.role);
    expect(roles.every((r) => r === "chord-tone")).toBe(true);
  });

  test("a passing tone between two chord tones is tagged", async () => {
    const code = `chords: n("[0,2,4]").scale("C3:major").s("piano")
mel: n("2 1 0 ~").scale("C5:major").s("piano")`;
    const m = await model(code, 1);
    const roles = [...(m.harmony?.melody.values() ?? [])].map((x) => x.role);
    expect(roles).toEqual(["chord-tone", "passing", "chord-tone"]);
    expect(chordTonePercent(null)).toBeNull();
  });
});

describe("the range lens", () => {
  test("the toolbox demo's line spans C4 to C5: 12 half steps, high point in bar 2", async () => {
    const code = 'mel: n("<[0 2 4 2] [4 5 7 ~] [5 4 2 1] [0 ~ ~ ~]>").scale("C4:major").s("piano")';
    const m = await model(code, 4);
    const lines = rangeLines(m.events);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ track: "mel", low: { midi: 60 }, high: { midi: 72, bar: 2 }, span: 12 });
  });

  test("a chord track is not a line", async () => {
    const m = await model('chords: n("[0,2,4]").scale("C3:major").s("piano")', 1);
    expect(rangeLines(m.events)).toEqual([]);
  });
});

describe("chord labels on the staff and the lead sheet", () => {
  test("symbols above and numerals below, only as the lenses say", async () => {
    const code = 'chords: n("<[0,2,4] [4,6,8]>").scale("C4:major").s("piano")';
    const m = await model(code, 2);
    const src = m.staffSource;
    if (!src) throw new Error("no staff");
    expect(src.chordLabels?.map((l) => l.symbol)).toEqual(["C", "G"]);
    const both = staffPage({ ...src, chordSet: { symbols: true, romans: true } }, 0);
    expect(both.score && chordLabelTexts(both.score)).toEqual({ symbols: ["C", "G"], romans: ["I", "V"] });
    const none = staffPage(src, 0);
    expect(none.score && chordLabelTexts(none.score)).toEqual({ symbols: [], romans: [] });
    expect(staffChordLabels(m.harmony, { symbols: false, romans: false })).toBeUndefined();
    expect(staffChordLabels(m.harmony, { symbols: true })).toHaveLength(2);
  });

  test("the lead sheet is the melody line alone, and a pickup bar is engraved as bar 0", async () => {
    // 3/4 with a one-beat pickup: the pickup note G4, then C E G over C and F A C over F.
    const code = `setcpm(90/3)
chords: n("<~ [0,2,4] [3,5,7]>").scale("C3:major").s("piano")
mel: n("<[~ ~ 4] [0 2 4] [3 5 7]>").scale("C4:major").s("piano")`;
    const m = await model(code, 3, { meter: "3/4", pickup: { units: [1, 1] } });
    const lead = leadEvents(m);
    expect(new Set(lead.map((e) => e.track))).toEqual(new Set(["mel"]));
    expect(lead.map((e) => e.midi)).toEqual([67, 60, 64, 67, 65, 69, 72]);
    expect(m.harmony?.view.pickup).toBe(true);
    expect(m.harmony?.labels.map((l) => [l.bar, l.symbol])).toEqual([
      [1, "C"],
      [2, "F"],
    ]);
    const src = m.staffSource;
    if (!src) throw new Error("no staff");
    const sheet = staffPage({ ...src, events: lead, staff: "lead", chordSet: { symbols: true } }, 0);
    expect(sheet.error).toBeNull();
    expect(sheet.score?.pickup).toBe(true);
    expect(sheet.score && chordLabelTexts(sheet.score).symbols).toEqual(["C", "F"]);
    expect(sheet.score?.staves).toHaveLength(1);
  });
});

describe("panels: the lenses outside a step, the step inside one", () => {
  const all = new Set([...Object.values(PANEL_UNLOCKS), "tb.arp", "tb.feature.chord-symbols"]);
  const ctx = { allowed: true, unlocked: all, hasStaff: true, hasRoll: true } as const;

  test("lens mode: every unlocked panel has a switch; the chord band follows the chord lenses", () => {
    const a = panelAvailability({ ...ctx, mode: "lenses" });
    expect(a).toMatchObject({
      key: true,
      circle: true,
      function: true,
      range: true,
      "chord-tones": true,
      lead: true,
    });
    expect(a.chords).toBe(false);
    const locked = panelAvailability({ ...ctx, mode: "lenses", unlocked: new Set(["tb.feature.keysig"]) });
    expect(Object.entries(locked).filter(([, on]) => on)).toEqual([["key", true]]);
    expect(panelAvailability({ ...ctx, mode: "lenses", hasStaff: false }).lead).toBe(false);
    expect(panelAvailability({ ...ctx, mode: "lenses", allowed: false })).toEqual(NO_PANELS);
  });

  test("content mode: only what the step opens, when unlocked", () => {
    const initial = { key: false, circle: true, chords: true, function: false };
    const a = panelAvailability({ ...ctx, mode: "content", initial });
    expect(
      Object.entries(a)
        .filter(([, on]) => on)
        .map(([id]) => id),
    ).toEqual(["circle", "chords"]);
    const notYet = panelAvailability({ ...ctx, mode: "content", initial, unlocked: new Set() });
    expect(notYet).toEqual(NO_PANELS);
    expect(initialPanelState({ key: true }, initial, "content")).toMatchObject({ key: false, circle: true });
    expect(initialPanelState({ key: true }, undefined, "lenses").key).toBe(true);
    expect(initialPanelState({ key: true }, undefined, "content").key).toBe(false);
  });

  test("what the chord band and the staff show", () => {
    const lenses = {
      shown: { chordSymbols: true, romanNumerals: false },
      available: { chordSymbols: true, romanNumerals: false },
    };
    expect(chordDisplay("lenses", NO_PANELS, lenses, all)).toEqual({
      band: true,
      symbols: true,
      romans: false,
      fn: false,
    });
    expect(chordDisplay("lenses", { ...NO_PANELS, function: true }, null, all)).toEqual({
      band: true,
      symbols: false,
      romans: false,
      fn: true,
    });
    expect(chordDisplay("content", { ...NO_PANELS, chords: true }, null, all)).toEqual({
      band: true,
      symbols: true,
      romans: true,
      fn: false,
    });
    expect(chordDisplay("content", NO_PANELS, lenses, all).band).toBe(false);
  });

  test("every panel switch and chord lens key is in the shortcut sheet", () => {
    const keys = WORKBENCH_LOOP_SHORTCUTS.map(([k]) => k);
    for (const p of PANEL_SWITCHES) expect(keys).toContain(p.keys);
    expect(keys).toContain("Shift+H");
    expect(keys).toContain("Shift+R");
  });
});

describe("Strudel's voicing of the learner's changes", () => {
  test("one chord a bar: <C F G C>; theory and Strudel agree on what voicing() plays", async () => {
    const code = `chords: note("<[c4,e4,g4] [c4,f4,a4] [b3,d4,g4] [c4,e4,g4]>").s("piano")
bass: note("<c2 f2 g2 c2>").s("piano")`;
    const m = await model(code, 4, { key: C });
    if (!m.harmony) throw new Error("no harmony");
    expect(numerals(m)).toEqual(["I", "IV", "V", "I"]);
    const pattern = changesAsChordPattern(m.harmony, 4);
    expect(pattern).toBe("<C F G C>");
    const strudel = await evalHeadless(`chords: chord("${pattern}").voicing()`, 4);
    const bar3 = strudel.events.filter((e) => e.onset === 2).map((e) => (e.midi as number) % 12);
    expect(new Set(bar3)).toEqual(new Set([7, 11, 2]));
    expect(romanText(readChord(bar3, 7)?.chord as never, C)).toBe("V");
  });

  test("two chords in a bar become a subdivision", async () => {
    const code = 'chords: n("[[0,2,4] [0,2,4] [3,5,7] [4,6,8]]").scale("C3:major").s("piano")';
    const m = await model(code, 1);
    if (!m.harmony) throw new Error("no harmony");
    expect(changesAsChordPattern(m.harmony, 1)).toBe("[C@2 F G]");
  });
});
