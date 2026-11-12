// Wave 3 in the Workbench, against real Strudel (the grader realm in-process): degree labels read in each
// track's key at each bar (a C-major and a G-major pattern, a patterned `.scale()`), chromatic notes, the staff's
// lens lines, the clef and key facts, the label rules of the lenses, and the key tools (signature, ring, the
// `.scale()` edit), every musical fact cross-checked with @oak/theory and headless Strudel.
import { beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { evaluateForGrading, initRealm } from "@oak/grader";
import { midisOf } from "@oak/grader/testing";
import { labelPitch } from "@oak/theory";
import { annotateAbc, annotationText, NO_ANNOTATIONS } from "./annotate.ts";
import { PLAYGROUND_EXAMPLES } from "./examples.ts";
import { signatureAbc } from "./KeyPanel.tsx";
import {
  keyName,
  keyOfSlot,
  keySummary,
  moveKey,
  nearestShift,
  neighbours,
  ring,
  scaleTokens,
  signatureText,
  slotOf,
  spelledScale,
  staffClefText,
} from "./key-tools.ts";
import { contentDecides, noteText, showsSwitcher, viewLabels } from "./lens-view.ts";
import {
  buildModel,
  keyAtCycle,
  type ModelOptions,
  pieceKeys,
  staffPage,
  transposedAfterScale,
  type WorkbenchModel,
} from "./model.ts";

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

const C = { tonic: "C", mode: "major" } as const;
const G = { tonic: "G", mode: "major" } as const;
const learnerPitched = (m: WorkbenchModel) => m.events.filter((e) => e.midi !== null && !e.band);

describe("degree labels in the track's key (theory labelPitch is the oracle)", () => {
  test("a C-major pattern: n('0 2 4 2 3 1 0 4') is C4 E4 G4 E4 F4 D4 C4 G4, degrees 1 3 5 3 4 2 1 5", async () => {
    const code = 'mel: n("0 2 4 2 3 1 0 4").scale("C4:major").s("piano")';
    const m = await model(code, 1);
    const ev = learnerPitched(m);
    expect(await midisOf(code, 1)).toEqual([60, 64, 67, 64, 65, 62, 60, 67]);
    expect(ev.map((e) => e.midi)).toEqual([60, 64, 67, 64, 65, 62, 60, 67]);
    expect(ev.map((e) => e.label?.degree?.label)).toEqual(["1", "3", "5", "3", "4", "2", "1", "5"]);
    expect(ev.map((e) => e.label?.degree?.label)).toEqual(
      ev.map((e) => labelPitch(e.midi as number, C).degreeDisplay),
    );
    expect(ev.map((e) => e.label?.degree?.syllable)).toEqual([
      "do",
      "mi",
      "sol",
      "mi",
      "fa",
      "re",
      "do",
      "sol",
    ]);
    expect(ev.filter((e) => e.label?.degree?.tonic).length).toBe(2);
    expect(m.key).toEqual(C);
  });

  test("a G-major pattern: n('0 2 4 6 7') is G4 B4 D5 F#5 G5, degrees 1 3 5 7 1, F# spelled as a sharp", async () => {
    const code = 'mel: n("0 2 4 6 7").scale("G4:major").s("piano")';
    const m = await model(code, 1);
    const ev = learnerPitched(m);
    expect(await midisOf(code, 1)).toEqual([67, 71, 74, 78, 79]);
    expect(ev.map((e) => e.label?.name)).toEqual(["G4", "B4", "D5", "F#5", "G5"]);
    expect(ev.map((e) => e.label?.degree?.label)).toEqual(["1", "3", "5", "7", "1"]);
    expect(ev.map((e) => e.label?.degree?.label)).toEqual(
      ev.map((e) => labelPitch(e.midi as number, G).degreeDisplay),
    );
    expect(m.key).toEqual(G);
  });

  test("the code's own .scale() wins over a declared key (Studio's key selector says C, the code says G)", async () => {
    const m = await model('mel: n("0 4").scale("G4:major").s("piano")', 1, { key: C });
    expect(learnerPitched(m).map((e) => e.label?.degree?.label)).toEqual(["1", "5"]);
    expect(m.key).toEqual(G);
  });

  test("a patterned .scale('<C4:major G4:major>'): every bar labelled in its own key", async () => {
    const ex = PLAYGROUND_EXAMPLES.find((e) => e.id === "patterned-keys");
    if (!ex) throw new Error("example missing");
    const m = await model(ex.code, 2);
    const ev = learnerPitched(m);
    expect(await midisOf(ex.code, 2)).toEqual([60, 64, 67, 71, 72, 67, 71, 74, 78, 79]);
    expect(ev.map((e) => e.label?.name)).toEqual([
      "C4",
      "E4",
      "G4",
      "B4",
      "C5",
      "G4",
      "B4",
      "D5",
      "F#5",
      "G5",
    ]);
    expect(ev.map((e) => e.label?.degree?.label)).toEqual(["1", "3", "5", "7", "1", "1", "3", "5", "7", "1"]);
    for (const e of ev)
      expect(e.label?.degree?.label).toEqual(labelPitch(e.midi as number, e.bar === 1 ? C : G).degreeDisplay);
    expect(m.keySpans.map((s) => [s.from, s.to, keyName(s.key)])).toEqual([
      [0, 1, "C major"],
      [1, 2, "G major"],
    ]);
    expect(keyAtCycle(m.keySpans, 0.5)).toEqual(C);
    expect(keyAtCycle(m.keySpans, 1.25)).toEqual(G);
    expect(pieceKeys(m.keySpans)).toEqual([C, G]);
    expect(keySummary(m.keySpans, 0, 2, null)).toBe("C major → G major");
    expect(keySummary(m.keySpans, 1, 2, null)).toBe("G major · 1♯");
  });

  test("chromatic notes are marked ♭3 and ♯4 in C major, in colour and label", async () => {
    const m = await model('mel: note("c4 eb4 f#4 g4").s("piano")', 1, { key: C });
    const ev = learnerPitched(m);
    expect(ev.map((e) => e.label?.degree?.label)).toEqual(["1", "♭3", "♯4", "5"]);
    expect(ev.map((e) => e.label?.degree?.inKey)).toEqual([true, false, false, true]);
    expect(ev.map((e) => e.label?.degree?.raw)).toEqual(["1", "b3", "#4", "5"]);
  });

  test("a chromatic note keeps the code's spelling: c#4 is ♯1, db4 is ♭2", async () => {
    const up = learnerPitched(await model('mel: note("c4 c#4 d4").s("piano")', 1, { key: C }));
    expect(up.map((e) => e.label?.degree?.label)).toEqual(["1", "♯1", "2"]);
    expect(up[1]?.label?.name).toBe("C#4");
    const down = learnerPitched(await model('mel: note("d4 db4 c4").s("piano")', 1, { key: C }));
    expect(down.map((e) => e.label?.degree?.label)).toEqual(["2", "♭2", "1"]);
    expect(down[1]?.label?.name).toBe("Db4");
  });

  test("a chromatic note without a spelling in the code is spelled by its motion: rising ♯4, falling ♭5", async () => {
    const rising = learnerPitched(await model('mel: note("60 66 67").s("piano")', 1, { key: C }));
    expect(rising.map((e) => e.label?.degree?.label)).toEqual(["1", "♯4", "5"]);
    const falling = learnerPitched(await model('mel: note("67 66 65").s("piano")', 1, { key: C }));
    expect(falling.map((e) => e.label?.degree?.label)).toEqual(["5", "♭5", "4"]);
  });

  test("letter names with too few notes to estimate a key stay unlabelled", async () => {
    const m = await model('mel: note("c4 eb4").s("piano")', 1);
    expect(m.key).toBeNull();
    expect(learnerPitched(m).every((e) => e.label?.degree === undefined)).toBe(true);
  });

  test("a .transpose() after .scale() does not trust the scale context (contracts §6.8 item 3)", () => {
    expect(
      transposedAfterScale('mel: n("0 2").scale("C4:major").transpose(2)\nbass: n("0").scale("C2:major")'),
    ).toEqual(["mel"]);
  });
});

describe("the staff: lens lines, clef and key", () => {
  test("degree and solfège lines under a G-major staff, one per note, in order", async () => {
    const m = await model('mel: n("0 2 4 6 7 ~ ~ ~").scale("G4:major").s("piano")', 1);
    const src = m.staffSource;
    if (!src) throw new Error("no staff");
    const page = staffPage({ ...src, annotations: { degree: true, solfege: true, noteName: false } }, 0);
    const abc = page.abc?.abc ?? "";
    expect(abc).toContain("K:G");
    const w = abc.split("\n").filter((l) => l.startsWith("w:"));
    expect(w).toEqual(["w:1 3 5 7 1", "w:do mi sol ti do"]);
    // The id map is untouched: the links stay exact.
    expect(page.abc?.idMap.length).toBe(m.abc?.idMap.length);
    expect(staffClefText(page.score)).toBe("Treble clef");
  });

  test("a patterned key: the staff signature is the page's first key, bar 2's lines are read in G", async () => {
    const ex = PLAYGROUND_EXAMPLES.find((e) => e.id === "patterned-keys");
    if (!ex) throw new Error("example missing");
    const m = await model(ex.code, 2);
    const src = m.staffSource;
    if (!src) throw new Error("no staff");
    const page = staffPage({ ...src, annotations: { degree: true, solfege: false, noteName: true } }, 0);
    const w = (page.abc?.abc ?? "").split("\n").filter((l) => l.startsWith("w:"));
    expect(w).toEqual(["w:1 3 5 7 1 | 1 3 5 7 1", "w:C4 E4 G4 B4 C5 | G4 B4 D5 F♯5 G5"]);
  });

  test("melody and bass on two tracks make a grand staff, with lines under both staves", async () => {
    const ex = PLAYGROUND_EXAMPLES.find((e) => e.id === "grand");
    if (!ex) throw new Error("example missing");
    const m = await model(ex.code, 2);
    const src = m.staffSource;
    if (!src) throw new Error("no staff");
    expect(src.split).toBe("track");
    const page = staffPage({ ...src, annotations: { degree: true, solfege: false, noteName: false } }, 0);
    expect(staffClefText(page.score)).toBe("Grand staff");
    expect(page.score?.staves.map((s) => s.clef)).toEqual(["treble", "bass"]);
    const abc = page.abc?.abc ?? "";
    expect(abc).toContain("K:D");
    const w = abc.split("\n").filter((l) => l.startsWith("w:"));
    // Melody A4 F#4 D4 F#4 | G4 B4 A4 (n 4 2 0 2 | 3 5 4: degrees 5 3 1 3 | 4 6 5), bass D2 | G2 (degrees 1 | 4).
    expect(w).toEqual(["w:5 3 1 3 | 4 6 5", "w:1 | 4"]);
    const heard = (await midisOf(ex.code, 2)).filter((x): x is number => x !== null).sort((a, b) => a - b);
    expect(heard).toEqual([38, 43, 62, 66, 66, 67, 69, 69, 71]);
  });

  test("a low line alone is written in the bass clef", async () => {
    const m = await model('bass: n("0 4 2 0").scale("C2:major").s("piano")', 1);
    expect(staffClefText(m.score)).toBe("Bass clef");
  });

  test("annotateAbc leaves the ABC alone when no line is on", async () => {
    const m = await model('mel: n("0 2").scale("C4:major").s("piano")', 1);
    if (!m.score) throw new Error("no score");
    const plain = annotateAbc(m.score, { barsPerLine: 4 }, NO_ANNOTATIONS, () => ({}));
    expect(plain.abc).toBe(m.abc?.abc ?? "");
  });

  test("a chord's texts join low to high with a tie", () => {
    const l = (midi: number) => {
      const p = labelPitch(midi, C);
      return {
        midi,
        name: p.name,
        display: p.display,
        degree: {
          raw: p.degree,
          label: p.degreeDisplay,
          num: p.num,
          alt: p.alt,
          syllable: p.syllable,
          inKey: true,
          tonic: p.degree === "1",
        },
      };
    };
    expect(annotationText([l(60), l(64), l(67)], { degree: true, solfege: true, noteName: false })).toEqual({
      degree: "1~3~5",
      solfege: "do~mi~sol",
    });
  });
});

describe("which labels each view shows (wave3.md §4.3)", () => {
  const locked = { degrees: false, solfege: false, noteNames: true };
  const degreesOnly = { degrees: true, solfege: false, noteNames: true };
  const all = { degrees: true, solfege: true, noteNames: true };
  const prefs = { degrees: true, solfege: true, noteNames: false };
  const shownOf = (a: typeof all) => ({
    degrees: prefs.degrees && a.degrees,
    solfege: prefs.solfege && a.solfege,
    noteNames: prefs.noteNames && a.noteNames,
  });

  test("before U03.L02: no degree anywhere, no lens switch, part colours", () => {
    const l = { shown: shownOf(locked), available: locked };
    const v = viewLabels({ lenses: l, hasKey: true });
    expect(v.mode).toBe("lenses");
    expect(v.note).toEqual({ degree: false, solfege: false, noteName: false });
    expect(v.color).toBe("part");
    expect(v.gutter).toBe("note");
    expect(v.hover).toEqual({ degree: false, solfege: false });
    expect(v.keyboardDegrees).toBe(false);
    expect(v.staff).toEqual({ degree: false, solfege: false, noteName: false });
    expect(showsSwitcher(l, v.mode)).toBe(false);
  });

  test("after U03.L02: degrees and degree colours, the switch; syllables wait for U03.L08", () => {
    const l = { shown: shownOf(degreesOnly), available: degreesOnly };
    const v = viewLabels({ lenses: l, hasKey: true });
    expect(v.note).toEqual({ degree: true, solfege: false, noteName: false });
    expect(v.color).toBe("degree");
    expect(v.staff.degree).toBe(true);
    expect(v.hover).toEqual({ degree: true, solfege: false });
    expect(showsSwitcher(l, v.mode)).toBe(true);
    const all3 = viewLabels({ lenses: { shown: shownOf(all), available: all }, hasKey: true });
    expect(all3.note).toEqual({ degree: true, solfege: true, noteName: false });
    expect(all3.gutter).toBe("degree+solfege");
  });

  test("a lesson step's labels win: content mode, switches hidden, hover still gated", () => {
    const l = { shown: shownOf(locked), available: locked };
    const v = viewLabels({ rollLabels: "none", rollColor: "part", lenses: l, hasKey: true });
    expect(contentDecides({ rollLabels: "none" })).toBe(true);
    expect(v.mode).toBe("content");
    expect(v.note).toEqual({ degree: false, solfege: false, noteName: false });
    expect(v.hover.degree).toBe(false);
    expect(showsSwitcher(l, v.mode)).toBe(false);
    const step = viewLabels({ rollLabels: "degree", staffLabels: "degree+solfege", lenses: l, hasKey: true });
    expect(step.note.degree).toBe(true);
    expect(step.staff).toEqual({ degree: true, solfege: true, noteName: false });
  });

  test("a fixed Settings value overrides the roll only, never past an unlock", () => {
    const l = { shown: shownOf(all), available: all };
    expect(viewLabels({ lenses: l, hasKey: true, rollSetting: "note" }).note).toEqual({
      degree: false,
      solfege: false,
      noteName: true,
    });
    expect(viewLabels({ lenses: l, hasKey: true, rollSetting: "note" }).staff.degree).toBe(true);
    const early = { shown: shownOf(locked), available: locked };
    expect(viewLabels({ lenses: early, hasKey: true, rollSetting: "degree" }).note.degree).toBe(false);
  });

  test("outside the app (no lens state) the Wave 2 labels hold", () => {
    const v = viewLabels({ lenses: null, hasKey: true });
    expect(v.mode).toBe("content");
    expect(v.gutter).toBe("degree");
    expect(v.color).toBe("degree");
    expect(viewLabels({ lenses: null, hasKey: false }).gutter).toBe("note");
  });

  test("one roll note's text", () => {
    const label = { display: "E4", degree: { label: "3", syllable: "mi" } };
    expect(noteText(label, { degree: true, solfege: true, noteName: true })).toBe("3 mi E4");
    expect(noteText(label, { degree: false, solfege: true, noteName: false })).toBe("mi");
    expect(noteText({ display: "E4" }, { degree: true, solfege: false, noteName: false })).toBe("E4");
  });
});

describe("key tools", () => {
  test("signatures, spelled scales and neighbours", () => {
    expect(signatureText({ tonic: "D", mode: "major" })).toBe("2 sharps: F♯ C♯");
    expect(signatureText({ tonic: "F", mode: "major" })).toBe("1 flat: B♭");
    expect(signatureText({ tonic: "A", mode: "minor" })).toBe("no sharps or flats");
    expect(spelledScale({ tonic: "Eb", mode: "major" }).map((n) => n.name)).toEqual([
      "E♭",
      "F",
      "G",
      "A♭",
      "B♭",
      "C",
      "D",
    ]);
    expect(neighbours(G).map((n) => `${n.label}: ${keyName(n.key)}`)).toEqual([
      "A fifth up: D major",
      "A fifth down: C major",
      "Relative: E minor",
      "Parallel: G minor",
    ]);
  });

  test("the ring: C at the top, sharps clockwise, flats the other way", () => {
    const r = ring();
    expect(r.map((s) => s.major.tonic)).toEqual([
      "C",
      "G",
      "D",
      "A",
      "E",
      "B",
      "F#",
      "Db",
      "Ab",
      "Eb",
      "Bb",
      "F",
    ]);
    expect(r.map((s) => s.minor.tonic)).toEqual([
      "A",
      "E",
      "B",
      "F#",
      "C#",
      "G#",
      "D#",
      "Bb",
      "F",
      "C",
      "G",
      "D",
    ]);
    expect(slotOf({ tonic: "Eb", mode: "major" })).toBe(9);
    expect(slotOf({ tonic: "C", mode: "minor" })).toBe(9);
    expect(slotOf({ tonic: "Gb", mode: "major" })).toBe(6);
    expect(keyOfSlot(2, "minor")).toEqual({ tonic: "B", mode: "minor" });
    expect(keyOfSlot(1, "dorian")).toEqual({ tonic: "A", mode: "dorian" });
  });

  test("the signature staff writes the scale under the signature with no repeated accidental", () => {
    expect(signatureAbc({ tonic: "D", mode: "major" })).toBe(
      "X:1\nM:none\nL:1/4\nK:D clef=treble\nD E F G A B c d |]\n",
    );
    expect(signatureAbc({ tonic: "A", mode: "minor" })).toContain("A, B, C D E F G A |]");
  });

  test("moving the piece's key: every .scale() token, octave across C, the mode kept", async () => {
    expect(nearestShift(C, G)).toBe(-5);
    expect(nearestShift(G, C)).toBe(5);
    const code = 'mel: n("0 2 4 7").scale("C4:major").s("piano")';
    const toG = moveKey(code, C, G);
    expect(toG.code).toBe('mel: n("0 2 4 7").scale("G3:major").s("piano")');
    expect(await midisOf(toG.code as string, 1)).toEqual([55, 59, 62, 67]);
    const toD = moveKey(code, C, { tonic: "D", mode: "major" });
    expect(toD.code).toBe('mel: n("0 2 4 7").scale("D4:major").s("piano")');
    expect(await midisOf(toD.code as string, 1)).toEqual([62, 66, 69, 74]);
    const patterned = 'mel: n("0 2").scale("<C4:major G4:major>")';
    expect(moveKey(patterned, C, { tonic: "D", mode: "major" }).code).toBe(
      'mel: n("0 2").scale("<D4:major A4:major>")',
    );
    expect(moveKey('n("0").scale("B3:major")', { tonic: "B", mode: "major" }, C).code).toBe(
      'n("0").scale("C4:major")',
    );
    expect(
      moveKey(
        'n("0").scale("A3:harmonic:minor")',
        { tonic: "A", mode: "minor" },
        { tonic: "E", mode: "minor" },
      ).code,
    ).toBe('n("0").scale("E3:harmonic:minor")');
    expect(moveKey('note("c4 e4")', C, G).code).toBeNull();
    expect(scaleTokens("mel: n(\"0\").scale('F4:major')").map((t) => t.text)).toEqual(["F4:major"]);
  });
});
