// Wave 6 review (review:surfaces): regressions for what the adversarial pass over the Workbench found.
// - The key ribbon named a step down "+10: down a step" and B♭ after D "+8 … 8 half steps up": `keyDistance` counts
//   0–11 half steps up, the ribbon now writes the shorter way, signed, as Transcribe does ("−2", "−4 … down").
// - A piece that changes key five times: every span on the ribbon, each chord read in its own key, every head on
//   the staff the pitch the code plays, each bar under its own signature.
// - The guide-tone line over the roll wrote the code's "F#" and "E#" where every other text writes F♯ and E♯.
// - A melody note doubled by the chord under it (U12.L05's guide-tone line on Am7) is one head on the staff but got
//   two texts ("♭3~♭3", "me~me"): a unison is labelled once.
// - Seven sharps with a secondary dominant: V7/V, its guide tones F𝄪 and C♯, the melody's ♯4 labelled "♯4 fi".
import { beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { evaluateForGrading, initRealm } from "@oak/grader";
import { readBack } from "../../../packages/notation/corpus/harness.ts";
import { annotationText } from "./annotate.ts";
import { guideLineShort, guideLineText, keyChangeText, keyRibbonOf, signedSemitones } from "./colour.ts";
import { pieceBarsOf } from "./lines.ts";
import { buildModel, staffPage, staffPageCount, type WorkbenchModel } from "./model.ts";

setDefaultTimeout(60_000);
beforeAll(async () => {
  await initRealm({ toolbox: [], lockdown: false });
});

async function model(code: string, bars: number): Promise<WorkbenchModel> {
  const r = await evaluateForGrading(code, { mode: "lesson", bars: pieceBarsOf(code, bars), lint: null });
  const out = buildModel(code, r, { meter: "4/4", key: null, staff: "auto" });
  if (!out.ok) throw new Error(out.error.message);
  return out.model;
}

const FIVE = `setcpm(100/4)
mel: n("<[0 2 4 7] [0 2 4 7] [0 2 4 7] [0 2 4 7] [0 2 4 7] [0 2 4 7]>").scale("<C4:major D4:major Bb3:major E4:major Ab3:major F#4:major>").s("piano")
ch: chord("<C^7 D^7 Bb^7 E^7 Ab^7 F#^7>").voicing().s("piano")`;

const SEVEN = `setcpm(90/4)
mel: n("<[0 2 4 6] [1 3# 5 0] [4 6 1 3] [0 ~ ~ ~]>").scale("C#4:major").s("piano")
ch: chord("<C#^7 D#7 G#7 C#^7>").voicing().s("piano")`;

describe("the key ribbon's change marks", () => {
  test("signed the shorter way: a step down is −2, a tritone +6", () => {
    expect([0, 1, 2, 5, 6, 7, 8, 10, 11].map(signedSemitones)).toEqual([0, 1, 2, 5, 6, -5, -4, -2, -1]);
    expect(keyChangeText({ semitones: 10, relation: "down-step" })).toBe("−2: down a step");
    expect(keyChangeText({ semitones: 7, relation: "dominant" })).toBe("−5: to the key a fifth up");
    expect(keyChangeText({ semitones: 8, relation: "other" })).toBe("−4");
  });

  test("five changes of key: one span each, marks and words agree with each other", async () => {
    const m = await model(FIVE, 6);
    const keys = m.colour?.keys ?? [];
    expect(keys.map((k) => k.text)).toEqual([
      "C major",
      "D major",
      "B♭ major",
      "E major",
      "A♭ major",
      "F♯ major",
    ]);
    expect(keys.map((k) => k.change?.text ?? null)).toEqual([
      null,
      "+2: up a step",
      "−4",
      "+6",
      "+4",
      "−2: down a step",
    ]);
    expect(keys[2]?.change?.words).toBe("D major to B♭ major, 4 half steps down; 3 notes in common");
    expect(keys[3]?.change?.words).toBe("B♭ major to E major, 6 half steps up; 2 notes in common");
    for (const k of keys.slice(1)) {
      const s = k.change?.semitones ?? 0;
      expect(Math.abs(s)).toBeLessThanOrEqual(6);
      if (/down/.test(k.change?.words ?? "")) expect(s).toBeLessThan(0);
    }
    // The guide-tone line over the roll writes F♯ and E♯ as the rest of the screen does, never "F#".
    const lines = m.colour?.guide.lines ?? [];
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) {
      expect(guideLineText(l)).not.toMatch(/[#]|[A-G]b/);
      expect(guideLineShort(l)).not.toMatch(/[#]|[A-G]b/);
    }
    expect(lines.map(guideLineText).join(" ")).toContain("F♯");
    // The ribbon built from the same plan is the model's.
    expect(keyRibbonOf({ spans: [], changes: [] }, 6)).toEqual([]);
  });

  test("five changes of key: each chord is I in its own key; the staff draws every pitch under its signature", async () => {
    const m = await model(FIVE, 6);
    expect(m.harmony?.labels.map((l) => l.rn)).toEqual([
      "Imaj7",
      "Imaj7",
      "Imaj7",
      "Imaj7",
      "Imaj43",
      "Imaj43",
    ]);
    const mel = m.events.filter((e) => e.track === "mel");
    expect(mel.filter((e) => e.label?.degree?.label === "1").length).toBe(12);
    expect(mel.map((e) => e.label?.name).slice(20)).toEqual(["F#4", "A#4", "C#5", "F#5"]);
    const src = m.staffSource;
    if (!src) throw new Error("no staff");
    const sigs: string[] = [];
    for (let p = 0; p < staffPageCount(src); p++) {
      const pg = staffPage(src, p);
      expect(pg.error).toBeNull();
      const abc = pg.abc?.abc ?? "";
      sigs.push(...[...abc.matchAll(/\[K:([^\] ]+)\]|^K:(\S+)/gm)].map((x) => x[1] ?? x[2] ?? ""));
      const got = readBack(abc)
        .staves.flatMap((s) => s.voices.flat())
        .flatMap((n) => n.midis)
        .sort((a, b) => a - b);
      const want = src.events
        .filter((e) => e.midi !== null && Math.floor(e.onset[0] / e.onset[1]) >= pg.startBar)
        .filter((e) => Math.floor(e.onset[0] / e.onset[1]) < pg.startBar + pg.bars)
        .map((e) => e.midi as number)
        .sort((a, b) => a - b);
      expect(got).toEqual(want);
    }
    for (const k of ["C", "D", "Bb", "E", "Ab", "F#"]) expect(sigs).toContain(k);
  });
});

describe("seven sharps with a secondary dominant", () => {
  test("D♯7 in C♯ major: V7/V that resolves, guide tones F𝄪 and C♯, the ♯4 read as fi", async () => {
    const m = await model(SEVEN, 4);
    expect(m.key).toEqual({ tonic: "C#", mode: "major" });
    const v = m.colour?.regions[1];
    expect(v?.rn).toBe("V7/V");
    expect(v?.kind).toBe("applied");
    expect(v?.resolves).toBe(true);
    expect(v?.guide).toEqual({ third: "F##", seventh: "C#" });
    const fi = m.events.find((e) => e.track === "mel" && e.midi === 67);
    expect(fi?.label?.name).toBe("F##4");
    expect(fi?.label?.degree?.label).toBe("♯4");
    expect(fi?.label?.degree?.syllable).toBe("fi");
    const abc = m.abc?.abc ?? "";
    expect(abc).toContain("K:C#");
    expect(abc).toContain("^^F");
  });
});

describe("a unison under the staff", () => {
  const U1205 = `setcpm(96/4)
chords: chord("<Am7 Am7>").voicing().s("rhodes")
mel: note("<c5 c5>").s("piano")`;
  test("the melody's C5 doubled by the voicing's top note: one head, one text per line", async () => {
    const r = await evaluateForGrading(U1205, { mode: "lesson", bars: 2, lint: null });
    const out = buildModel(U1205, r, {
      meter: "4/4",
      key: { tonic: "A", mode: "minor" },
      staff: "auto",
      annotations: { degree: true, solfege: true, noteName: true },
    });
    if (!out.ok) throw new Error(out.error.message);
    const abc = out.model.abc?.abc ?? "";
    const lyrics = abc.split("\n").filter((l) => l.startsWith("w:"));
    expect(lyrics.length).toBeGreaterThan(0);
    for (const l of lyrics) expect(l).not.toMatch(/(♭3|me|C)~\1(?![♯♭\w])/);
    const c5 = out.model.events.filter((e) => e.midi === 72).map((e) => e.label);
    expect(c5.length).toBeGreaterThanOrEqual(2);
    expect(annotationText(c5, { degree: true, solfege: true, noteName: true })).toEqual({
      degree: "♭3",
      solfege: "me",
      noteName: "C5",
    });
  });
});
