// Wave 5 in the Workbench, against real Strudel (the grader realm in-process): the form read from `arrange()` (the
// section ribbon, the form map, the energy curve, a disagreement said in words, the bars a song is analysed for),
// the bass-role and blue-note lenses, the swing badge, minor keys (degrees, numerals, the relative and parallel
// key moves), the scope panel's geometry and probes, and the Wave 5 panels' rules. Musical facts are cross-checked
// with headless Strudel or @oak/theory.
import { beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { evaluateForGrading, initRealm } from "@oak/grader";
import { evalHeadless, midisOf } from "@oak/grader/testing";
import { adsrValues, type FilterProbe, filterCurve } from "@oak/strudel/probes";
import { blueNoteOf } from "@oak/theory";
import { sectionLoopOf } from "../lib/form-view.ts";
import { annotationText, raiseNumerals } from "./annotate.ts";
import { keyTwinsOf, modeText, moveKey } from "./key-tools.ts";
import {
  alternationBars,
  BASS_TAG,
  bluesText,
  chartChordsOf,
  energyPath,
  firstContrast,
  formLetters,
  pieceBarsOf,
  sectionBarsText,
  sectionLabel,
  swingBadges,
} from "./lines.ts";
import { buildModel, type ModelOptions, type WorkbenchModel } from "./model.ts";
import { pitchLabel } from "./music.ts";
import { initialPanelState, NO_PANELS, PANEL_IDS, PANEL_SWITCHES, panelAvailability } from "./panels.ts";
import {
  delayGeometry,
  envelopeGeometry,
  f0OfHap,
  filterCaption,
  filterGeometry,
  fitWave,
  harmonicRows,
  isSilent,
  probesInHap,
  spectrumBars,
  wavePoints,
} from "./scope-view.ts";
import { WORKBENCH_LOOP_SHORTCUTS } from "./shortcuts.ts";

setDefaultTimeout(30_000);

beforeAll(async () => {
  await initRealm({ toolbox: [], lockdown: false });
});

async function model(code: string, bars: number, opts: Partial<ModelOptions> = {}): Promise<WorkbenchModel> {
  const result = await evaluateForGrading(code, { mode: "lesson", bars, lint: null });
  const out = buildModel(code, result, { meter: "4/4", key: null, staff: "auto", ...opts });
  if (!out.ok) throw new Error(`${out.error.kind}: ${out.error.message}`);
  return out.model;
}

// Verse–chorus–verse–chorus, four bars each: the chorus adds hats, a higher tune and a busier kick.
const VCVC = `setcpm(100/4)
const drumsVerse = s("bd ~ sd ~")
const drumsChorus = s("[bd bd] sd [bd bd] sd, hh*8")
const melVerse = n("<0 2 4 2>").scale("C4:major").s("piano")
const melChorus = n("<[7 9] [9 7] [11 9] 7>").scale("C4:major").s("piano")
drums: arrange([4, drumsVerse], [4, drumsChorus], [4, drumsVerse], [4, drumsChorus])
mel: arrange([4, melVerse], [4, melChorus], [4, melVerse], [4, melChorus])`;

describe("the form view reads the code's arrange()", () => {
  test("a 16-bar song is analysed whole, not as the step's 4-bar loop", () => {
    expect(pieceBarsOf(VCVC, 4)).toBe(16);
    expect(pieceBarsOf('mel: n("0 2 4").scale("C4:major")', 4)).toBe(4);
    // A code mid-edit that does not parse keeps the loop's bars.
    expect(pieceBarsOf("drums: arrange([4, drumsVerse", 4)).toBe(4);
  });

  test("V C V C: sections, letters, tracks, energy and the contrast", async () => {
    const m = await model(VCVC, 16);
    const lines = m.lines;
    expect(lines).toBeTruthy();
    if (!lines) return;
    expect(lines.problem).toBeNull();
    expect(lines.sections.map((s) => [s.text, s.startBar, s.bars])).toEqual([
      ["Verse", 0, 4],
      ["Chorus", 4, 4],
      ["Verse", 8, 4],
      ["Chorus", 12, 4],
    ]);
    expect(formLetters(lines.sections)).toBe("A B A B");
    const [verse, chorus] = lines.sections;
    expect(chorus?.energy ?? 0).toBeGreaterThan(verse?.energy ?? 1);
    expect(lines.form.kind === "sections" ? lines.form.energy.length : 0).toBe(16);
    const c = firstContrast(lines.form);
    expect(c?.a).toBe("Verse");
    expect(c?.b).toBe("Chorus");
    expect(c?.axes).toContain("density");
    // Headless Strudel agrees: the chorus's first tune note is C5 (degree 8), the verse's C4.
    const ev = (await evalHeadless(VCVC, 16)).events.filter((e) => e.track === "mel");
    expect(ev.find((e) => e.onset === 0)?.midi).toBe(60);
    expect(ev.find((e) => e.onset === 4)?.midi).toBe(72);
    // The staff carries the section marks: a label and a double bar at each section.
    expect(m.staffSource?.sections?.map((s) => [s.bar, s.text, s.doubleBar])).toEqual([
      [0, "Verse", false],
      [4, "Chorus", true],
      [8, "Verse", true],
      [12, "Chorus", true],
    ]);
  });

  test("a section loop is the section's bars; labels count from the first full bar after a pickup (c4)", async () => {
    const m = await model(VCVC, 16);
    const chorus = m.lines?.sections[1];
    if (!chorus) throw new Error("no chorus");
    expect(sectionLoopOf(chorus)).toEqual({ from: 4, bars: 4, tag: "chorus" });
    expect(sectionBarsText(chorus, false)).toBe("bars 5–8");
    expect(sectionBarsText(chorus, true)).toBe("bars 4–7");
    expect(sectionLabel(chorus, false)).toMatch(/^Chorus, bars 5–8, energy \d+%$/);
  });

  test("tracks that disagree are said in words, never drawn as a wrong form", async () => {
    const code = `const drumsVerse = s("bd sd")
const drumsChorus = s("bd*4")
const melVerse = n("0 2").scale("C4:major")
const melChorus = n("4 7").scale("C4:major")
drums: arrange([4, drumsVerse], [4, drumsChorus])
mel: arrange([2, melVerse], [6, melChorus])`;
    const m = await model(code, 8);
    expect(m.lines?.sections).toEqual([]);
    expect(m.lines?.problem).toBeTruthy();
  });

  test("with no arrange() there are no sections, and the phrases still read as letters", async () => {
    const m = await model('mel: n("<0 2 4 2 0 2 4 2>").scale("C4:major")', 8);
    expect(m.lines?.sections).toEqual([]);
    expect(m.lines?.problem).toBeNull();
    expect(m.lines?.form.kind).toBe("through");
  });

  test("the energy curve is a path with a point per bar", () => {
    const d = energyPath([0, 0.5, 1], 300, 30);
    expect(d.split(/[ML]/).filter(Boolean)).toHaveLength(3);
    expect(d.startsWith("M50.0,29.0")).toBe(true);
    expect(d.endsWith("L250.0,1.0")).toBe(true);
  });
});

describe("the bass-role lens", () => {
  test("root, fifth, octave and an approach into the next chord (C to Am)", async () => {
    // Bar 1 over C: C2 G2 C3 then B1 (a step above A, not a tone of C); bar 2 over Am: A1.
    const code = `chords: chord("<C Am>").voicing().s("piano")
bass: note("<[c2 g2 c3 b1] [a1 e2 a2 e2]>").s("sawtooth").lpf(600)`;
    const m = await model(code, 2);
    const bass = m.events.filter((e) => e.track === "bass");
    const tags = bass.map((e) => m.lines?.bassMarks.get(e.id)?.tag);
    expect((await evalHeadless(code, 2)).events.filter((e) => e.track === "bass").map((e) => e.midi)).toEqual(
      [36, 43, 48, 35, 33, 40, 45, 40],
    );
    expect(tags.slice(0, 5)).toEqual([
      BASS_TAG.root,
      BASS_TAG.fifth,
      BASS_TAG.octave,
      BASS_TAG.approach,
      BASS_TAG.root,
    ]);
    expect(m.lines?.bassMarks.get(bass[3]?.id ?? "")?.words).toMatch(/approach/);
  });

  test("in a minor key the roles read the same (Am to E)", async () => {
    const code = `chords: chord("<Am E>").voicing().s("piano")
bass: note("<[a1 e2 a2 e2] [e2 b2 e2 b1]>").s("sawtooth").lpf(600)`;
    const m = await model(code, 2, { key: { tonic: "A", mode: "minor" } });
    const bass = m.events.filter((e) => e.track === "bass");
    expect(bass.slice(0, 3).map((e) => m.lines?.bassMarks.get(e.id)?.tag)).toEqual(["R", "5", "8"]);
    expect(m.lines?.bassMarks.get(bass[4]?.id ?? "")?.tag).toBe("R");
  });
});

describe("the blue-note lens and the swing badge", () => {
  test("blue notes in a C blues riff: ♭3, ♭5 and ♭7 marked, the rest not", async () => {
    const code = 'riff: n("0 1 2 3 4 5").scale("C4:blues").s("piano")';
    const m = await model(code, 1, { key: { tonic: "C", mode: "major" } });
    const riff = m.events.filter((e) => e.track === "riff");
    // Headless: C E♭ F G♭ G B♭.
    expect(riff.map((e) => e.midi)).toEqual([60, 63, 65, 66, 67, 70]);
    expect(riff.map((e) => m.lines?.blue.get(e.id)?.degree ?? null)).toEqual([
      null,
      "b3",
      null,
      "b5",
      null,
      "b7",
    ]);
    expect(blueNoteOf(63, { tonic: "C", mode: "major" })?.syllable).toBe("me");
  });

  test("in a blues the degree lens reads the blue five as ♭5 (se), as the staff does; outside it ♯4 (closer)", async () => {
    const key = { tonic: "C", mode: "major" } as const;
    const blues = await model(
      'chords: chord("<C7 F7>").voicing().s("piano")\nmel: note("<[c4 eb4 f4 f#4 g4]>").s("piano")',
      2,
      { key },
    );
    const sharp = blues.events.find((e) => e.midi === 66);
    expect(sharp?.label?.degree).toMatchObject({ label: "♭5", syllable: "se" });
    expect(sharp?.label?.display).toBe("F♯4");
    const plain = await model('mel: note("<[c4 e4 f4 f#4 g4]>").s("piano")', 1, { key });
    expect(plain.events.find((e) => e.midi === 66)?.label?.degree?.label).toBe("♯4");
    expect(pitchLabel(66, key, undefined, 1, undefined, true).degree?.syllable).toBe("se");
  });

  test("a chord's seventh is not a blue note", async () => {
    const m = await model('chords: chord("C7").voicing().s("piano")', 1, {
      key: { tonic: "C", mode: "major" },
    });
    expect(m.lines?.blue.size).toBe(0);
  });

  test("swung hats get the badge; straight ones do not", async () => {
    const code = `hats: s("hh*8").swingBy(1/3, 4)
kick: s("bd*4")`;
    const m = await model(code, 2);
    const badges = swingBadges(m.lines?.swing ?? []);
    expect(badges.get("hats")).toBe("Swing 8ths");
    expect(badges.has("kick")).toBe(false);
    const straight = await model('hats: s("hh*8")', 2);
    expect(swingBadges(straight.lines?.swing ?? []).size).toBe(0);
  });
});

describe("minor is minor (definition of done 12)", () => {
  test("degrees in A minor read 1 2 ♭3 4 5 ♭6 ♭7 with do re me fa sol le te", async () => {
    const m = await model('mel: n("0 1 2 3 4 5 6").scale("A3:minor").s("piano")', 1);
    expect(m.key).toEqual({ tonic: "A", mode: "minor" });
    const mel = m.events.filter((e) => e.track === "mel");
    expect(mel.map((e) => e.label?.degree?.label)).toEqual(["1", "2", "♭3", "4", "5", "♭6", "♭7"]);
    expect(mel.map((e) => e.label?.degree?.syllable)).toEqual(["do", "re", "me", "fa", "sol", "le", "te"]);
  });

  test("harmonic minor's raised 7 reads 7 and ti", async () => {
    const m = await model('mel: n("6").scale("A3:harmonic:minor").s("piano")', 1);
    const e = m.events.find((x) => x.track === "mel");
    expect(e?.midi).toBe(68);
    expect(e?.label?.degree?.label).toBe("7");
    expect(e?.label?.degree?.syllable).toBe("ti");
  });

  test("the chord lens writes minor numerals: Am F C G = i VI III VII, and E is V", async () => {
    // Root-position triads stacked on the A natural minor scale, then E G♯ B (the raised 7).
    const code = 'chords: note("<[a3,c4,e4] [f3,a3,c4] [c4,e4,g4] [g3,b3,d4] [e3,g#3,b3]>").s("piano")';
    const m = await model(code, 5, { key: { tonic: "A", mode: "minor" } });
    expect(await midisOf(code, 5)).toEqual([57, 60, 64, 53, 57, 60, 60, 64, 67, 55, 59, 62, 52, 56, 59]);
    const rn = m.harmony?.regions.map((r) => r.rn) ?? [];
    expect(rn).toEqual(["i", "VI", "III", "VII", "V"]);
  });

  test("the relative and parallel twins, and the move that switches mode", () => {
    expect(keyTwinsOf({ tonic: "C", mode: "major" })).toEqual({
      relative: { tonic: "A", mode: "minor" },
      parallel: { tonic: "C", mode: "minor" },
    });
    expect(keyTwinsOf({ tonic: "A", mode: "harmonic minor" })?.relative).toEqual({
      tonic: "C",
      mode: "major",
    });
    expect(keyTwinsOf({ tonic: "C", mode: "dorian" })).toBeNull();
    expect(modeText("harmonic minor")).toBe("harmonic:minor");
    const code = 'mel: n("0 2 4").scale("C4:major")';
    expect(moveKey(code, { tonic: "C", mode: "major" }, { tonic: "A", mode: "minor" }).code).toBe(
      'mel: n("0 2 4").scale("A3:minor")',
    );
    expect(moveKey(code, { tonic: "C", mode: "major" }, { tonic: "C", mode: "minor" }).code).toBe(
      'mel: n("0 2 4").scale("C4:minor")',
    );
    // A move that keeps the mode keeps its text as written.
    expect(
      moveKey('m: n("0").scale("A3:aeolian")', { tonic: "A", mode: "minor" }, { tonic: "E", mode: "minor" })
        .code,
    ).toBe('m: n("0").scale("E3:aeolian")');
  });

  test("the parallel-minor preview plays ♭3 where the major had 3 (headless)", async () => {
    const moved = moveKey(
      'mel: n("0 2 4").scale("C4:major")',
      { tonic: "C", mode: "major" },
      {
        tonic: "C",
        mode: "minor",
      },
    ).code as string;
    expect(await midisOf(moved, 1)).toEqual([60, 63, 67]);
    const rel = moveKey(
      'mel: n("0 2 4").scale("C4:major")',
      { tonic: "C", mode: "major" },
      {
        tonic: "A",
        mode: "minor",
      },
    ).code as string;
    expect(await midisOf(rel, 1)).toEqual([57, 60, 64]);
  });
});

describe("the scope panel and the probes", () => {
  test("the wave and the spectrum fit their boxes; silence is silence", () => {
    const sine = Float32Array.from({ length: 1024 }, (_, i) => Math.sin((2 * Math.PI * i) / 128));
    const pts = wavePoints(sine, 300, 80);
    expect(pts.length).toBeLessThanOrEqual(513);
    expect(Math.min(...pts.map((p) => p[1]))).toBeGreaterThanOrEqual(0);
    expect(Math.max(...pts.map((p) => p[1]))).toBeLessThanOrEqual(80);
    expect(isSilent(new Float32Array(64))).toBe(true);
    const quiet = fitWave(Float32Array.from([0, 0.05, -0.1, 0.02]));
    expect(Math.max(...Array.from(quiet, Math.abs))).toBeCloseTo(0.9, 5);
    expect(fitWave(new Float32Array(4))).toEqual(new Float32Array(4));
    expect(isSilent(sine)).toBe(false);
    const bars = spectrumBars(
      [
        { lowHz: 30, highHz: 60, db: 0 },
        { lowHz: 60, highHz: 120, db: -100 },
      ],
      100,
      50,
    );
    expect(bars.map((b) => b.h)).toEqual([50, 0]);
  });

  test("harmonics of a2 (110 Hz) are labelled A2 A3 E4 A4 C♯5 E5 (A1.L01)", () => {
    const rows = harmonicRows(
      { kind: "harmonics", amplitudes: [1, 0.5, 1 / 3, 0.25, 0.2, 1 / 6], source: "wave", wave: "sawtooth" },
      110,
      6,
    );
    expect(rows.map((r) => r.hz)).toEqual([110, 220, 330, 440, 550, 660]);
    expect(rows.map((r) => r.note)).toEqual(["A2", "A3", "E4", "A4", "C♯5", "E5"]);
    // The fifth harmonic is 14 cents under C♯5 (≈ in the panel); the third is 2 cents over E4.
    expect(rows.map((r) => r.near)).toEqual([true, true, true, true, false, true]);
    expect(f0OfHap({ value: { note: "a2" } })).toBeCloseTo(110, 3);
    expect(f0OfHap({ value: { note: 45 } })).toBeCloseTo(110, 3);
    expect(f0OfHap({ value: {} })).toBeNull();
  });

  test("the filter curve: −3 dB at a 600 Hz low-pass cutoff, a peak with resonance, words for both", () => {
    const p: FilterProbe = { kind: "filter", filter: "lpf", cutoff: 600, q: 1, slope: 12 };
    const [at] = filterCurve(p, [600]);
    expect(at as number).toBeGreaterThan(-4);
    expect(at as number).toBeLessThan(2);
    const geo = filterGeometry(p, 280, 84);
    expect(geo.path.startsWith("M0.0,")).toBe(true);
    expect(geo.marks[0]?.label).toBe("600 Hz");
    expect(filterCaption(p)).toBe("Low-pass at 600 Hz: the highs above it fade (12 dB per octave).");
    expect(filterCaption({ ...p, q: 12 })).toMatch(/resonance 12 lifts a peak/);
    expect(filterCaption({ ...p, filter: "hpf", cutoff: 400 })).toMatch(/^High-pass at 400 Hz/);
  });

  test("the envelope and the delay probes draw the values superdough plays", () => {
    const env = adsrValues({ attack: 0.2, release: 0.5 });
    const g = envelopeGeometry(env, 280, 84);
    // The 1 ms decay sits on the attack's mark: one label, not two on top of each other.
    expect(g.marks.map((m) => m.label)).toEqual(["A", "R"]);
    const full = envelopeGeometry(
      adsrValues({ attack: 0.1, decay: 0.2, sustain: 0.5, release: 0.3 }),
      280,
      84,
    );
    expect(full.marks.map((m) => m.label)).toEqual(["A", "D", "R"]);
    expect(g.path.startsWith("M0.0,83.0")).toBe(true);
    const d = delayGeometry({ kind: "delay", wet: 0.4, time: 0.25, feedback: 0.5 }, 280, 84);
    // The note, then echoes at 40%, 20%, 10% … until below −60 dB.
    expect(d.bars[0]?.label).toBe("note");
    expect(d.bars.length).toBeGreaterThan(5);
  });

  test("the probes a code asks for, from the controls its first note sets", () => {
    expect(probesInHap({ note: "c2", s: "sawtooth", cutoff: 600 })).toEqual(["filter"]);
    expect(probesInHap({ note: "c4", attack: 0.2, release: 0.5, delay: 0.4 })).toEqual(["envelope", "delay"]);
    expect(probesInHap({ note: "c3", partials: [1, 0.5] })).toEqual(["harmonics"]);
    expect(probesInHap({ note: "c3" })).toEqual([]);
  });
});

describe("the Wave 5 panels", () => {
  const all = new Set(["tb.lens.form", "tb.scope", "tb.fscope"]);
  test("form, scope and spectrum open with their tools in lens mode; a step opens only what it names", () => {
    expect(PANEL_IDS).toEqual(expect.arrayContaining(["form", "scope", "spectrum"]));
    const lens = panelAvailability({
      mode: "lenses",
      allowed: true,
      unlocked: all,
      hasStaff: true,
      hasRoll: true,
    });
    expect([lens.form, lens.scope, lens.spectrum]).toEqual([true, true, true]);
    const locked = panelAvailability({
      mode: "lenses",
      allowed: true,
      unlocked: new Set(),
      hasStaff: true,
      hasRoll: true,
    });
    expect([locked.form, locked.scope]).toEqual([false, false]);
    const step = panelAvailability({
      mode: "content",
      allowed: true,
      unlocked: all,
      initial: { form: true },
      hasStaff: true,
      hasRoll: true,
    });
    expect([step.form, step.scope]).toEqual([true, false]);
    expect(initialPanelState({}, { scope: true }, "content")).toEqual({ ...NO_PANELS, scope: true });
  });

  test("their keys are free and listed on the shortcut sheet", () => {
    const keys = PANEL_SWITCHES.map((p) => p.keys);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of ["Shift+E", "Shift+W", "Shift+Y", "Shift+O", "Shift+B", "Shift+U"])
      expect(WORKBENCH_LOOP_SHORTCUTS.map(([key]) => key)).toContain(k);
  });
});

describe("c5: lens lines on a shared staff", () => {
  test("a chord's names: the lowest with its octave, the members above by letter alone", () => {
    const key = { tonic: "Eb", mode: "minor" } as const;
    const chord = [63, 66, 70].map((m) => pitchLabel(m, key));
    expect(annotationText(chord, { degree: false, solfege: false, noteName: true }).noteName).toBe(
      "E♭4~G♭~B♭",
    );
    expect(
      annotationText([pitchLabel(63, key)], { degree: false, solfege: false, noteName: true }).noteName,
    ).toBe("E♭4");
  });

  test("numerals raised above the staff keep their text", () => {
    expect(raiseNumerals('"_I"!class=oak-n0!A2 "_IV"z2')).toBe('"^I"!class=oak-n0!A2 "^IV"z2');
  });
});

describe("the chord chart (c4: bars from the first full bar)", () => {
  test("a quick-change F blues: the chart's chords, and the form in words", async () => {
    const code = `setcpm(120/4)
chords: chord("<F7 Bb7 F7 F7 Bb7 Bb7 F7 F7 C7 Bb7 F7 C7>").voicing().s("piano")`;
    const m = await model(code, 12, { key: { tonic: "F", mode: "major" } });
    const regions = m.harmony?.regions ?? [];
    const { chords, bars } = chartChordsOf(regions, 4, 12, false);
    expect(bars).toBe(12);
    // A chord held into the next bar is one region: the chart carries it as slashes (bars 4, 6, 8).
    expect(chords.map((c) => c.bar)).toEqual([0, 1, 2, 4, 6, 8, 9, 10, 11]);
    expect(chords.every((c) => c.beat === 1)).toBe(true);
    expect(chords.map((c) => c.symbol)).toEqual(["F7", "B♭7", "F7", "B♭7", "F7", "C7", "B♭7", "F7", "C7"]);
    expect(bluesText(m.lines?.blues ?? null)).toBe(
      "12-bar blues, quick change, with a turnaround · 1 chorus · every chord a dominant seventh",
    );
  });

  test("with a pickup, chart bar 1 is the first full bar and the pickup's chords are left out", () => {
    const regions = [
      { from: 0.75, to: 1, symbol: "C7" },
      { from: 1, to: 2, symbol: "F7" },
      { from: 2.5, to: 3, symbol: "C7" },
    ];
    expect(chartChordsOf(regions, 4, 3, true)).toEqual({
      chords: [
        { bar: 0, beat: 1, symbol: "F7" },
        { bar: 1, beat: 3, symbol: "C7" },
      ],
      bars: 2,
    });
  });
});

test("the length of a code's chord changes, from its longest alternation", () => {
  expect(alternationBars('c: chord("<C7 F7 C7 C7 F7 F7 C7 C7 G7 F7 C7 G7>")')).toBe(12);
  expect(alternationBars('c: chord("<C7!4 F7!2 C7!2 G7 F7 C7 G7>")')).toBe(12);
  expect(alternationBars('m: n("<[0 2] [4 2]> 3")')).toBe(2);
  expect(alternationBars('d: s("bd sd")')).toBe(1);
});
