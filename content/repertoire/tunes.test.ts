// The minor and blues answer keys (content/repertoire/<slug>/song.ts, built by tunes.ts) for U10, X2 and the L6 gym,
// checked against what they claim:
//   1. against a separate transcription of each tune, kept here as ABC text exactly as published by its
//      transcriber (the Digital Tradition, A. Lomax's 1964 printing, musicaviva, a fiddle tunebook), in its own key
//      and meter. A small ABC reader turns it into attacks; the answer key, evaluated by headless Strudel, must
//      have the same attacks at the same beats (except the moves its `setting` declares) and the same pitches
//      moved by one fixed interval, the difference of the two keys;
//   2. the shape rules of contracts §2.8: whole, half, quarter and eighth notes only, a half on a beat, nothing
//      over a bar line (no dot, no tie before U13), and a range a beginner can sing;
//   3. the chart, the chords layer and the bass agree, and most strong beats are chord notes;
//   4. the L6 songs can be cut into ladder items and X2 checks: 4-bar lines from bar 1, bass, chords, melody, and
//      the swing they declare; each stage graded by the real grader passes with the answer key.
// None of this is the human check against the cited edition: `verified` stays false and `verifiedBy` pending.
import { beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import type { SongDef } from "@oak/content-kit";
import * as grader from "@oak/grader";
import { evalHeadless } from "@oak/grader/testing";
import { chordPcs, parseChordSymbol } from "@oak/theory";
import { toolbox } from "../toolbox.ts";
import { unlockedFor } from "../validate/harness.ts";
import carelessLove from "./careless-love/song.ts";
import { PENDING_VERIFIER } from "./fragment.ts";
import frankie from "./frankie-and-johnny/song.ts";
import goDownMoses from "./go-down-moses/song.ts";
import greensleeves from "./greensleeves/song.ts";
import { songById } from "./index.ts";
import joshua from "./joshua-fit-the-battle/song.ts";
import { VOICINGS } from "./tunes.ts";
import wayfaring from "./wayfaring-stranger/song.ts";

setDefaultTimeout(120_000);

const songs: SongDef[] = [goDownMoses, joshua, wayfaring, greensleeves, carelessLove, frankie];
const L6 = [carelessLove, frankie];

// --- 1. the separate transcriptions -----------------------------------------------------------------------

interface Source {
  /** Who transcribed it, and where it is printed or kept. */
  from: string;
  abc: string;
  /** The home note of the tune as the source writes it. */
  tonic: string;
  /** Compare onsets too (else pitches only, bar by bar). */
  rhythm: boolean;
  /** Attacks the setting moves: [source beat, setting beat], beats from the first full bar's downbeat. */
  moved?: [number, number][];
  /** Compare only the first `bars` bars (and the pickup). */
  bars?: number;
  /** Bars (Oak's numbering) where the setting follows the cited edition instead of this transcription; left out. */
  differs?: number[];
}

const SOURCES: Record<string, Source[]> = {
  "song.go-down-moses": [
    {
      from: "A. Lomax, The Penguin Book of American Folk Songs (1964), as kept at folkinfo.org (E minor)",
      rhythm: true,
      tonic: "E",
      abc: `M:4/4
L:1/8
K:G
 B,2 |G2 G2 F2 F2 |G2 G2 E4 |B,2 B,2 ^D D3 | E4 z2
 B,2 |G2 G2 F2 F2 |G2 G2 E4 |B,2 B,2 ^D D3 | E8 |`,
    },
    {
      // Line 1 only: in line 2 this transcription drops the sharp on "peo-ple" (F, where line 1 and Lomax have F♯).
      from: "The Digital Tradition (G minor): line 1, pitches only (it starts the second note of bar 2 an eighth early)",
      rhythm: false,
      tonic: "G",
      bars: 4,
      abc: `M:4/4
L:1/4
K:Bb
 D| B B A A| B/2 B3/2 G2| D D ^F/2 F3/2| G3 D| B B A A| B/2 B3/2 G2|\\
 D D F/2 F3/2| G3 z|`,
    },
  ],
  "song.joshua-fit-the-battle": [
    {
      from: "F. Nordberg, musicaviva.com (D minor)",
      rhythm: true,
      tonic: "D",
      abc: `M:C
L:1/8
K:Dm
"Dm"D^CDE FF G2|"Dm"A A2 A-A4|"A7"G G2 G-G4|"Dm"A A2 A-A4|
"Dm"D^CDE FF G2|"Dm"A A2 A-A2 FG|"A7"A2 G2 F2 E2|"Dm"D6"^Fine"||dd|
"Dm"dA AA A3 A|"Dm"A A3- "A7"A2 AA|"Dm"AA AA A2 A2|"A7"A6 ^c2|
"Dm"d2 A2 "A7"A A3|"Dm"A2 A2- "A7"A2 AA|"Dm"AA G2 "A7"E2 D2|"Dm"D8|]`,
    },
  ],
  "song.wayfaring-stranger": [
    {
      from: 'The Digital Tradition, "I\'m Just a Poor Wayfaring Stranger" (D minor)',
      rhythm: true,
      tonic: "D",
      abc: `M:4/4
L:1/8
K:F
 z4 z DE D| A4- AF GA| F D3- DD DA| G4- GD FG| A4- AD DD| A4- AF GA|\\
 F D3- DD DA| G3 F D2 C2| D4- DA Ac| d3 A c2 A2| G D3- DA Ac| d3 c A2 G2|\\
 A4- AA dc| A3 F G2A-G| F2 D3 DD A| G3 F D2 C2| D4- D z3|`,
    },
  ],
  "song.greensleeves": [
    {
      from: "B. Olson's fiddle tunebook, B168 (G minor, 6/4)",
      rhythm: true,
      tonic: "G",
      // Chappell's "oldest copy", as two readers of it agree: bar 16 holds 1, bars 18 and 26 are ♭7 dq, ♯6 e, 5 q,
      // bar 29 passes through 2. Pinned note by note in section 3.
      differs: [16, 18, 26, 29],
      abc: `L:1/4
M:6/4
K:Gm
G|B2cd3/2e/2d|c2AF3/2G/2A|B2GG3/2^F/2G|A2^FD2G|\\
B2cd3/2e/2d|c2AF3/2G/2A|B3/2A/2G^F3/2=E/2F|G3D3|\\
(f3f2)=e/2d/2|c2AF3/2G/2A|B2GG3/2^F/2G|A2^FD3|\\
(f3f2)=e/2d/2|c2AF3/2G/2A|B2G^F3/2=E/2F|(G3G2)|]`,
    },
  ],
  "song.careless-love": [
    {
      from: "The Digital Tradition (F)",
      rhythm: true,
      tonic: "F",
      abc: `M:4/4
L:1/4
K:F
 A3 F| E C E G| F4-| F2 z2| A3 B| c c d c| G4-| G2 A B| A3 B| c2 c2|\\
 d2 B2| F2 G- ^G| A3 F| E C E G| F4-| F2 z2|`,
    },
  ],
  "song.frankie-and-johnny": [
    {
      from: 'The Digital Tradition, "Frankie and Johnnie" (C)',
      rhythm: true,
      tonic: "C",
      moved: [[37.75, 37.5]],
      abc: `M:4/4
L:1/8
K:C
 CD E A2 G E2| C2 C6| CD E A2 G E2| C6 z C| FG A c2 d A2| c2 c4 AB|\\
 c c2 c B2 A2| G2 E2 E2 E2| D8| z2 E3/2 D/2 E E3| C8|`,
    },
  ],
};

const KEY_SIGS: Record<string, Record<string, number>> = {
  C: {},
  G: { F: 1 },
  F: { B: -1 },
  Bb: { B: -1, E: -1 },
  Dm: { B: -1 },
  Gm: { B: -1, E: -1 },
};
const LETTER: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** The attacks of an ABC tune, `beat` counted in quarters from the downbeat of its first full bar. */
function readAbc(abc: string, pickupBar: boolean): { beat: number; midi: number }[] {
  const header = (k: string) => new RegExp(`^${k}:(.*)$`, "m").exec(abc)?.[1]?.trim() ?? "";
  const meter = header("M") === "C" ? "4/4" : header("M");
  const barBeats = (Number(meter.split("/")[0]) * 4) / Number(meter.split("/")[1]);
  const [ln, ld] = header("L").split("/").map(Number) as [number, number];
  const unit = (4 * ln) / ld;
  const sig = KEY_SIGS[header("K")];
  if (!sig) throw new Error(`no key signature for ${header("K")}`);
  const body = abc
    .split("\n")
    .filter((l) => !/^[A-Za-z]:/.test(l))
    .join(" ")
    .replace(/"[^"]*"/g, "")
    .replace(/[\\()[\]]/g, "");
  const out: { beat: number; midi: number; bar: number }[] = [];
  const token = /(\^|_|=)?([A-Ga-gz])([,']*)(\d*)(\/?)(\d*)|(-)|(\|+)/g;
  let t = 0;
  let bar = 0;
  let barStart = 0;
  let acc: Record<string, number> = {};
  let tied: number | null = null;
  let firstBarLength: number | null = null;
  for (const m of body.matchAll(token)) {
    if (m[8]) {
      if (t > barStart) {
        if (firstBarLength === null) firstBarLength = t - barStart;
        bar++;
        barStart = t;
      }
      acc = {};
      continue;
    }
    if (m[7]) continue;
    const [, mark, letter, octs, num, slash, den] = m as unknown as string[];
    const len = (num ? Number(num) : 1) / (slash ? (den ? Number(den) : 2) : 1);
    const dur = len * unit;
    if (letter !== "z") {
      const up = (letter as string).toUpperCase();
      let midi = 60 + (LETTER[up] as number) + ((letter as string) === up ? 0 : 12);
      for (const o of octs as string) midi += o === "," ? -12 : 12;
      const where = `${up}${midi - (LETTER[up] as number)}`;
      if (mark) acc[where] = mark === "^" ? 1 : mark === "_" ? -1 : 0;
      midi += acc[where] ?? sig[up] ?? 0;
      const isTie = /^\s*-/.test(body.slice((m.index ?? 0) + m[0].length));
      if (tied !== midi) out.push({ beat: t, midi, bar });
      tied = isTie ? midi : null;
    } else tied = null;
    t += dur;
  }
  const first = firstBarLength ?? barBeats;
  const shift = pickupBar ? first : first < barBeats - 1e-9 ? first : 0;
  return out.map((a) => ({ beat: round(a.beat - shift), midi: a.midi }));
}

const round = (x: number) => Math.round(x * 1e6) / 1e6;
const rat = (x: string): number => {
  const [a, b] = x.split("/").map(Number);
  return b ? (a as number) / b : (a as number);
};
const beatsOf = (s: SongDef): number => Number(s.meter.split("/")[0]);
const cyclesOf = (s: SongDef): number => s.answerKey.bars + (s.pickup ? 1 : 0);
const tempo = (s: SongDef) => `setcpm(${s.bpm}/${beatsOf(s)})`;
const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const pcOf = (tonic: string): number =>
  ((((PC[tonic[0] as string] as number) + (tonic.includes("#") ? 1 : tonic.includes("b") ? -1 : 0)) % 12) +
    12) %
  12;

/** The melody's notes, `beat` in quarters from the downbeat of bar 1 (the pickup is negative). */
async function melodyOf(s: SongDef) {
  const r = await evalHeadless(`${tempo(s)}\n\nmel: ${s.answerKey.layers.melody}`, cyclesOf(s));
  const lead = s.pickup ? 1 : 0;
  return r.events
    .filter((e) => e.track === "mel" && e.midi !== null)
    .map((e) => ({
      cycle: rat(e.begin),
      beat: round((rat(e.begin) - lead) * beatsOf(s)),
      len: round((rat(e.end) - rat(e.begin)) * beatsOf(s)),
      midi: e.midi as number,
    }));
}

describe("each answer key plays the notes of a separate transcription", () => {
  for (const s of songs)
    for (const src of SOURCES[s.id] ?? [])
      test(`${s.id}: ${src.from}`, async () => {
        const end = (src.bars ?? s.answerKey.bars) * beatsOf(s);
        const kept = (beat: number) =>
          beat < end - 1e-9 && !src.differs?.includes(Math.floor(beat / beatsOf(s) + 1e-9) + 1);
        const theirs = readAbc(src.abc, !!s.pickup).filter((a) => kept(a.beat));
        const ours = (await melodyOf(s)).filter((n) => kept(n.beat));
        expect(ours.length).toBe(theirs.length);
        // Pitches: one fixed interval, the difference of the two keys (any octave).
        const shifts = new Set(ours.map((n, i) => n.midi - (theirs[i]?.midi ?? Number.NaN)));
        expect(shifts.size).toBe(1);
        const [shift] = [...shifts] as [number];
        const expected = pcOf(s.key.tonic) - pcOf(src.tonic);
        expect((((shift - expected) % 12) + 12) % 12).toBe(0);
        // Onsets, bar by bar, except the declared moves.
        if (src.rhythm) {
          const moved = new Map((src.moved ?? []).map(([a, b]) => [a, b] as const));
          const want = theirs.map((a) => moved.get(a.beat) ?? a.beat);
          expect(ours.map((n) => n.beat)).toEqual(want);
        } else {
          const barOf = (beat: number) => Math.floor(beat / beatsOf(s) + 1e-9);
          expect(ours.map((n) => barOf(n.beat))).toEqual(theirs.map((a) => barOf(a.beat)));
        }
      });

  test("every song has a source with its rhythm, and Go Down Moses a second one for its pitches", () => {
    for (const s of songs) expect([s.id, SOURCES[s.id]?.some((x) => x.rhythm)]).toEqual([s.id, true]);
    expect(SOURCES["song.go-down-moses"]?.length).toBe(2);
  });
});

// --- 2. shape rules and the registry ---------------------------------------------------------------------

describe("the shape of every answer key", () => {
  for (const s of songs)
    describe(s.id, () => {
      test("the registry entry and the song agree; still unverified, provenance 1930 or earlier", () => {
        const e = songById.get(s.id);
        expect(e).toBeDefined();
        expect([s.title, s.year, s.status, s.key, s.meter, s.form]).toEqual([
          e?.title,
          e?.year,
          e?.status,
          e?.key,
          e?.meter,
          e?.form,
        ] as never);
        expect(s.pickup).toEqual(e?.pickup as never);
        expect(s.provenance).toEqual(e?.provenance as never);
        expect(s.provenance.year).toBeLessThanOrEqual(1930);
        expect(e?.verified).toBe(false);
        expect(s.verifiedBy).toBe(PENDING_VERIFIER);
      });

      test("plain rhythm (contracts §2.8): no dot, no tie, a half on a beat, nothing over a bar line", async () => {
        const per = beatsOf(s);
        for (const n of await melodyOf(s)) {
          const inBar = round((n.cycle % 1) * per);
          const where = `${s.id} beat ${n.beat}`;
          expect([where, [4, 2, 1, 0.5].includes(n.len) && n.len <= per]).toEqual([where, true]);
          if (n.len >= 2) expect([where, Number.isInteger(inBar)]).toEqual([where, true]);
          if (n.len === 4) expect([where, inBar]).toEqual([where, 0]);
          expect([where, inBar + n.len <= per + 1e-9]).toEqual([where, true]);
        }
      });

      test("a range a beginner can sing: B3 to D5, at most a tenth", async () => {
        const midis = (await melodyOf(s)).map((n) => n.midi);
        expect(Math.min(...midis)).toBeGreaterThanOrEqual(59);
        expect(Math.max(...midis)).toBeLessThanOrEqual(74);
        expect(Math.max(...midis) - Math.min(...midis)).toBeLessThanOrEqual(16);
      });

      test("the phrases cover the tune in order; the pickup bar holds only the lead-in", async () => {
        const p = s.answerKey.phrases ?? [];
        expect(p[0]?.[0]).toBe(1);
        expect(p.at(-1)?.[1]).toBe(s.answerKey.bars);
        for (let i = 1; i < p.length; i++) expect(p[i]?.[0]).toBe((p[i - 1]?.[1] ?? 0) + 1);
        const notes = await melodyOf(s);
        if (s.pickup) {
          const lead = s.pickup.units[0] / s.pickup.units[1];
          expect(notes[0]?.beat).toBe(-lead);
        } else expect(notes[0]?.beat).toBe(0);
      });

      test("the chart, the chords layer and the bass agree; most strong beats are chord notes", async () => {
        const per = beatsOf(s);
        const lead = s.pickup ? 1 : 0;
        const r = await evalHeadless(s.answerKey.code, cyclesOf(s));
        const chart = s.answerKey.chords ?? [];
        expect(new Set(chart.map((c) => c.bar)).size).toBe(s.answerKey.bars);
        let strong = 0;
        let fit = 0;
        for (const [i, c] of chart.entries()) {
          const chord = parseChordSymbol(c.symbol);
          expect([c.symbol, chord !== null, c.symbol in VOICINGS]).toEqual([c.symbol, true, true]);
          const from = c.bar - 1 + lead + (c.beat - 1) / per;
          const next = chart[i + 1];
          const to = next && next.bar === c.bar ? next.bar - 1 + lead + (next.beat - 1) / per : c.bar + lead;
          const at = (track: string) =>
            r.events.filter(
              (e) => e.track === track && rat(e.begin) >= from - 1e-9 && rat(e.begin) < to - 1e-9,
            );
          const want = new Set<number>(chord ? chordPcs(chord) : []);
          const pcs = new Set(at("chords").map((e) => (((e.midi as number) % 12) + 12) % 12));
          expect([c.symbol, [...pcs].sort()]).toEqual([c.symbol, [...want].sort()]);
          const bass = at("bass");
          expect([c.symbol, bass.length]).toEqual([c.symbol, 1]);
          expect([c.symbol, ((((bass[0]?.midi as number) % 12) + 12) % 12) as number]).toEqual([
            c.symbol,
            chord?.rootPc as number,
          ]);
          // Strong beats: 1 and 3 in 4/4, 1 in 3/4. A note sounding there counts, attacked or held.
          for (const b of per === 4 ? [0, 0.5] : [0]) {
            const t = c.bar - 1 + lead + b;
            if (t < from - 1e-9 || t >= to - 1e-9) continue;
            const n = r.events.find(
              (e) => e.track === "mel" && rat(e.begin) <= t + 1e-9 && rat(e.end) > t + 1e-9,
            );
            if (!n) continue;
            strong++;
            if (want.has((((n.midi as number) % 12) + 12) % 12)) fit++;
          }
        }
        expect(fit / strong).toBeGreaterThanOrEqual(0.6);
      });
    });
});

// --- the musical claims the song files make ---------------------------------------------------------------

describe("what the song files say about the tunes", () => {
  const pcs = async (s: SongDef) => new Set((await melodyOf(s)).map((n) => n.midi % 12));
  test("Go Down Moses: 'let my people go' climbs 5, 5, ♯7, ♯7, 1 (E E G♯ G♯ A), the raised 7 a half step below home", async () => {
    const notes = await melodyOf(goDownMoses);
    const bar3 = notes.filter((n) => n.beat >= 8 && n.beat < 12).map((n) => n.midi);
    expect(bar3).toEqual([64, 64, 68, 68]);
    expect(notes.find((n) => n.beat === 12)?.midi).toBe(69);
    expect(notes[0]?.midi).toBe(64);
  });
  test("Joshua: the raised 7 (C♯) and no C natural; Greensleeves: ♭6 and ♯6 (C and C♯), the raised 7 D♯", async () => {
    const j = await pcs(joshua);
    expect([j.has(1), j.has(0)]).toEqual([true, false]);
    const g = await pcs(greensleeves);
    expect([g.has(0), g.has(1), g.has(3), g.has(2)]).toEqual([true, true, true, true]);
  });
  test("Greensleeves follows Chappell in bars 16, 18, 26 and 29, where the modern transcription differs", async () => {
    const notes = await melodyOf(greensleeves);
    const bar = (b: number) =>
      notes.filter((n) => n.beat >= (b - 1) * 3 && n.beat < b * 3).map((n) => [n.beat - (b - 1) * 3, n.midi]);
    // Bar 16: the second strain ends on home, E, not on B below it.
    expect(bar(16)).toEqual([[0, 64]]);
    // Bars 18 and 26: D (♭7) dotted quarter, C♯ (♯6) eighth, B (5) quarter, set as quarter, eighth rest, eighth, quarter.
    for (const b of [18, 26])
      expect(bar(b)).toEqual([
        [0, 74],
        [1.5, 73],
        [2, 71],
      ]);
    // Bar 29: G (♭3) dotted quarter, F♯ (2) eighth, E (1) quarter, as bar 13.
    expect(bar(29)).toEqual([
      [0, 67],
      [1.5, 66],
      [2, 64],
    ]);
    expect(bar(29)).toEqual(bar(13));
    // The transcription really differs in each bar the test of section 1 leaves out.
    // (G minor down a minor third to E minor; bar 13, which both share, checks the transposition.)
    const olson = SOURCES["song.greensleeves"]?.[0];
    const theirs = readAbc(olson?.abc ?? "", true);
    const at = (b: number) =>
      theirs
        .filter((a) => a.beat >= (b - 1) * 3 && a.beat < b * 3)
        .map((a) => [a.beat - (b - 1) * 3, a.midi - 3]);
    expect(at(13)).toEqual(bar(13));
    expect(olson?.differs).toEqual([16, 18, 26, 29]);
    for (const b of olson?.differs ?? []) expect([b, at(b)]).not.toEqual([b, bar(b)]);
  });
  test("Wayfaring Stranger: natural minor only (D E F G A C, no B or C♯)", async () => {
    expect([...(await pcs(wayfaring))].sort((a, b) => a - b)).toEqual([0, 2, 4, 5, 7, 9]);
  });
  test("Careless Love: one chromatic passing note, G♯ between G and A (bar 12)", async () => {
    const notes = await melodyOf(carelessLove);
    const chromatic = notes.filter((n) => ![0, 2, 4, 5, 7, 9, 10].includes(n.midi % 12));
    expect(chromatic.map((n) => [n.beat, n.midi])).toEqual([[47, 68]]);
  });
});

// --- 4. the L6 songs through the real grader -------------------------------------------------------------

const ctx = {
  params: {},
  attemptNo: 1,
  firstAttempt: true,
  rung: 0 as const,
  tutorHints: 0,
  extraReplays: 0,
  lint: {
    profile: "graded" as const,
    unlocked: unlockedFor("X2.S1" as never),
    allowPreview: false,
    meter: "4/4" as const,
    key: null,
  },
};

beforeAll(async () => {
  await grader.initRealm({ toolbox: [...toolbox], lockdown: false });
});

describe("L6 and X2: the blues songs", () => {
  for (const s of L6)
    describe(s.id, () => {
      test("4-bar lines from bar 1, the three layers, swing 8ths declared", () => {
        const lines = s.answerKey.phrases ?? [];
        expect(lines.every(([a, b]) => b - a + 1 === 4)).toBe(true);
        expect(lines.at(-1)?.[1]).toBe(/12-bar/.test(s.form) ? 12 : 16);
        for (const l of ["melody", "bass", "chords"] as const) expect(s.answerKey.layers[l]).toBeTruthy();
        expect(s.swing).toEqual({ subdivision: 8, amount: 1 / 3 });
        expect(songById.get(s.id)?.ladder).toBe(6);
      });

      test("bass ≥ 0.90, changes ≥ 0.85 and every melody line ≥ 0.85 pass with the answer key; a wrong bass line fails", async () => {
        const n = (s.answerKey.phrases ?? []).length;
        const code = s.answerKey.code;
        const grade = (item: grader.SongLadderItem, c = code) =>
          grader.gradeSongLadder({ item, song: s, code: c, ctx });
        const id = `lad.6.${s.id.replace("song.", "")}`;
        for (const stage of ["bass", "changes"] as const) {
          const r = await grade({ itemId: id, level: 6, phrase: [1, n], stage });
          expect([stage, r.status, r.score]).toEqual([stage, "pass", 1]);
        }
        for (let p = 1; p <= n; p++) {
          const r = await grade({ itemId: `${id}.${p}`, level: 6, phrase: p, stage: "melody" });
          expect([p, r.status, r.score]).toEqual([p, "pass", 1]);
        }
        // A bass that stays on one note (C) under every chord: the bass stage fails.
        const bass = s.answerKey.layers.bass as string;
        const flat = code.replace(bass, `note("<${"c2 ".repeat(s.answerKey.bars).trim()}>").s("ebass")`);
        expect(flat).not.toBe(code);
        const r = await grade({ itemId: id, level: 6, phrase: [1, n], stage: "bass" }, flat);
        expect(r.status).toBe("fail");
      });
    });
});
