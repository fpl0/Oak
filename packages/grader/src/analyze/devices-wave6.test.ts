// The six devices of the Core Finale (contracts §6.6 CF-A), as the finale spec defines them ("The six devices:
// what counts"): each is found with the bar it first sounds in, and one musical event is one device. Real Strudel
// 1.2.6 output.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import type { KeySpec } from "@oak/content-kit";
import { CORE_DEVICES, DEVICE_NAMES } from "@oak/content-kit";
import { strudel } from "./__support__/fixtures.ts";
import { keyChangesByBar, keysByBar } from "./key-plan.ts";
import { analyzePiece, detectDevices, MODULATION_MIN_BARS, SYNCOPATED_BASS_MIN } from "./piece.ts";
import { sectionsFromAst } from "./sections.ts";
import { chromaticHarmonyView } from "./wave6-views.ts";

setDefaultTimeout(30_000);
const C: KeySpec = { tonic: "C", mode: "major" };
async function devices(code: string, key: KeySpec = C, bars?: number) {
  const s = sectionsFromAst(code);
  const total = bars ?? (s && "totalBars" in s ? s.totalBars : 8);
  const n = await strudel(code, total);
  return detectDevices(n, { meter: "4/4", key, bars: total, code });
}
const names = (d: { device: string }[]): string[] => [...new Set(d.map((x) => x.device))];
const chords = (bars: string): string => `chords: chord("<${bars}>").voicing()`;

test("every device the detector names is one of content-kit's", async () => {
  expect(CORE_DEVICES).toEqual([
    "secondary dominant",
    "borrowed chord",
    "modulation",
    "suspension",
    "syncopated bass",
    "modal colour",
  ]);
  const all = await devices(chords("C E7 Am Fm C Bb F C"));
  for (const d of all) expect(DEVICE_NAMES as readonly string[]).toContain(d.device);
});

describe("secondary dominant: it goes where it points", () => {
  test("E7 → Am counts, with its bar; D7 → F does not", async () => {
    const d = await devices(chords("C E7 Am F"), C, 4);
    expect(d).toEqual([{ device: "secondary dominant", bar: 2, text: "V7/vi→vi bar 2" }]);
    expect(await devices(chords("C D7 F C"), C, 4)).toEqual([]);
  });
  test("the dominant that leads into a new key is that key's own V", async () => {
    const code = `const chordsVerse = chord("<C Am F G C Am D7 D7>").voicing()
const chordsBridge = chord("<G Em C D>").voicing()
const melVerse = n("<[0 2 4 2] [4 2 1 ~]>")
const melBridge = n("<[0 2 4 2] [4 2 1 ~]>")
chords: arrange([8, chordsVerse], [8, chordsBridge], [8, chordsVerse]).s("piano")
mel: arrange([8, melVerse], [8, melBridge], [8, melVerse]).scale("<C4:major!8 G4:major!8 C4:major!8>").s("piano")`;
    const d = await devices(code);
    // D7 in bars 7–8 is V7 of G, the key of the bridge: a modulation, and no secondary dominant.
    expect(d).toEqual([{ device: "modulation", bar: 9, bars: 8, text: "modulation to G major bar 9" }]);
  });
});

describe("borrowed chord and modal colour: ♭VII counts once", () => {
  test("I–♭VII–IV alone is the Mixolydian colour", async () => {
    expect(names(await devices(chords("C Bb F C")))).toEqual(["modal colour"]);
  });
  test("♭VII beside ♭VI is a borrowed chord; so is iv", async () => {
    const d = await devices(chords("C F Ab Bb C C C C"));
    expect(d.map((x) => x.text)).toEqual(["bVI borrowed bar 3", "bVII borrowed bar 4"]);
    expect(names(await devices(chords("C Fm C G")))).toEqual(["borrowed chord"]);
  });
  test("in a minor key: the Dorian IV and the Picardy I, and no false key change", async () => {
    const code = `${chords("Am D Am E Am D E A")}\nmel: n("<[0 2 4 2] [4 2 1 ~]>").scale("A4:minor").s("piano")`;
    const d = await devices(code, { tonic: "A", mode: "minor" });
    expect(d.map((x) => x.text)).toEqual(["IV borrowed bar 2", "IV borrowed bar 6", "I borrowed bar 8"]);
  });
  test("a section on a modal scale with its colour note on strong beats is modal colour, and only that", async () => {
    const code = `const chordsVerse = chord("<C Am F G>").voicing()
const chordsBridge = chord("<Dm G Dm G>").voicing()
const melVerse = n("<[0 2 4 2] [4 2 1 ~]>").scale("C4:major")
const melBridge = n("<[5 4 2 4] [5 ~ 4 2]>").scale("D4:dorian")
chords: arrange([8, chordsVerse], [8, chordsBridge], [8, chordsVerse]).s("piano")
mel: arrange([8, melVerse], [8, melBridge], [8, melVerse]).s("piano")`;
    expect(await devices(code)).toEqual([
      { device: "modal colour", bar: 9, bars: 8, text: "Dorian colour bar 9" },
    ]);
  });
});

describe("modulation: eight bars or more in the new key, from the code's key plan", () => {
  const lift = (bars: number) => `const chordsVerse = chord("<C Am F G>").voicing()
const chordsChorus2 = chord("<D Bm G A>").voicing()
const melVerse = n("<[0 2 4 2] [4 2 1 ~]>")
const melChorus2 = n("<[0 2 4 2] [4 2 1 ~]>")
chords: arrange([8, chordsVerse], [${bars}, chordsChorus2]).s("piano")
mel: arrange([8, melVerse], [${bars}, melChorus2]).scale("<C4:major!8 D4:major!${bars}>").s("piano")`;
  test("a lifted last chorus of eight bars counts; four bars do not", async () => {
    expect(MODULATION_MIN_BARS).toBe(8);
    expect(await devices(lift(8))).toEqual([
      { device: "modulation", bar: 9, bars: 8, text: "modulation to D major bar 9" },
    ]);
    expect(names(await devices(lift(4)))).toEqual([]);
  });
});

describe("suspension and syncopated bass", () => {
  test("a 4–3 suspension in the tune is found at its bar", async () => {
    const code = `${chords("C F C G")}\nmel: n("<[4 ~ 4 2] [0 ~ ~ ~] [3 4 5 7] [7@2 6@2]>").scale("C4:major").s("piano")`;
    expect((await devices(code, C, 4)).map((x) => x.text)).toEqual(["suspension bar 4"]);
  });
  test("a bass between the beats needs four such notes; one pushed bar is not a device", async () => {
    expect(SYNCOPATED_BASS_MIN).toBe(4);
    const pushed = `${chords("C F G C")}\nbass: n("<0 3 4 0>").struct("x ~ ~ x ~ x ~ ~").scale("C2:major").s("sawtooth")`;
    expect(names(await devices(pushed, C, 4))).toEqual(["syncopated bass"]);
    const once = `${chords("C F G C")}\nbass: note("<[c2 ~ ~ c2 ~ c2 ~ ~] [f2 ~ f2 ~] [g2 ~ g2 ~] [c2 ~ c2 ~]>").s("sawtooth")`;
    expect(names(await devices(once, C, 4))).toEqual([]);
  });
});

test("the summary carries the devices as text and as data, in bar order", async () => {
  const code = chords("C E7 Am Fm");
  const n = await strudel(code, 4);
  const a = analyzePiece(n, { meter: "4/4", key: C, code, bars: 4 });
  expect(a.devices).toEqual(["V7/vi→vi bar 2", "iv borrowed bar 4"]);
  expect(a.deviceList).toEqual([
    { device: "secondary dominant", bar: 2, text: "V7/vi→vi bar 2" },
    { device: "borrowed chord", bar: 4, text: "iv borrowed bar 4" },
  ]);
});

describe("the views name chords as the rules do", () => {
  const LIFT = `setcpm(100/4)
const chordsVerse = chord("<C Am F G>").voicing()
const chordsChorus2 = chord("<D Bm G A>").voicing()
const melVerse = n("<[0 2 4 2] [4 2 1 ~]>")
const melChorus2 = n("<[0 2 4 2] [4 2 1 ~]>")
chords: arrange([4, chordsVerse], [4, chordsChorus2]).s("piano")
mel: arrange([4, melVerse], [4, melChorus2]).scale("<C4:major!4 D4:major!4>").s("piano")`;
  test("a lifted section keeps its numerals: I vi IV V before and after, and no applied chord", async () => {
    const n = await strudel(LIFT, 8);
    const v = chromaticHarmonyView(n, { meter: "4/4", key: C, code: LIFT, bars: 8 });
    expect(v.chords.map((c) => c.rn)).toEqual(["I", "vi", "IV", "V", "I", "vi", "IV", "V"]);
    expect(v.chords.map((c) => c.key.tonic)).toEqual(["C", "C", "C", "C", "D", "D", "D", "D"]);
    expect([v.applied, v.borrowed]).toEqual([0, 0]);
    expect(
      keysByBar(n, 8, { key: C, code: LIFT })
        .map((k) => k.tonic)
        .join(""),
    ).toBe("CCCCDDDD");
    expect(keyChangesByBar(keysByBar(n, 8, { key: C, code: LIFT }))).toMatchObject([{ bar: 4, bars: 4 }]);
  });
  test("a tune on another scale name over the brief's key does not rename the chords", async () => {
    // A minor pentatonic over a piece in C major: the same notes; the chords stay I vi IV V of C.
    const code = `chords: chord("<C Am F G>").voicing()\nmel: n("<[0 1 2 3] [4 3 2 1]>").scale("A3:minor:pentatonic").s("piano")`;
    const n = await strudel(code, 4);
    const v = chromaticHarmonyView(n, { meter: "4/4", key: C, code, bars: 4 });
    expect(v.chords.map((c) => c.rn)).toEqual(["I", "vi", "IV", "V"]);
    // And a line with .transpose() after .scale() is not trusted to say the key (contracts §6.8 item 3).
    const moved = `chords: chord("<C Am F G>").voicing()\nmel: n("0 2 4 2").scale("C4:major").transpose("<0 0 2 2>").s("piano")`;
    const m = await strudel(moved, 4);
    expect(keysByBar(m, 4, { key: C, code: moved }).every((k) => k.tonic === "C")).toBe(true);
  });
  test("an authored key plan wins (ExBase.keyPlan), bar 1 being cycle 0", async () => {
    const code = 'chords: chord("<C G D A>").voicing()';
    const n = await strudel(code, 4);
    const plan = [
      { bar: 1, key: C },
      { bar: 3, key: { tonic: "D", mode: "major" } as KeySpec },
    ];
    expect(keysByBar(n, 4, { key: C, keyPlan: plan }).map((k) => k.tonic)).toEqual(["C", "C", "D", "D"]);
    expect(keysByBar(n, 4, { key: C, keyPlan: plan, pickup: true }).map((k) => k.tonic)).toEqual([
      "C",
      "C",
      "C",
      "D",
    ]);
  });
});
