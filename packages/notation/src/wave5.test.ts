// Wave 5 notation seams (docs/design/wave5.md §3.3): section marks, the 12-bar chart, and the engraving facts
// U10 and U11 rely on (minor signatures with raised 6 and 7 as accidentals, chromatic notes spelled by direction,
// "Swing 8ths"), pinned on the existing pipeline.
import { describe, expect, test } from "bun:test";
import type { KeySpec, NEvent } from "@oak/content-kit";
import { keySignature, METERS } from "@oak/theory";
import {
  barTextPx,
  leadSheetPages,
  type NotationInput,
  notate,
  noteAnnotations,
  noteNameText,
  padLine,
  pageSections,
  restateChords,
  spelledByEvent,
  staffTextLayout,
  textWidthPx,
} from "./index.ts";
import { chartAbc, chartBarText, chartChordText, chartLayout, sectionMarks } from "./wave5.ts";

const ev = (i: number, midi: number): NEvent => ({
  id: `m|${i}`,
  track: "mel",
  onset: [i, 4],
  dur: [1, 4],
  midi,
  pitchSource: "note-num",
  gain: 0.8,
  locs: [],
});

describe("section marks", () => {
  const sections = [
    { label: "verse", tag: "verse", startBar: 0, bars: 8 },
    { label: "chorus", tag: "chorus", startBar: 8, bars: 8 },
    { label: "verse", tag: "verse", startBar: 16, bars: 8 },
    { label: "chorus", tag: "chorus2", startBar: 24, bars: 8 },
  ];
  test("a label per section, a double bar before every later one", () => {
    expect(sectionMarks(sections)).toEqual([
      { bar: 0, text: "Verse", tag: "verse", doubleBar: false },
      { bar: 8, text: "Chorus", tag: "chorus", doubleBar: true },
      { bar: 16, text: "Verse", tag: "verse", doubleBar: true },
      { bar: 24, text: "Chorus 2", tag: "chorus2", doubleBar: true },
    ]);
    expect(sectionMarks(sections, { startBar: 8, bars: 8 }).map((m) => m.text)).toEqual(["Chorus"]);
  });
});

describe("the 12-bar chart", () => {
  const symbols = ["F7", "Bb7", "F7", "F7", "Bb7", "Bb7", "F7", "F7", "C7", "Bb7", "F7", "C7"];
  test("three lines of four, symbols where the chord changes, a slash per beat", () => {
    const chords = symbols.map((symbol, bar) => ({ bar, beat: 1, symbol }));
    const c = chartLayout({
      chords,
      bars: 12,
      meter: METERS["4/4"],
      key: { tonic: "F", mode: "major" },
      swing: { subdivision: 8, amount: 1 / 3 },
    });
    expect(c.lines).toHaveLength(3);
    expect(c.lines.map((l) => l.length)).toEqual([4, 4, 4]);
    expect(c.lines[0]?.map((b) => b.sounding)).toEqual(["F7", "B♭7", "F7", "F7"]);
    expect(c.lines[0]?.[0]?.slashes).toBe(4);
    expect(c.swingText).toBe("Swing 8ths");
  });
  test("a chord held over several bars shows only slashes after its first bar", () => {
    const c = chartLayout({
      chords: [
        { bar: 0, beat: 1, symbol: "C7" },
        { bar: 4, beat: 1, symbol: "F7" },
        { bar: 5, beat: 3, symbol: "Fo7" },
      ],
      bars: 8,
      meter: METERS["4/4"],
      key: null,
    });
    expect(c.lines[0]?.[1]).toMatchObject({ bar: 2, chords: [], sounding: "C7" });
    expect(c.lines[1]?.[1]?.chords).toEqual([{ beat: 3, text: "F°7", symbol: "Fo7" }]);
    expect(c.lines[1]?.[1]?.sounding).toBe("F7");
    expect(c.lines[1]?.[2]?.sounding).toBe("F°7");
    expect(chartChordText("Bb7")).toBe("B♭7");
  });
});

describe("engraving facts Wave 5 relies on", () => {
  test("A melodic minor up: no signature, F♯ and G♯ as accidentals", () => {
    const r = notate({
      events: [69, 71, 72, 74, 76, 78, 80, 81].map((m, i) => ev(i, m)),
      meter: METERS["4/4"],
      key: { tonic: "A", mode: "minor" },
      bars: 2,
      staff: "treble",
      swing: { subdivision: 8, amount: 1 / 3 },
    });
    expect(r.abc.abc).toContain("K:Am");
    expect(r.abc.abc).toContain("^f4");
    expect(r.abc.abc).toContain("^g4");
    expect(r.abc.abc).toContain("Swing 8ths");
  });
  test("a blue ♭5 in C: F♯ going up, G♭ going down", () => {
    const r = notate({
      events: [64, 65, 66, 67, 67, 66, 65, 64].map((m, i) => ev(i, m)),
      meter: METERS["4/4"],
      key: { tonic: "C", mode: "major" },
      bars: 2,
      staff: "treble",
    });
    expect(r.abc.abc).toContain("^F4");
    expect(r.abc.abc).toContain("_G4");
  });
});

// --- Build: minor, blues, approach tones, sections, swing, c5, charts -------------------------------------------

// biome-ignore lint/suspicious/noExplicitAny: abcjs is CommonJS
const abcjsMod: any = await import("abcjs");
const abcjs = abcjsMod.default ?? abcjsMod;
// biome-ignore lint/suspicious/noExplicitAny: abcjs parse tree
const parsed = (abc: string): any => abcjs.parseOnly(abc)[0];

/** Events from MIDI numbers, a quarter each (null = rest), on one track. */
const line = (midis: (number | null)[], track = "mel", unit: [number, number] = [1, 4]): NEvent[] =>
  midis.flatMap((m, i) =>
    m === null
      ? []
      : [
          {
            id: `${track}|${i}`,
            track,
            onset: [i * unit[0], unit[1]] as [number, number],
            dur: unit,
            midi: m,
            pitchSource: "note-num" as const,
            gain: 0.8,
            locs: [],
          },
        ],
  );
const names = (r: ReturnType<typeof notate>, staff = 0, voice = 0) =>
  (r.score.staves[staff]?.voices[voice]?.bars ?? []).flatMap((b) =>
    b.items
      .filter((it) => it.kind !== "rest" && !it.tieFromPrev)
      .flatMap((it) => it.pitches.map((p) => p.name)),
  );
const C_MAJOR = { tonic: "C", mode: "major" } as const;
const one = (events: NEvent[], extra: Partial<NotationInput> = {}) =>
  notate({ events, meter: METERS["4/4"], key: C_MAJOR, bars: 1, staff: "treble", ...extra });

describe("minor keys", () => {
  const MINORS = ["A", "E", "B", "F#", "C#", "G#", "D#", "A#", "D", "G", "C", "F", "Bb", "Eb", "Ab"];
  test("every minor key's signature: abcjs reads the same accidentals as theory's relative major", () => {
    for (const tonic of MINORS) {
      const r = one(line([null]), { key: { tonic, mode: "minor" } });
      const t = parsed(r.abc.abc);
      const want = keySignature({ tonic, mode: "minor" });
      expect(t.lines[0].staff[0].key.accidentals.length).toBe(Math.abs(want.accidentals));
      expect(r.abc.abc).toContain(`K:${want.abcK}\n`);
      expect(r.score.warnings).toEqual([]);
    }
  });
  test("raised 6 and 7 in each form; the natural 6 and 7 after them in the same bar take naturals", () => {
    // A melodic minor up (F♯ G♯), natural minor down (G F) in one bar of eighths.
    const r = one(line([69, 71, 72, 74, 76, 78, 80, 81, 79, 77, 76, 74, 72, 71, 69, null], "mel", [1, 16]), {
      key: { tonic: "A", mode: "minor" },
    });
    expect(names(r)).toEqual([
      "A4",
      "B4",
      "C5",
      "D5",
      "E5",
      "F#5",
      "G#5",
      "A5",
      "G5",
      "F5",
      "E5",
      "D5",
      "C5",
      "B4",
      "A4",
    ]);
    expect(r.abc.abc).toContain("^f!class=oak-e6!^g");
    expect(r.abc.abc).toContain("=g!class=oak-e9!=f");
  });
  test("the raised 7th in sharp keys is a double sharp where it must be (G♯ minor: F𝄪)", () => {
    const r = one(line([75, 79, 80]), { key: { tonic: "G#", mode: "harmonic minor" } });
    expect(names(r)).toEqual(["D#5", "F##5", "G#5"]);
    expect(r.abc.abc).toContain("^^f4");
  });
  test("natural, harmonic and melodic minor on one tonic are one signature: no key change is drawn", () => {
    const r = notate({
      events: line([69, 71, 72, 74, 76, 78, 80, 81], "mel", [1, 8]),
      meter: METERS["4/4"],
      key: { tonic: "A", mode: "minor" },
      keyChanges: [{ bar: 0, beat: 3, key: { tonic: "A", mode: "melodic minor" } }],
      bars: 1,
      staff: "treble",
    });
    expect(r.score.keyChanges).toBeUndefined();
    expect(r.abc.abc).not.toContain("[K:");
  });
  test("degree and solfège lenses in minor are do-based: ♭3 me, ♭6 le, ♭7 te; raised 6 and 7 are la and ti", () => {
    const r = notate({
      events: line([60, 63, 68, 70, 69, 71], "mel", [1, 8]),
      meter: METERS["4/4"],
      key: { tonic: "C", mode: "minor" },
      bars: 1,
      staff: "treble",
      annotations: { degree: true, solfege: true },
    });
    const ann = noteAnnotations(r.score, { degree: true, solfege: true });
    expect(ann.map((a) => a.degree)).toEqual(["1", "♭3", "♭6", "♭7", "6", "7"]);
    expect(ann.map((a) => a.solfege)).toEqual(["do", "me", "le", "te", "la", "ti"]);
  });
});

describe("blue notes and approach tones", () => {
  test("a blues key is written in the tonic's major signature (no three flats for C blues)", () => {
    const r = one(line([60, 63, 65, 66]), { key: { tonic: "C", mode: "blues" } });
    expect(r.abc.abc).toContain("K:C\n");
    expect(names(r)).toEqual(["C4", "Eb4", "F4", "F#4"]);
    expect(r.score.blues).toBe(true);
    // The staff spells the ♭5 by direction (F♯ climbing), but in a blues the lens names the blue note U11
    // teaches: ♭5, se (Wave 5 integration; the staff spelling is unchanged).
    expect(noteAnnotations(r.score, { degree: true }).map((a) => a.degree)).toEqual(["1", "♭3", "4", "♭5"]);
    expect(noteAnnotations(r.score, { solfege: true }).map((a) => a.solfege)).toEqual([
      "do",
      "me",
      "fa",
      "se",
    ]);
    // Outside a blues the same F♯ is ♯4 (fi), read from its spelling as before.
    const plain = one(line([60, 63, 65, 66]), { key: { tonic: "C", mode: "major" }, blues: false });
    expect(noteAnnotations(plain.score, { degree: true }).map((a) => a.degree)).toEqual([
      "1",
      "♭3",
      "4",
      "♯4",
    ]);
  });
  test("over dominant sevenths on two roots the blue third stays a flat; over plain triads it leads up as D♯", () => {
    const evs = line([60, 63, 64, 67]);
    const blues = one(evs, {
      chords: [
        { bar: 0, beat: 1, symbol: "C7" },
        { bar: 0, beat: 3, symbol: "F7" },
      ],
    });
    expect(names(blues)).toEqual(["C4", "Eb4", "E4", "G4"]);
    const plain = one(evs, {
      chords: [
        { bar: 0, beat: 1, symbol: "C" },
        { bar: 0, beat: 3, symbol: "F" },
      ],
    });
    expect(names(plain)).toEqual(["C4", "D#4", "E4", "G4"]);
    // A single dominant seventh is not yet a blues (a V7 in a major key), and `blues: false` turns it off.
    expect(names(one(evs, { chords: [{ bar: 0, beat: 1, symbol: "G7" }] }))).toEqual([
      "C4",
      "D#4",
      "E4",
      "G4",
    ]);
    expect(
      names(
        one(evs, {
          blues: false,
          chords: [
            { bar: 0, beat: 1, symbol: "C7" },
            { bar: 0, beat: 3, symbol: "F7" },
          ],
        }),
      ),
    ).toEqual(["C4", "D#4", "E4", "G4"]);
  });
  test("the ♭5 follows the line; ♭7 stays flat climbing to the octave", () => {
    expect(names(one(line([65, 66, 67, 70]), { blues: true }))).toEqual(["F4", "F#4", "G4", "Bb4"]);
    expect(names(one(line([67, 66, 65, 60]), { blues: true }))).toEqual(["G4", "Gb4", "F4", "C4"]);
    expect(names(one(line([69, 70, 71, 72]), { blues: true }))).toEqual(["A4", "Bb4", "B4", "C5"]);
    expect(names(one(line([69, 70, 71, 72])))).toEqual(["A4", "A#4", "B4", "C5"]);
  });
  test("a chord tone is spelled from the chord, not as a blue note (E♭ over F7 is its 7th; B♭ over C7)", () => {
    const r = one(line([75, 70, 63, 70]), {
      chords: [
        { bar: 0, beat: 1, symbol: "F7" },
        { bar: 0, beat: 3, symbol: "C7" },
      ],
    });
    expect(names(r)).toEqual(["Eb5", "Bb4", "Eb4", "Bb4"]);
  });
  test("a chromatic neighbour keeps the key's spelling (E E♭ E), as the Workbench labels it", () => {
    expect(names(one(line([64, 63, 64, 67])))).toEqual(["E4", "Eb4", "E4", "G4"]);
    expect(names(one(line([60, 61, 62, 64])))).toEqual(["C4", "C#4", "D4", "E4"]);
  });
  test("approach tones lean into their target; never E♯, B♯, C♭ or F♭ outside the key", () => {
    const bass = (midis: number[], key: KeySpec = C_MAJOR) =>
      names(notate({ events: line(midis, "bass"), meter: METERS["4/4"], key, bars: 1, staff: "bass" }));
    expect(bass([36, 40, 32, 33])).toEqual(["C2", "E2", "G#1", "A1"]);
    expect(bass([36, 35, 32, 31])).toEqual(["C2", "B1", "Ab1", "G1"]);
    expect(bass([36, 38, 39, 40])).toEqual(["C2", "D2", "D#2", "E2"]);
    expect(bass([31, 43, 37, 36])).toEqual(["G1", "G2", "Db2", "C2"]);
    expect(bass([38, 41, 42, 45], { tonic: "D", mode: "major" })).toEqual(["D2", "F2", "F#2", "A2"]);
    expect(bass([29, 33, 35, 34], { tonic: "F", mode: "major" })).toEqual(["F1", "A1", "B1", "Bb1"]);
  });
  test("bass lines read down to E1 without a warning; below D1 the staff warns", () => {
    const low = notate({
      events: line([28, 30, 31, 33], "bass"),
      meter: METERS["4/4"],
      key: C_MAJOR,
      bars: 1,
      staff: "bass",
    });
    expect(low.score.warnings).toEqual([]);
    expect(low.abc.abc).toContain("E,,,4");
    const lower = notate({
      events: line([24, 28, 31, 33], "bass"),
      meter: METERS["4/4"],
      key: C_MAJOR,
      bars: 1,
      staff: "bass",
    });
    expect(lower.score.warnings.map((w) => w.code)).toEqual(["out-of-range"]);
  });
});

describe("sections on the staff", () => {
  const sections = sectionMarks([
    { label: "verse", tag: "verse", startBar: 0, bars: 2 },
    { label: "chorus", tag: "chorus", startBar: 2, bars: 2 },
  ]);
  const four = line([60, null, null, null, 62, null, null, null, 64, null, null, null, 65, null, null, null]);
  test("a part label over each section's first bar and a double bar before the chorus, also on a grand staff", () => {
    const r = notate({
      events: four,
      meter: METERS["4/4"],
      key: C_MAJOR,
      bars: 4,
      staff: "treble",
      sections,
    });
    expect(r.score.sections?.map((m) => m.text)).toEqual(["Verse", "Chorus"]);
    expect(r.abc.abc).toContain("[P:Verse]");
    expect(r.abc.abc).toContain("z8 || [P:Chorus]");
    const t = parsed(r.abc.abc);
    // biome-ignore lint/suspicious/noExplicitAny: abcjs element
    const els = t.lines[0].staff[0].voices[0] as any[];
    expect(els.filter((e) => e.el_type === "part").map((e) => e.title)).toEqual(["Verse", "Chorus"]);
    expect(els.filter((e) => e.el_type === "bar").map((e) => e.type)).toEqual([
      "bar_thin",
      "bar_thin_thin",
      "bar_thin",
      "bar_thin_thick",
    ]);
    const grand = notate({
      events: [...four, ...line([36, null, null, null, 43], "bass", [1, 2])],
      meter: METERS["4/4"],
      key: C_MAJOR,
      bars: 4,
      staff: "grand",
      split: "track",
      sections,
    });
    expect(grand.abc.abc.match(/\[P:/g)?.length).toBe(2);
    expect(grand.abc.abc.match(/ \|\| /g)?.length).toBe(2);
  });
  test("a window keeps only its marks; a label text cannot break the ABC", () => {
    const r = notate({
      events: four,
      meter: METERS["4/4"],
      key: C_MAJOR,
      bars: 2,
      startBar: 2,
      staff: "treble",
      sections: [...sections, { bar: 3, text: "Odd ] % text", tag: "odd", doubleBar: true }],
    });
    expect(r.score.sections?.map((m) => m.bar)).toEqual([2, 3]);
    expect(r.abc.abc).toContain("[P:Odd text]");
    expect(parsed(r.abc.abc).warnings).toBeUndefined();
  });
  test("lead-sheet pages carry the sections; a page that starts inside one names it in parentheses", () => {
    const melody = line(Array.from({ length: 32 }, (_, i) => (i % 4 === 0 ? 60 + (i % 7) : null)));
    const pages = leadSheetPages(
      {
        melody,
        chords: [],
        meter: METERS["4/4"],
        key: C_MAJOR,
        bars: 8,
        sections: sectionMarks([
          { label: "verse", tag: "verse", startBar: 0, bars: 4 },
          { label: "chorus", tag: "chorus", startBar: 4, bars: 4 },
        ]),
      },
      { barsPerLine: 2, linesPerPage: 1, barsPerPage: 3, staffwidth: 400 },
    );
    expect(pages.map((p) => p.input.sections?.map((m) => `${m.bar}:${m.text}`))).toEqual([
      ["0:Verse"],
      ["3:(Verse)", "4:Chorus"],
      ["6:(Chorus)"],
    ]);
    expect(pageSections([], 3)).toEqual([]);
  });
  test("a page or section that starts while a chord rings on restates it on its first beat", () => {
    const melody = line(Array.from({ length: 32 }, (_, i) => (i % 4 === 0 ? 60 + (i % 7) : null)));
    // C held over bars 0–4 (the chorus starts at bar 4 with no chord of its own), then F at bar 6.
    const chords = [
      { bar: 0, beat: 1, symbol: "C" },
      { bar: 6, beat: 1, symbol: "F" },
    ];
    const pages = leadSheetPages(
      {
        melody,
        chords,
        meter: METERS["4/4"],
        key: C_MAJOR,
        bars: 8,
        sections: sectionMarks([
          { label: "verse", tag: "verse", startBar: 0, bars: 4 },
          { label: "chorus", tag: "chorus", startBar: 4, bars: 4 },
        ]),
      },
      { barsPerLine: 2, linesPerPage: 1, barsPerPage: 3, staffwidth: 400 },
    );
    const shown = (i: number) => {
      const p = pages[i];
      if (!p) throw new Error(`no page ${i}`);
      return (notate(p.input).score.chords ?? []).map((c) => `${c.bar}:${c.text}`);
    };
    // Page 1 starts at bar 3 inside the C: restated at bar 3 and again at the chorus (bar 4).
    expect(shown(0)).toEqual(["0:C"]);
    expect(shown(1)).toEqual(["3:C", "4:C"]);
    expect(shown(2)).toEqual(["6:F"]);
    // Nothing is added where a chord already starts, or before the first chord.
    expect(restateChords(chords, [6, 0])).toEqual(chords);
  });
});

describe("swing", () => {
  test("'Swing 8ths' is the tempo line's text, never stacked on the first chord symbol", () => {
    const r = one(line([60, 62, 64, 65]), {
      swing: { subdivision: 8, amount: 1 / 3 },
      tempoBpm: 112,
      chords: [{ bar: 0, beat: 1, symbol: "C7" }],
    });
    expect(r.abc.abc).toContain('Q:"Swing 8ths" 1/4=112\n');
    expect(r.abc.abc).not.toContain('"^Swing');
    expect(parsed(r.abc.abc).metaText.tempo.preString).toBe("Swing 8ths");
  });
  test("a swung off-beat crossing the bar line is put back and clipped at the next onset: exact", () => {
    // Bar 1's last eighth swung: onset 7/8 + 1/24, length 1/8 (crosses into bar 2).
    const evs: NEvent[] = [
      { ...ev(0, 72), onset: [3, 4], dur: [1, 8] },
      { ...ev(1, 74), onset: [7 * 3 + 1, 24], dur: [1, 8] },
      { ...ev(2, 76), onset: [1, 1], dur: [1, 4] },
    ];
    const r = notate({
      events: evs,
      meter: METERS["4/4"],
      key: C_MAJOR,
      bars: 2,
      staff: "treble",
      swing: { subdivision: 8, amount: 1 / 3 },
    });
    expect(r.score.approximate).toBe(false);
    expect(r.score.warnings).toEqual([]);
    const items = (r.score.staves[0]?.voices[0]?.bars ?? []).flatMap((b) =>
      b.items.filter((it) => it.kind !== "rest"),
    );
    expect(items.map((it) => `${it.onset[0]}/${it.onset[1]}+${it.dur[0]}/${it.dur[1]}`)).toEqual([
      "3/4+1/8",
      "7/8+1/8",
      "1/1+1/4",
    ]);
  });
  test("swing declared in a compound meter is warned, not straightened", () => {
    const r = notate({
      events: line([60, 62, 64, 65, 67, 69], "mel", [1, 6]),
      meter: METERS["6/8"],
      key: C_MAJOR,
      bars: 1,
      staff: "treble",
      swing: { subdivision: 8, amount: 1 / 3 },
    });
    expect(r.score.warnings.map((w) => w.code)).toEqual(["swing-unsupported"]);
  });
});

describe("c5: unisons, lens lines on a second voice, chord names at four chords a bar", () => {
  test("a doubled unison is one notehead carrying both events", () => {
    const evs = [
      ...line([70], "mel", [1, 1]),
      ...line([63], "ch", [1, 1]),
      ...line([66], "ch2", [1, 1]),
      ...line([70], "ch3", [1, 1]),
    ];
    const r = one(
      evs.sort((a, b) => (a.midi ?? 0) - (b.midi ?? 0)),
      { key: { tonic: "Eb", mode: "minor" } },
    );
    const it = r.score.staves[0]?.voices[0]?.bars[0]?.items[0];
    expect(it?.pitches.map((p) => p.name)).toEqual(["Eb4", "Gb4", "Bb4"]);
    expect(it?.eventIds).toHaveLength(4);
    expect(it?.doubled).toEqual([2]);
    expect(r.abc.byEvent.size).toBe(4);
    const by = spelledByEvent(r.score);
    expect([...by.entries()].map(([id, p]) => `${id}:${p.name}`).sort()).toEqual([
      "ch2|0:Gb4",
      "ch3|0:Bb4",
      "ch|0:Eb4",
      "mel|0:Bb4",
    ]);
    expect(r.score.warnings).toEqual([]);
  });
  test("every voice gets lens lines; the first is padded so the second's and the numerals stay clear", () => {
    const r = notate({
      events: [
        ...line([76, 74, 72, 71]),
        ...line([60], "lh", [1, 1]),
        ...line([64], "lh2", [1, 1]),
        ...line([67], "lh3", [1, 1]),
      ],
      meter: METERS["4/4"],
      key: C_MAJOR,
      bars: 1,
      staff: "treble",
      annotations: { degree: true, solfege: true },
      romans: [{ bar: 0, beat: 1, rn: "I" }],
    });
    const lines = r.abc.abc.split("\n");
    const v1 = lines.indexOf("V:S1");
    const v2 = lines.indexOf("V:S1v2");
    expect(lines.slice(v1 + 2, v2)).toEqual(["w:3 2 1 7", "w:mi re do ti", "w:~ ~ ~ ~", "w:~ ~ ~ ~"]);
    expect(lines.slice(v2 + 2)).toEqual(["w:1~3~5", "w:do~mi~sol", ""]);
    expect(padLine(r.score.staves[0]?.voices[0] as never, 0, 1)).toBe("w:~ ~ ~ ~");
  });
  test("compact chord names keep the lowest note's octave; the layout turns them on only when needed", () => {
    expect(
      noteNameText(
        [
          { midi: 63, name: "Eb4", letter: "E", alt: -1, oct: 4 },
          { midi: 66, name: "Gb4", letter: "G", alt: -1, oct: 4 },
        ],
        true,
      ),
    ).toBe("E♭4\u2009G♭");
    const four = notate({
      events: [0, 1, 2, 3].flatMap((i) =>
        [63, 66, 70].map((m, k) => ({
          ...ev(i * 3 + k, m),
          onset: [i, 4] as [number, number],
          dur: [1, 4] as [number, number],
        })),
      ),
      meter: METERS["4/4"],
      key: { tonic: "Eb", mode: "minor" },
      bars: 1,
      staff: "treble",
    });
    const which = { noteName: true };
    expect(barTextPx(four.score, { ...which, compactNames: true })[0]).toBeLessThan(
      barTextPx(four.score, which)[0] as number,
    );
    expect(staffTextLayout(1000, four.score, which)).toEqual({
      barsPerLine: 2,
      staffwidth: 740,
      compactNames: false,
    });
    const narrow = staffTextLayout(390, four.score, which);
    expect(narrow).toEqual({ barsPerLine: 1, staffwidth: 350, compactNames: true });
    expect(noteAnnotations(four.score, { noteName: true, compactNames: true })[0]?.noteName).toBe(
      "E♭4\u2009G♭\u2009B♭",
    );
    expect(textWidthPx("E♭4 G♭4 B♭4")).toBeGreaterThan(textWidthPx("E♭4 G♭ B♭"));
  });
});

describe("the chart engraved", () => {
  const symbols = ["F7", "Bb7", "F7", "F7", "Bb7", "Bb7", "F7", "F7", "C7", "Bb7", "F7", "C7"];
  const input = {
    chords: symbols.map((symbol, bar) => ({ bar, beat: 1, symbol })),
    bars: 12,
    meter: METERS["4/4"],
    key: { tonic: "F", mode: "major" as const },
    swing: { subdivision: 8 as const, amount: 1 / 3 },
    title: "Blues in F",
  };
  test("abcjs reads back a slash per beat, the symbol of each bar, lines of four, every bar written out", () => {
    const c = chartAbc(input);
    expect(c.warnings).toEqual([]);
    expect(c.abc).not.toMatch(/:\||\|:|::/);
    expect(c.abc).toContain('Q:"Swing 8ths"\n');
    const t = parsed(c.abc);
    expect(t.warnings).toBeUndefined();
    expect(t.lines).toHaveLength(3);
    // biome-ignore lint/suspicious/noExplicitAny: abcjs parse tree
    const notes = t.lines.flatMap((l: any) => l.staff[0].voices[0].filter((e: any) => e.el_type === "note"));
    expect(notes).toHaveLength(48);
    // biome-ignore lint/suspicious/noExplicitAny: abcjs element
    expect(notes.every((n: any) => n.style === "rhythm" || n.duration === 0.25)).toBe(true);
    // biome-ignore lint/suspicious/noExplicitAny: abcjs element
    const perBar = notes.filter((_: any, i: number) => i % 4 === 0).map((n: any) => n.chord?.[0]?.name);
    expect(perBar.map((s: string) => s.replace("♭", "b"))).toEqual(symbols);
    // biome-ignore lint/suspicious/noExplicitAny: abcjs element
    expect(notes.map((n: any) => n.extraClass)).toEqual(
      symbols.flatMap((_, b) => Array(4).fill(`oak-cb${b + 1}`)),
    );
    // biome-ignore lint/suspicious/noExplicitAny: abcjs parse tree
    expect(t.lines.map((l: any) => l.staff[0].barNumber)).toEqual([undefined, 5, 9]);
    expect(t.lines[0].staff[0].key.accidentals).toHaveLength(1);
  });
  test("two chords in a bar stand over their beats; a chord between beats is drawn on the beat before and warned", () => {
    const c = chartAbc({
      chords: [
        { bar: 0, beat: 1, symbol: "C7" },
        { bar: 0, beat: 3, symbol: "F7" },
        { bar: 1, beat: 2.5, symbol: "G7" },
      ],
      bars: 2,
      meter: METERS["4/4"],
      key: null,
    });
    // biome-ignore lint/suspicious/noExplicitAny: abcjs parse tree
    const notes = parsed(c.abc).lines[0].staff[0].voices[0].filter((e: any) => e.el_type === "note");
    // biome-ignore lint/suspicious/noExplicitAny: abcjs element
    expect(notes.map((n: any) => n.chord?.[0]?.name ?? "")).toEqual(["C7", "", "F7", "", "", "G7", "", ""]);
    expect(c.warnings.map((w) => `${w.code}@${w.bar}`)).toEqual(["abcjs-limit@1"]);
  });
  test("a chart from the first full bar after a pickup: numbered from 1, the pickup's chord carried in", () => {
    const c = chartLayout({
      chords: [
        { bar: 0, beat: 4, symbol: "G7" },
        { bar: 2, beat: 1, symbol: "C7" },
      ],
      bars: 2,
      startBar: 1,
      meter: METERS["4/4"],
      key: null,
    });
    expect(c.lines[0]?.map((b) => [b.bar, b.sounding, b.chords.map((x) => x.text).join(" ")])).toEqual([
      [1, "G7", "G7"],
      [2, "C7", "C7"],
    ]);
  });
  test("sections over a 24-bar chart: a label and a double bar before chorus 2; 3/4 has three slashes", () => {
    const c = chartAbc({
      ...input,
      chords: [...input.chords, ...input.chords.map((x) => ({ ...x, bar: x.bar + 12 }))],
      bars: 24,
      sections: sectionMarks([
        { label: "chorus", tag: "chorus", startBar: 0, bars: 12 },
        { label: "chorus", tag: "chorus2", startBar: 12, bars: 12 },
      ]),
    });
    expect(c.abc).toContain("[P:Chorus]");
    expect(c.abc).toContain(" ||\n[P:Chorus 2]");
    const waltz = chartAbc({
      chords: [{ bar: 0, beat: 1, symbol: "C" }],
      bars: 1,
      meter: METERS["3/4"],
      key: null,
    });
    const waltzEls = parsed(waltz.abc).lines[0].staff[0].voices[0] as { el_type: string }[];
    expect(waltzEls.filter((e) => e.el_type === "note")).toHaveLength(3);
    expect(chartBarText(c.layout.lines[0]?.[0] as never)).toBe("Chorus, bar 1: F7");
    expect(chartBarText(c.layout.lines[0]?.[2] as never)).toBe("Bar 3: F7");
  });
});
