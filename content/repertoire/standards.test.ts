// The Wave 6 answer keys (content/repertoire/<slug>/song.ts): the three CF-T standards, Sweet Georgia Brown (U15.L05,
// L6), Old Joe Clark (U14.L02, L6) and Drunken Sailor (U14.L03, L5), checked against what they claim:
//   1. against a separate transcription of each tune, kept here as ABC text as its transcriber published it (minus
//      the words), in its own key: a small ABC reader turns it into notes, and the answer key, evaluated by headless
//      Strudel, must have the same notes at the same beats for the same lengths (ties joined), moved by one fixed
//      interval, the difference of the two keys. The ABC's chord symbols, moved the same way, must be the chart's
//      chords, except for the bars each song's `setting` names (each listed here with what Oak plays instead);
//   2. the layers agree with the chart: the chords layer sounds each chart chord's notes (from @oak/theory), the
//      bass plays its root on each chord's first beat, and most notes on beats 1 and 3 are chord notes;
//   3. the shape CF-T and the ladders need: sections and phrases, the swing, the lengths;
//   4. the real grader: every section of every stage passes with the answer key (L8: bass 0.90, changes 0.85,
//      melody 0.90); the form map passes with the key's own sections and fails with a wrong reading; known-wrong
//      answers fail (a bass a bar late, triads for sevenths in two bars, the tune a step off) and a near-miss passes
//      (one triad for a seventh in a section: 7 of 8 bars);
//   5. the spec's pinned bars (content/specs/U14.ts) for the two U14 tunes.
// None of this is the human check against the cited print: `verified` stays false and `verifiedBy` pending.
import { beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import type { SongDef } from "@oak/content-kit";
import * as grader from "@oak/grader";
import { evalHeadless } from "@oak/grader/testing";
import { chordPcs, parseChordSymbol } from "@oak/theory";
import { songLadderGaps } from "../gym/songs.ts";
import { standardLadderGaps } from "../gym/standards.ts";
import { U14 } from "../specs/U14.ts";
import { toolbox } from "../toolbox.ts";
import { unlockedFor } from "../validate/harness.ts";
import aintSheSweet from "./aint-she-sweet/song.ts";
import blackbird from "./bye-bye-blackbird/song.ts";
import drunkenSailor from "./drunken-sailor/song.ts";
import fiveFootTwo from "./five-foot-two/song.ts";
import { PENDING_VERIFIER } from "./fragment.ts";
import { songById } from "./index.ts";
import oldJoeClark from "./old-joe-clark/song.ts";
import { SWING_8THS } from "./standards.ts";
import sweetGeorgia from "./sweet-georgia-brown/song.ts";

setDefaultTimeout(180_000);

const STANDARDS = [fiveFootTwo, aintSheSweet, blackbird];
const ALL: SongDef[] = [...STANDARDS, sweetGeorgia, oldJoeClark, drunkenSailor];

// --- 1. the separate transcriptions -----------------------------------------------------------------------

interface Source {
  from: string;
  abc: string;
  /** Semitones from the source's key to Oak's. */
  shift: number;
  /** Oak's beats per source beat (1, or 2 when the setting doubles the note values). */
  scale: number;
  /**
   * Bars whose chart differs from the source's chords (the setting says why): bar → the source's chords as the
   * reader gives them (moved into Oak's key and named), and what Oak's chart has.
   */
  chartDiffs: Record<number, { source: string; oak: string }>;
  /** Source chord spellings Oak writes in its own palette (the setting says so). */
  rename?: Record<string, string>;
  /** Compare the chords of the source at all (Old Joe Clark's source has none). */
  chords: boolean;
}

const SOURCES: Record<string, Source> = {
  "song.five-foot-two": {
    from: 'Victorian Folk Music Club, Fireside Fiddlers, "Five Foot Two, Eyes Of Blue" (score, in C, cut time), read from the score into ABC',
    shift: 0,
    scale: 1,
    chords: true,
    rename: { D9: "D7" },
    chartDiffs: {
      8: { source: "D7 Dm7 G7", oak: "G7" },
      14: { source: "Dm7 G7", oak: "G7" },
      15: { source: "C Dm7", oak: "C" },
      31: { source: "C Bb", oak: "C" },
    },
    abc: `M:4/4
L:1/8
K:C
"C"E2 G2 E2 z2 |"E7"E2 ^G2 E2 z E |"A7"E2 A2 E2 A2 | E2 AE- E2 A2 |
"D7"c2 A2 c2 A2 |"G7"G4 A4 |"C"E8- |"D9"E2-"Dm7"E2-"G7"E2 z2 |
"C"E2 G2 E2 z2 |"E7"E2 ^G2 E2 z E |"A7"E2 A2 E2 A2 | d2 AE- E2 A2 |
"D7"c2 A2 c2 A2 |"Dm7"G4 "G7"A4 |"C"C4- "Dm7"C4 |"C"C2 E2 ^D2 E2 |
"E7"B2 c2 B2 z E | B2 c2 B2 z2 |"A7"B2 A2 B2 A2- | A8 |
"D7"A2 B2 A2 z D | A2 B2 A2 z2 |"G7"B2 d2 B2 G2 | F E2 D- D2 ^D2 |
"C"E2 G2 E2 z2 |"E7"E2 ^G2 E2 z2 |"A7"E2 A2 E2 A2 | E2 AE- E2 A2 |
"D7"c2 A2 c2 A2 |"G7"G4 A4 |"C"c4- "Bb"c4- |"C"c6 z2 |]`,
  },
  "song.aint-she-sweet": {
    from: "J. Chambers's abc collection, \"Ain't She Sweet?\" (X:1, in E-flat, cut time), the repeat of the first A written out",
    shift: -3,
    scale: 1,
    chords: true,
    chartDiffs: {},
    abc: `M:C|
L:1/8
K:Eb
"Eb"c4 "G"=B4 | "Bb7"_B4 zc2B | "Eb"c2c2 "G"=B2B2 | "Bb7"_B4 zc2B |
"Eb"e2e2 "G7"d2d2 | "C7"c2cc- cBA2 | "F7"G4 "Bb7"F4 | "Eb"E4 "Bb7"z4 |
"Eb"c4 "G"=B4 | "Bb7"_B4 zc2B | "Eb"c2c2 "G"=B2B2 | "Bb7"_B4 zc2B |
"Eb"e2e2 "G7"d2d2 | "C7"c2cc- cBA2 | "F7"G4 "Bb7"F4 | "Eb"E2e2 "Eb7"e2e2 |
[| "Ab7"e8- | e2e2 e2e2 | "Eb"e4 B4- | "Eb"B2e2 "Eb7"e2e2 | "Ab7"e8- |
| "Ab7"e2e2 e2e2 | "Eb"e4 B4- | "Bb7"B4 z4 |]| "Eb"c4 "G"=B4 | "Bb7"_B4 zc2B |
| "Eb"c2c2 "G"=B2B2 | "Bb7"_B4 zc2B | "Eb"e2e2 "G7"d2d2 | "C7"c2cc- cBA2 | "F7"G4 "Bb7"F4 | "Eb"E4 z4 |]`,
  },
  "song.bye-bye-blackbird": {
    from: 'I. Hayden\'s abc-music-files, "Jazz songs/Bye Bye Blackbird" (in F)',
    shift: 0,
    scale: 1,
    chords: true,
    rename: { C7b9: "C7", D7b9: "D7", Fma7: "F^7", Abdim: "Abo7", "Gm7 (Bbma7)": "Gm7", "Am7(Ao7)": "Am7" },
    chartDiffs: {
      9: { source: "Gm7 /F#", oak: "Gm" },
      10: { source: "D7/F /E", oak: "Gm7 C7" },
      32: { source: "Gm7 C7", oak: "F" },
    },
    abc: `L:1/4
M:4/4
K:F
"F"AA "Dm7"AA|"Gm7"BA "Am7"A2|"Gm7"AG "C7b9"G2|"Fma7"GF F2|
"Am"F4|"Abdim"G4|"Gm7"F2 E2-|"C7"E4||
"Gm7"BB"/F#"BB|"D7/F"cB "/E"B2|"Gm"BAA2|"C7"AGG2|
"Gm7"G4|"C7"A4|"Fma7"G2F2-|"Gm7"F2-"C7"F2||
"F7"Fccc|"Bb7"cBAG|"Am7"G4|"D7"^F4|
"Gm7"DBBB|BAGF|"Db7"F4|"C7"E4|
"F"AA "Dm7"AA|"Gm7 (Bbma7)"BA "C7"A2|"Am7(Ao7)"AGG2|"D7b9"G^FF2|
"Gm7"G2B2-|"C7"B2 E2|"F"F4|"Gm7"z2 "C7"z2|]`,
  },
  "song.sweet-georgia-brown": {
    from: 'J. Chambers\'s abc collection, "Sweet Georgia Brown" (in G, 4/4), the melody voice with its chord symbols',
    shift: -2,
    scale: 1,
    chords: true,
    rename: { Gmaj7: "G^7", G6: "G" },
    chartDiffs: {
      29: { source: "F D7", oak: "F" },
      30: { source: "G7 A7", oak: "D7" },
    },
    abc: `M:4/4
L:1/8
K:G
"E7"EF2^G-G3E | B^G2^c- c3B | e4 B^G2E- | E6z2 |
"A7"EF2=G-G3E | BG2^c- c3A | e4^cB2A- | A6z2 ||
"D7"DE2F- F3D | AF2B-B3A | d4 AF2D- | D2DE- EDE2 |
"Gmaj7"B8- | B2DE- "D7"EDE2 | "Gmaj7"B6B2 | "B7"A6z2 ||
"E7"EF2^G-G3E | B^G2^c- c3B | e4 B^G2E- | E6z2 |
"A7"EF2=G-G3E | BG2^c- c3A | e4^cB2A- | A4"B7"z4 ||
"Em"B3B-B2z2 | "B7"AF2B- B2B2 | "Em"B3B-B2z2 | "B7"AF2B- B2z2 |
"G6"DE2G- "E7"GD3 | "A7"d^d2e- "B7"eB3 | "A7"A4 "D7"dB2G- | "G"G4z4 |]`,
  },
  "song.drunken-sailor": {
    from: "written for this test from the shanty as commonly sung, in ABC (D Dorian has no sharps or flats), apart from the answer key",
    shift: 0,
    scale: 1,
    chords: false,
    chartDiffs: {},
    abc: `M:4/4
L:1/8
K:C
A2 AA A2 AA | A2 D2 F2 A2 | G2 GG G2 GG | G2 C2 E2 G2 | A2 AA A2 AA | A2 B2 c2 d2 | c2 A2 G2 E2 | D4 D4 |]`,
  },
  "song.old-joe-clark": {
    from: 'The Digital Tradition, "Old Joe Clark" (abc_dtrad JOECLARK, in D Mixolydian, 2/4); Oak doubles its values and moves it to A',
    shift: -5,
    scale: 2,
    chords: false,
    chartDiffs: {},
    abc: `M:2/4
L:1/8
K:G
 A| AB c B/2B/2| AG F2| AB cB| A2 z A| AB cB| AG F2| DF EE| D4| D3/2 D/2 D2|\\
 AG F2| D3/2 D/2 DF| E4| D3/2 D/2 D2| AG F2| DF EC| D2 z||`,
  },
};

// Note: the Sweet Georgia Brown ABC above is the transcription's melody voice; its chord voice (G6 E7 | A7 D7 | G6 |
// B7 in the last four bars) disagrees with the melody voice's symbols there; Oak follows neither in bars 29–30.

const KEY_SIGS: Record<string, Record<string, number>> = {
  C: {},
  G: { F: 1 },
  F: { B: -1 },
  Eb: { B: -1, E: -1, A: -1 },
};
const LETTER: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const round = (x: number) => Math.round(x * 1e6) / 1e6;

interface AbcNote {
  beat: number;
  len: number;
  midi: number;
}
/**
 * The notes (ties joined) and chord symbols of an ABC tune, beats counted in quarters from the downbeat of the first
 * full bar (a pickup is negative). Accidentals hold to the bar line.
 */
function readAbc(abc: string): {
  notes: AbcNote[];
  chords: { beat: number; symbol: string }[];
  barBeats: number;
} {
  const header = (k: string) => new RegExp(`^${k}:(.*)$`, "m").exec(abc)?.[1]?.trim() ?? "";
  const m = header("M");
  const meter = m === "C" || m === "C|" ? "4/4" : m;
  const barBeats = (Number(meter.split("/")[0]) * 4) / Number(meter.split("/")[1]);
  const [ln, ld] = header("L").split("/").map(Number) as [number, number];
  const unit = (4 * ln) / ld;
  const sig = KEY_SIGS[header("K")];
  if (!sig) throw new Error(`no key signature for ${header("K")}`);
  const body = abc
    .split("\n")
    .filter((l) => !/^[A-Za-z]:/.test(l))
    .join(" ")
    .replace(/[\\[\]]/g, "");
  const notes: (AbcNote & { tie: boolean })[] = [];
  const chords: { beat: number; symbol: string }[] = [];
  const token = /"([^"]*)"|(\^|_|=)?([A-Ga-gz])([,']*)(\d*)(\/?)(\d*)|(-)|(\|+)/g;
  let t = 0;
  let barStart = 0;
  let firstBar: number | null = null;
  let acc: Record<string, number> = {};
  for (const x of body.matchAll(token)) {
    if (x[1] !== undefined) {
      chords.push({ beat: t, symbol: x[1] });
      continue;
    }
    if (x[9]) {
      if (t > barStart) {
        if (firstBar === null) firstBar = t - barStart;
        barStart = t;
      }
      acc = {};
      continue;
    }
    if (x[8]) {
      const last = notes.at(-1);
      if (last) last.tie = true;
      continue;
    }
    const [, , mark, letter, octs, num, slash, den] = x as unknown as string[];
    const len = ((num ? Number(num) : 1) / (slash ? (den ? Number(den) : 2) : 1)) * unit;
    if (letter !== "z") {
      const up = (letter as string).toUpperCase();
      let midi = 60 + (LETTER[up] as number) + (letter === up ? 0 : 12);
      for (const o of octs as string) midi += o === "," ? -12 : 12;
      const where = `${up}${midi}`;
      if (mark) acc[where] = mark === "^" ? 1 : mark === "_" ? -1 : 0;
      midi += acc[where] ?? sig[up] ?? 0;
      const last = notes.at(-1);
      if (last?.tie && last.midi === midi && round(last.beat + last.len) === round(t)) {
        last.len += len;
        last.tie = false;
      } else notes.push({ beat: t, len, midi, tie: false });
    }
    t += len;
  }
  const shift = firstBar !== null && firstBar < barBeats - 1e-9 ? firstBar : 0;
  return {
    notes: notes.map((n) => ({ beat: round(n.beat - shift), len: round(n.len), midi: n.midi })),
    chords: chords.map((c) => ({ beat: round(c.beat - shift), symbol: c.symbol })),
    barBeats,
  };
}

const rat = (x: string): number => {
  const [a, b] = x.split("/").map(Number);
  return b ? (a as number) / b : (a as number);
};
const beatsOf = (s: SongDef): number => Number(s.meter.split("/")[0]);
const cyclesOf = (s: SongDef): number => s.answerKey.bars + (s.pickup ? 1 : 0);
const tempo = (s: SongDef) => `setcpm(${s.bpm}/${beatsOf(s)})`;

/** One track of the answer key, `beat` in quarters from the downbeat of bar 1 (the pickup is negative). */
async function trackOf(s: SongDef, layer: "melody" | "bass" | "chords") {
  const label = layer === "melody" ? "mel" : layer;
  const r = await evalHeadless(`${tempo(s)}\n\n${label}: ${s.answerKey.layers[layer]}`, cyclesOf(s));
  const lead = s.pickup ? 1 : 0;
  return r.events
    .filter((e) => e.track === label && e.midi !== null)
    .map((e) => ({
      beat: round((rat(e.begin) - lead) * beatsOf(s)),
      len: round((rat(e.end) - rat(e.begin)) * beatsOf(s)),
      midi: e.midi as number,
    }));
}

const NAMES = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
/** A chord symbol moved by `semis`, its root renamed (the suffix kept): `Bb7` −3 → `G7`. */
function moveSymbol(symbol: string, semis: number): string {
  const m = /^([A-G])(#|b)?(.*)$/.exec(symbol);
  if (!m) return symbol;
  const pc =
    ((LETTER[m[1] as string] as number) + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) + semis + 24) % 12;
  return `${NAMES[pc]}${m[3]}`;
}
const pcsOf = (symbol: string): string => {
  const c = parseChordSymbol(symbol);
  if (!c) throw new Error(`not a chord symbol: ${symbol}`);
  return [...chordPcs(c)].sort((a, b) => a - b).join(",");
};

describe("each answer key plays the notes of a separate transcription", () => {
  for (const s of ALL) {
    const src = SOURCES[s.id] as Source;
    test(`${s.id}: ${src.from}`, async () => {
      const { notes } = readAbc(src.abc);
      const want = notes.map((n) => ({
        beat: round(n.beat * src.scale),
        len: round(n.len * src.scale),
        midi: n.midi + src.shift,
      }));
      const got = await trackOf(s, "melody");
      // Compare bar by bar, so a failure names the bar.
      const bar = (b: number) => Math.floor(b / beatsOf(s)) + 1;
      const by = (xs: typeof got) => {
        const m = new Map<number, string[]>();
        for (const x of xs)
          m.set(bar(x.beat), [...(m.get(bar(x.beat)) ?? []), `${x.beat}+${x.len}:${x.midi}`]);
        return [...m.entries()];
      };
      expect(by(got)).toEqual(by(want));
    });
    if (src.chords)
      test(`${s.id}: the chart is the transcription's chords, except where the setting says`, () => {
        const { chords, barBeats } = readAbc(src.abc);
        const source = new Map<number, { beat: number; sym: string }[]>();
        for (const c of chords) {
          const b = Math.floor(c.beat / barBeats) + 1;
          const sym = moveSymbol(src.rename?.[c.symbol] ?? c.symbol, src.shift);
          source.set(b, [...(source.get(b) ?? []), { beat: c.beat, sym }]);
        }
        const chart = new Map<number, string[]>();
        for (const c of s.answerKey.chords ?? []) chart.set(c.bar, [...(chart.get(c.bar) ?? []), c.symbol]);
        // A source bar keeps the chord before it until its own first symbol.
        let held = "";
        for (let b = 1; b <= s.answerKey.bars; b++) {
          const own = source.get(b) ?? [];
          const lead = own.length === 0 || (own[0] as { beat: number }).beat > (b - 1) * barBeats + 1e-9;
          const srcBar = [...(lead ? [held] : []), ...own.map((c) => c.sym)];
          held = srcBar.at(-1) as string;
          const oak = chart.get(b) ?? [];
          const diff = src.chartDiffs[b];
          if (diff) {
            expect([b, srcBar.join(" ")]).toEqual([b, diff.source]);
            expect([b, oak.join(" ")]).toEqual([b, diff.oak]);
            continue;
          }
          // Same chords: compare by pitch classes (Gmaj7 = G^7), the second in the bar only when the source changes.
          expect([b, oak.map(pcsOf)]).toEqual([b, srcBar.map(pcsOf)]);
        }
      });
  }
});

// --- 2. the layers agree with the chart ------------------------------------------------------------------

describe("the layers agree with the chart", () => {
  for (const s of ALL)
    describe(s.id, () => {
      test("each chord of the chart sounds its own notes in the chords layer, and the bass plays its root on its first beat", async () => {
        const beats = beatsOf(s);
        const chordsTrack = await trackOf(s, "chords");
        const bass = await trackOf(s, "bass");
        const chart = s.answerKey.chords ?? [];
        for (const [i, c] of chart.entries()) {
          const start = (c.bar - 1) * beats + (c.beat - 1);
          const next = chart[i + 1];
          const end = next ? (next.bar - 1) * beats + (next.beat - 1) : s.answerKey.bars * beats;
          const pcs = new Set(
            chordsTrack.filter((e) => e.beat >= start && e.beat < end).map((e) => e.midi % 12),
          );
          expect([c.bar, c.symbol, [...pcs].sort((a, b) => a - b).join(",")]).toEqual([
            c.bar,
            c.symbol,
            pcsOf(c.symbol),
          ]);
          const root = parseChordSymbol(c.symbol)?.rootPc;
          const first = bass.find((e) => e.beat === start);
          expect([c.bar, c.symbol, first ? first.midi % 12 : null]).toEqual([c.bar, c.symbol, root ?? -1]);
        }
      });
      test("most melody notes on beats 1 and 3 are notes of the chord", async () => {
        const beats = beatsOf(s);
        const chart = s.answerKey.chords ?? [];
        const chordAt = (beat: number) =>
          [...chart].reverse().find((c) => (c.bar - 1) * beats + (c.beat - 1) <= beat + 1e-9)?.symbol;
        const strong = (await trackOf(s, "melody")).filter((n) => n.beat >= 0 && n.beat % 2 === 0);
        const inChord = strong.filter((n) => {
          const sym = chordAt(n.beat);
          return sym
            ? pcsOf(sym)
                .split(",")
                .map(Number)
                .includes(n.midi % 12)
            : false;
        });
        expect(inChord.length / strong.length).toBeGreaterThanOrEqual(0.7);
      });
    });
});

// --- 3. the shape -----------------------------------------------------------------------------------------

describe("the registry and the shape each use needs", () => {
  for (const s of ALL)
    test(`${s.id}: registry and song agree; still unverified`, () => {
      const e = songById.get(s.id);
      expect(e).toBeDefined();
      expect({
        title: s.title,
        year: s.year,
        status: s.status,
        key: s.key,
        meter: s.meter,
        form: s.form,
      }).toEqual({
        title: e?.title,
        year: e?.year,
        status: e?.status,
        key: e?.key,
        meter: e?.meter,
        form: e?.form,
      } as never);
      expect(s.provenance).toEqual(e?.provenance as never);
      expect(s.provenance.year).toBeLessThanOrEqual(1930);
      expect(s.pickup).toEqual(e?.pickup as never);
      expect(e?.verified).toBe(false);
      expect(s.verifiedBy).toBe(PENDING_VERIFIER);
      expect(s.availableFrom).toBe(e?.availableFrom as never);
    });
  test("the three CF-T standards: 32 bars, A A B A in four eight-bar sections that are also the phrases, swing 8ths, a complete L8 item", () => {
    for (const s of STANDARDS) {
      expect([s.id, s.answerKey.bars, s.swing]).toEqual([s.id, 32, SWING_8THS]);
      expect([s.id, s.answerKey.sections?.map((x) => x.label).join("")]).toEqual([s.id, "AABA"]);
      expect(s.answerKey.phrases).toEqual(s.answerKey.sections?.map((x) => x.bars) as never);
      expect([s.id, standardLadderGaps(s)]).toEqual([s.id, []]);
      expect(s.answerKey.layers.drums).toBeTruthy();
    }
  });
  test("Sweet Georgia Brown: A B A C, the chain D7 G7 C7 F four bars a link, a complete L6 item", () => {
    const s = sweetGeorgia;
    expect(s.answerKey.sections?.map((x) => x.label).join("")).toBe("ABAC");
    const firstOfBar = (b: number) => s.answerKey.chords?.find((c) => c.bar === b)?.symbol;
    expect([1, 5, 9, 13].map(firstOfBar)).toEqual(["D7", "G7", "C7", "F^7"]);
    expect(songLadderGaps(s, 6)).toEqual([]);
  });
  test("Old Joe Clark is a complete L6 item, Drunken Sailor a complete L5 one", () => {
    expect(songLadderGaps(oldJoeClark, 6)).toEqual([]);
    expect(songLadderGaps(drunkenSailor, 5)).toEqual([]);
    expect(oldJoeClark.pickup).toEqual({ units: [1, 1] });
  });
  test("the modal tunes: Old Joe Clark's only G is natural (♭7), Drunken Sailor's only B is natural (raised 6) and is in bar 6", async () => {
    const joe = await trackOf(oldJoeClark, "melody");
    expect(joe.filter((n) => n.midi % 12 === 8)).toEqual([]);
    expect(joe.filter((n) => n.midi % 12 === 7).length).toBeGreaterThan(0);
    const sailor = await trackOf(drunkenSailor, "melody");
    expect(sailor.filter((n) => n.midi % 12 === 10)).toEqual([]);
    expect(sailor.filter((n) => n.midi % 12 === 11).map((n) => Math.floor(n.beat / 4) + 1)).toEqual([6]);
  });
});

// --- 4. the real grader -------------------------------------------------------------------------------------

const ctxAt = (session: string) => ({
  params: {},
  attemptNo: 1,
  firstAttempt: true,
  rung: 0 as const,
  tutorHints: 0,
  extraReplays: 0,
  lint: {
    profile: "graded" as const,
    unlocked: unlockedFor(session as never),
    allowPreview: false,
    meter: "4/4" as const,
    key: null,
  },
});

beforeAll(async () => {
  await grader.initRealm({ toolbox: [...toolbox], lockdown: false });
});

/** The top-level items of a mini-notation sequence: `[a b] c [[d] e]` → `[a b]`, `c`, `[[d] e]`. */
function topLevel(seq: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of seq.trim()) {
    if (ch === "[") depth++;
    if (ch === "]") depth--;
    if (ch === " " && depth === 0) {
      if (cur) out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

/** The answer key with one layer's code replaced. */
const withLayer = (s: SongDef, layer: "bass" | "chords" | "melody", body: string): string => {
  const label = layer === "melody" ? "mel" : layer;
  const line = `${label}: ${s.answerKey.layers[layer]}`;
  expect(s.answerKey.code).toContain(line);
  return s.answerKey.code.replace(line, `${label}: ${body}`);
};

describe("L8 and CF-T: the standards through the real grader", () => {
  for (const s of STANDARDS)
    describe(s.id, () => {
      const slug = s.id.replace("song.", "");
      const grade = (stage: "bass" | "changes" | "melody", phrase: number, code = s.answerKey.code) =>
        grader.gradeStandardLadder({
          item: { itemId: `lad.8.${slug}`, level: 8, stage, phrase },
          song: s,
          code,
          ctx: ctxAt("CF-T.S1"),
        });
      test("every section of every stage passes with the answer key", async () => {
        for (const stage of ["bass", "changes", "melody"] as const)
          for (let p = 1; p <= 4; p++) {
            const r = await grade(stage, p);
            expect([stage, p, r.status, r.score]).toEqual([stage, p, "pass", 1]);
          }
      });
      test("the form map passes with the key's sections (any letters of that shape) and fails with ABCA", () => {
        const bars = [1, 9, 17, 25];
        expect(grader.gradeFormMap({ sections: ["A", "A", "B", "A"], bars }, s).passed).toBe(true);
        expect(grader.gradeFormMap({ sections: ["X", "X", "Y", "X"], bars }, s).passed).toBe(true);
        expect(grader.gradeFormMap({ sections: ["A", "B", "C", "A"], bars }, s).passed).toBe(false);
        expect(grader.gradeFormMap({ sections: ["A", "B"], bars: [1, 17] }, s).passed).toBe(false);
      });
      test("a bass a bar late fails its section", async () => {
        const bass = s.answerKey.layers.bass as string;
        const late = bass.replace('n("<', 'n("<~ ');
        expect(late).not.toBe(bass);
        const r = await grade("bass", 1, withLayer(s, "bass", late));
        expect(r.status).toBe("fail");
      });
      test("triads for sevenths: one bar in a section still passes (7 of 8), two bars fail", async () => {
        const chords = s.answerKey.layers.chords as string;
        // The bars of section 4 (bars 25–32) that hold one chord, a seventh (four notes): drop the seventh from one
        // or two. (Grading is by bar; a bar of two chords is scored by its slots today, so the near miss is made in
        // one-chord bars.)
        const groups = topLevel(chords.slice(chords.indexOf("<") + 1, chords.lastIndexOf(">")));
        expect(groups.length).toBe(32);
        const sevenths = [...groups.keys()].filter(
          (i) => i >= 24 && /^\[[^,[\] ]+(,[^,[\] ]+){3}\]$/.test(groups[i] as string),
        );
        expect(sevenths.length).toBeGreaterThanOrEqual(2);
        const triad = (g: string) => g.replace(/\[([^,\]]+),([^,\]]+),([^,\]]+),[^,\]]+\]/g, "[$1,$2,$3]");
        const one = [...groups];
        one[sevenths[0] as number] = triad(one[sevenths[0] as number] as string);
        const two = [...one];
        two[sevenths[1] as number] = triad(two[sevenths[1] as number] as string);
        const rebuild = (gs: string[]) => chords.replace(groups.join(" "), gs.join(" "));
        const r1 = await grade("changes", 4, withLayer(s, "chords", rebuild(one)));
        expect([r1.status, r1.score]).toEqual(["pass", 0.875]);
        const r2 = await grade("changes", 4, withLayer(s, "chords", rebuild(two)));
        expect(r2.status).toBe("fail");
      });
      test("the tune a scale step off throughout fails its section", async () => {
        const mel = s.answerKey.layers.melody as string;
        const r = await grade("melody", 1, withLayer(s, "melody", `${mel}.transpose(2)`));
        expect(r.status).toBe("fail");
      });
    });
});

describe("L6: Sweet Georgia Brown and Old Joe Clark through the real grader", () => {
  for (const [s, session] of [
    [sweetGeorgia, "U15.L05"],
    [oldJoeClark, "U14.L02"],
  ] as const)
    test(`${s.id}: bass, changes and every melody line of the strain pass with the answer key`, async () => {
      const slug = s.id.replace("song.", "");
      const lines = (s.answerKey.phrases ?? []).filter(([, b]) => b <= 16).length;
      const grade = (item: grader.SongLadderItem) =>
        grader.gradeSongLadder({ item, song: s, code: s.answerKey.code, ctx: ctxAt(session) });
      for (const stage of ["bass", "changes"] as const) {
        const r = await grade({ itemId: `lad.6.${slug}`, level: 6, phrase: [1, lines], stage });
        expect([stage, r.status, r.score]).toEqual([stage, "pass", 1]);
      }
      for (let p = 1; p <= lines; p++) {
        const r = await grade({ itemId: `lad.6.${slug}.${p}`, level: 6, phrase: p, stage: "melody" });
        expect([p, r.status, r.score]).toEqual([p, "pass", 1]);
      }
    });
  test("song.drunken-sailor: each phrase passes at L5 with the answer key", async () => {
    for (const p of [1, 2]) {
      const r = await grader.gradeSongLadder({
        item: { itemId: `lad.5.drunken-sailor.${p}`, level: 5, phrase: p },
        song: drunkenSailor,
        code: drunkenSailor.answerKey.code,
        ctx: ctxAt("U14.L03"),
      });
      expect([p, r.status, r.score]).toEqual([p, "pass", 1]);
    }
  });
});

// --- 5. the bars content/specs/U14.ts pins ------------------------------------------------------------------

describe("the U14 spec's pinned bars", () => {
  const pinned = U14.lessons.flatMap((l) => l.repertoire ?? []);
  for (const s of [oldJoeClark, drunkenSailor])
    test(`${s.id}: every note the spec pins sounds at the same beat in the answer key, an octave apart at most`, async () => {
      const frag = pinned.find((r) => r.song === s.id);
      expect(frag).toBeDefined();
      const r = await evalHeadless(
        `setcpm(120/4)\n\nmel: note("${frag?.letters}").s("piano")`,
        frag?.bars ?? 1,
      );
      const own = await trackOf(s, "melody");
      for (const e of r.events) {
        const beat = round(rat(e.begin) * 4);
        const at = own.find((n) => n.beat === beat);
        expect([beat, at ? (((at.midi - (e.midi as number)) % 12) + 12) % 12 : "none"]).toEqual([beat, 0]);
      }
    });
});
