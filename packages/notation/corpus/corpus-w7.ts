// Wave 7 golden corpus (entries 332–): the advanced tracks. Jazz: chord symbols with extensions, alterations, sus and
// slash chords in lead-sheet and jazz-glyph form; rootless, shell and drop-2 voicings on the grand staff; walking
// basses whose chromatic approach tones are spelled by direction; comping as slash notation (the Charleston, the
// push, four to the bar); 32-bar and 34-bar charts with section letters, four bars a line. Rhythm: sixteenth swing
// printed straight; odd meters beamed by their grouping with the grouping in the time signature; the hemiola across
// the bar; 3:2 and 4:3 as bracketed tuplets against a second voice; a polymeter in one meter with accents; the
// two-bar clave in both directions; ghost notes. Arrangement: roles and registers, a counter-line. The hooks are the
// lesson material of content/specs (J1–J5, R1–R3, A2), copied as written so a later spec edit does not move a
// snapshot. Every entry is evaluated by headless Strudel 1.2.6 and read back from the ABC independently
// (corpus.test.ts: the pitches and durations parsed from the ABC equal the input; bracket texts, slash heads, accents
// and the time signature are read back too). The note lists and spellings below were checked by hand.
//
// The three standards of the jazz track. I Got Rhythm's chart is rhythm changes as @oak/theory writes them (the jazz
// form, 32 bars) and the 1930 refrain's 34-bar shape (the last A with its two-bar tag). Georgia on My Mind and Body
// and Soul have no answer key in content/repertoire yet (author:repertoire writes them from 1930 prints): their
// entries are the ENGRAVER'S fixtures in each song's key and form (Georgia: F, AABA, 32 bars; Body and Soul: D♭,
// AABA, the bridge a half step up in D and then in C), over common-practice ii–V changes written for this corpus,
// under a line written for it. They are NOT the tunes and are never shown to a learner. Each song's own answer key
// is engraved and read back by standards-w7.test.ts as soon as it exists.
import type { KeySpec } from "@oak/content-kit";
import { rat } from "@oak/content-kit";
import { rhythmChanges } from "@oak/theory";
import { formSectionMarks, hemiolaBracket, polymeterMarks, polyrhythmMarks } from "../src/wave7.ts";
import type { CorpusEntry } from "./harness.ts";

const T = (bpm: number, per = 4) => `setcpm(${bpm}/${per})\n\n`;
const key = (tonic: string, mode = "major"): KeySpec => ({ tonic, mode }) as KeySpec;
const C = key("C");
const F = key("F");
const Bb = key("Bb");
/** Triplet swing as the grader's `swingView` measures it on one track (the off-beat two thirds into the pair). */
const SWUNG_8THS = [
  { swung: 8 as const, eighths: { p: [2, 3] as [number, number] }, sixteenths: { p: null } },
];
/** Chord labels from a chart: one or two chords a bar (the second on beat 3), from cycle `from`. */
const chartChords = (bars: readonly (readonly string[])[], from = 0) =>
  bars.flatMap((b, i) => b.map((symbol, k) => ({ bar: from + i, beat: k === 0 ? 1 : 3, symbol })));
/** Labels at every beat of each bar: `[["C6", "C69", "C9", "C13"], …]`. */
const perBeat = (bars: readonly (readonly string[])[]) =>
  bars.flatMap((b, i) => b.map((symbol, k) => ({ bar: i, beat: 1 + (k * 4) / b.length, symbol })));
/** A chart as Strudel mini-notation (`<[Bb^7 Gm7] [Cm7 F7] …>`). */
const mini = (bars: readonly (readonly string[])[]) =>
  `<${bars.map((b) => (b.length === 1 ? b[0] : `[${b.join(" ")}]`)).join(" ")}>`;

// --- the lesson hooks (content/specs), as written ---------------------------------------------------------------
const RIDE = 's("rd [rd rd] rd [rd rd]").bank("jazzkit")';
const J1_L01_TRIO = `${T(132)}bass: note("<[d2 a1] [g1 d2] [c2 g1] [c2 e2]>").s("upright")
chords: chord("<Dm7 G7 C^7 C^7>").dict("lefthand").voicing().struct("x ~ ~ x ~ ~ ~ ~").swingBy(1/3, 4).s("rhodes").gain(.6)`;
const J1_L02 = `${T(116)}const changes = "<F6 Dm7 Gm7 [C7sus C7]>"

chords: chord(changes).voicing().s("rhodes")
bass: chord(changes).rootNotes(2).s("upright")`;
const J1_L05 = `${T(132)}bass: note("<[d2 a1] [g1 d2] [c2 g1] [c2 e2]>").s("upright")
chords: note("<[d3,f3,c4] [g2,f3,b3] [c3,e3,b3] [c3,e3,b3]>").struct("x ~ ~ x ~ ~ ~ ~").s("rhodes")`;
const J2_L02 = `${T(112)}mel: note("<[g4 ~ e4 d4] [bb4 ~ a4 ~] [f4 ~ ~ e4] [d4 ~ ~ ~]>").swingBy(1/3, 4).s("vibes")`;
const J2_L03 = `${T(84)}const changes = "<Fm9 Bb13 Eb^9 Eb^9>"

chords: chord(changes).dict("ireal-ext").voicing().s("rhodes")
bass: chord(changes).rootNotes(2).s("upright")`;
const J3_L01 = `${T(120)}bass: note("<[g2 d2] [c2 g1] [f1 c2] [f1 a1]>").s("upright")
chords: note("<[bb3,d4,f4,a4] [bb3,d4,e4,a4] [a3,c4,e4,g4] [a3,c4,e4,g4]>").struct("x ~ ~ x ~ ~ ~ ~").s("rhodes")`;
const J3_L02 = `${T(112)}bass: note("<d2 g1 c2 c2>").s("upright")
chords: note("<[a3,d4,f4,c5] [g3,d4,f4,b4] [g3,c4,e4,b4] [c4,g4,b4,e5]>").s("rhodes").gain(.7)`;
const J3_L03 = `${T(144)}bass: note("<[c2 g2] [f2 c2] [bb1 f2] [bb1 d2]>").s("upright")
chords: chord("<Cm7 F7 Bb^7 Bb^7>").dict("lefthand").anchor("a4").voicing().struct("x ~ ~ x ~ ~ ~ ~").s("rhodes")`;
const J4_L02_CHART = [
  ["F7"],
  ["Bb7"],
  ["F7"],
  ["Cm7", "F7"],
  ["Bb7"],
  ["Bo7"],
  ["F7"],
  ["D7"],
  ["Gm7"],
  ["C7"],
  ["F7", "D7"],
  ["Gm7", "C7"],
];
/** J4.L02's walk, as the spec writes it (note names: the code's spelling is kept). */
const J4_L02_WALK =
  "<[f2 a2 c3 b2] [bb2 a2 ab2 g2] [f2 a2 c3 db3] [c3 eb3 f2 a2] [bb2 ab2 f2 c3] [b2 ab2 f2 e2] [f2 a2 c3 c#3] [d3 c3 a2 ab2] [g2 bb2 d3 db3] [c3 bb2 g2 gb2] [f2 a2 d2 f#2] [g2 bb2 c3 e2]>";
/** The same walk in MIDI numbers: the staff spells every chromatic note itself, by the direction it moves. */
const J4_L02_WALK_MIDI =
  "<[41 45 48 47] [46 45 44 43] [41 45 48 49] [48 51 41 45] [46 44 41 48] [47 44 41 40] [41 45 48 49] [50 48 45 44] [43 46 50 49] [48 46 43 42] [41 45 38 42] [43 46 48 40]>";
const J4_L02_MEL = `note("<[f4 a4 c5 eb5] [d5 ~ bb4 ~] [c5 a4 f4 ~] [g4 ~ a4 ~] [bb4 d5 f5 ab5] [f5 ~ d5 ~] [c5 a4 f4 ~] [f#4 ~ a4 ~] [bb4 ~ d5 ~] [e5 ~ c5 ~] [a4 ~ f#4 ~] [g4 ~ e4 ~]>")`;
const J3_L04_WALK_MIDI = "<[33 36 40 39] [38 42 45 44] [43 38 35 30] [31 33 35 34]>";
const J4_L04 = `${T(160)}mel: note("<[d5 ~ bb4 d5] [eb5 ~ a4 ~] [d5 ~ bb4 g4] [c5 ~ a4 ~]>").swingBy(1/3, 4).s("vibes")`;
const J5_L01 = `${T(120)}bass: note("<[d2 a1] [db2 ab1] [c2 g1] [c2 e2]>").s("upright")
chords: chord("<Dm7 Db7 C^7 C^7>").dict("lefthand").voicing().struct("x ~ ~ x ~ ~ ~ ~").s("rhodes").gain(.6)`;
const J5_L05 = `${T(160)}const changes = "<B^7 D7 G^7 Bb7 Eb^7 F#7 B^7 B^7>"

chords: chord(changes).dict("lefthand").voicing().struct("x ~ ~ x ~ ~ ~ ~").s("rhodes").gain(.6)
bass: chord(changes).rootNotes(2).struct("x ~ x ~").s("upright")`;

const R1_L02 = `${T(88)}kick: s("bd ~ ~ ~ ~ ~ ~ bd ~ ~ bd ~ ~ ~ ~ ~").swingBy(.2, 8)
snare: s("~ sd ~ sd")
hats: s("hh*16").velocity("[1 .4 .7 .4]*4").swingBy(.2, 8).gain(.5)`;
const R1_L02_BASS = `${T(88)}bass: n("<0 3>").struct("x ~ ~ ~ ~ ~ ~ x ~ ~ x ~ ~ ~ ~ ~").scale("A1:minor").swingBy(.2, 8).s("fingerbass")`;
const R1_L03_DRUMS = `${T(100)}kick: s("bd ~ ~ bd ~ ~ bd ~ ~ ~ bd ~ ~ ~ ~ ~")
snare: s("~ ~ ~ ~ sd ~ ~ sd ~ sd ~ sd sd ~ ~ sd").velocity("[0 0 0 0 1 0 0 .3 0 .3 0 .3 1 0 0 .3]")
hats: s("hh*16").velocity("[1 .5 .8 .5]*4").gain(.5)`;
const R1_L03_BASS = `${T(100)}bass: note("e2 ~ ~ e3 ~ ~ e2 ~ ~ ~ g2 ~ a2 ~ b2 d3").s("fingerbass").clip(.5)`;
const R1_L03_KEYS = `${T(100)}keys: chord("<Em7>").voicing().struct("x ~ ~ ~ ~ x ~ x ~ ~ ~ ~ ~ x ~ ~").s("clav").clip(.3).gain(.6)`;
const R1_L04 = `${T(100)}bass: note("c2 ~ ~ ~ ~ ~ g2 ~ ~ ~ bb2 ~ ~ ~ ~ ~").s("fingerbass").clip(.6)
keys: note("~ ~ eb4 ~ ~ ~ ~ g4 ~ ~ ~ ~ bb4 ~ g4 ~").s("clav").clip(.3)
gtr: note("~ [g4,c5] ~ ~ ~ ~ ~ ~ ~ [g4,c5] ~ ~ ~ ~ ~ [g4,c5]").s("cleangtr").clip(.2).gain(.6)`;
const R1_L05 = `${T(92)}keys: chord("<Dm7 Dm7 Gm7 Gm7>").voicing().struct("x ~ x x ~ ~ ~ ~").late("<0 .125>").s("clav").clip(.3)`;
const R2_L01 = `${T(150, 5)}kick: s("bd ~ ~ bd ~")
snare: s("~ ~ sd ~ sd")
hats: s("hh*10").gain(.4)`;
const R2_L01_BASS = `${T(150, 5)}bass: n("<0 3>").struct("x ~ ~ x ~").scale("E2:minor").s("fingerbass")`;
const R2_L02 = `${T(240, 7)}kick: s("bd ~ ~ ~ bd ~ ~")
snare: s("~ ~ sd ~ ~ ~ ~")
hats: s("hh*7").velocity("1 .5 1 .5 1 .5 .5").gain(.5)`;
const R2_L02_BASS = `${T(240, 7)}bass: n("<0 5>").struct("x ~ x ~ x ~ ~").scale("A1:minor").s("fingerbass")`;
const R2_L03 = `${T(60, 2)}chords: chord("<Am7 Dm7>").voicing().struct("<[x ~ ~ x ~ ~] [x ~ x ~ x ~]>").s("rhodes").gain(.6)`;
const R2_L03_BASS = `${T(60, 2)}bass: n("<0 3>").struct("<[x ~ ~ x ~ ~] [x ~ x ~ x ~]>").scale("A1:minor").s("fingerbass")`;
const R2_L04 = `${T(80)}kick: s("bd bd")
perc: s("cb cb cb").gain(.6)`;
const R2_L04_PITCHED = `${T(80)}bass: n("<0 3>").struct("x x").scale("C2:minor").s("fingerbass")
chords: chord("<Cm7 Fm7>").voicing().struct("x x x").s("rhodes").gain(.5)`;
const R2_L05_BASS = `${T(100)}bass: n("{0 ~ 4}%4").scale("D2:minor").s("fingerbass")`;
const R3_L02_CLAVE = `${T(104)}perc: s("<[rim ~ ~ rim ~ ~ rim ~] [~ ~ rim ~ rim ~ ~ ~]>").gain(.8)`;
const R3_L02_MEL = `${T(104)}mel: note("<[e4 ~ ~ g4 ~ ~ c5 ~] [~ ~ d5 ~ b4 ~ ~ ~]>").s("piano")`;
const R3_L04 = `${T(100)}bass: note("<[~ ~ ~ g2 ~ ~ g1 ~] [~ ~ ~ d2 ~ ~ c2 ~]>").s("upright")
keys: note("<[[c4,e4] ~ ~ [e4,g4] [c4,e4] ~ [e4,g4] ~] [~ [d4,f4] [b3,d4] ~ [d4,f4] [b3,d4] ~ [e4,g4]]>").s("piano")`;
const A2_L01 = `${T(90)}bass: note("<a1 f1 c2 g1>").s("sawtooth").lpf(400)
chords: n("<[0,2,4] [-2,0,2] [-5,-3,-1] [-1,1,3]>").scale("A3:minor").s("piano").gain(.5)
mel: n("<[4 ~ 2 0] [2 ~ 0 ~] [4 2 4 ~] [1 ~ 6 ~]>").scale("A4:minor").s("square").lpf(2000).gain(.5)`;
const A2_L03 = `${T(90)}mel: n("<[4 ~ 2 0] [2 ~ 0 ~] [4 2 4 ~] [1 ~ 6 ~]>").scale("A4:minor").s("square").lpf(2000).gain(.5)
vox: n("<[~ ~ 0 2] [~ 0 2 ~] [2 ~ ~ 4] [~ 1 ~ -1]>").scale("A3:minor").s("strings").gain(.5)`;

// --- the 32-bar charts ----------------------------------------------------------------------------------------------
const RHYTHM = rhythmChanges("Bb");
/** The 1930 refrain's shape: the rhythm-changes A sections, the last A with a two-bar tag on the tonic (34 bars). */
const REFRAIN_34 = [...RHYTHM.bars, ["Cm7", "F7"], ["Bb^7"]];
/** A ballad chart in F in the shape of Georgia on My Mind (AABA, 32 bars): common-practice changes, NOT the song's. */
const BALLAD_A = [["F^7"], ["Am7", "D7"], ["Gm7"], ["C7"], ["F^7"], ["D7"], ["Gm7", "C7"], ["F^7"]];
const BALLAD_B = [["Dm7"], ["G7"], ["Dm7"], ["G7"], ["Am7"], ["D7"], ["Gm7"], ["C7"]];
const BALLAD = [...BALLAD_A, ...BALLAD_A, ...BALLAD_B, ...BALLAD_A];
/** A chart in D♭ in the shape of Body and Soul (AABA, the bridge in D, then in C): ii–V changes, NOT the song's. */
const DB_A = [
  ["Ebm7", "Bb7"],
  ["Ebm7", "Ab7"],
  ["Db^7", "Gb7"],
  ["Fm7", "Bbm7"],
  ["Ebm7", "Ab7"],
  ["Db^7"],
  ["Ebm7", "Ab7"],
  ["Db^7"],
];
const DB_BRIDGE = [
  ["Em7", "A7"],
  ["D^7"],
  ["Em7", "A7"],
  ["D^7"],
  ["Dm7", "G7"],
  ["C^7"],
  ["Dm7", "G7"],
  ["C^7"],
];
const DB_CHART = [...DB_A, ...DB_A, ...DB_BRIDGE, ...DB_A];
/**
 * A line for an engraver's fixture: per bar, two figures from a fixed set (a push tied over the bar line, a dotted
 * quarter, a quarter-note triplet, a held note) on the chord's tones, written as MIDI numbers so the staff spells them.
 */
const FIGURES = [
  (a: number, b: number, c: number) => `[${a} ${b} ${c} ${b}]`,
  (a: number, b: number, c: number) => `[${a}@3 ${b} ${c}@4]`,
  (a: number, b: number, c: number) => `[[${a} ${b} ${c}]@2 ${c}@2]`,
  (a: number, _b: number, c: number) => `[${a}@6 ${c}@2]`,
];
const PCS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const rootPc = (sym: string) => {
  const m = /^([A-G])(b|#)?/.exec(sym) as RegExpExecArray;
  return ((PCS[m[1] as string] as number) + (m[2] === "b" ? -1 : m[2] === "#" ? 1 : 0) + 12) % 12;
};
/** The chord's 3rd, 5th and 7th above `low` (MIDI), from the symbol's quality. */
const tones = (sym: string, low: number): [number, number, number] => {
  const r = rootPc(sym);
  const minor = /m(?!aj)/.test(sym.replace(/^[A-G][b#]?/, ""));
  const maj7 = sym.includes("^");
  const third = (r + (minor ? 3 : 4)) % 12;
  const fifth = (r + 7) % 12;
  const seventh = (r + (maj7 ? 11 : 10)) % 12;
  const up = (pc: number) => low + ((pc - (low % 12) + 12) % 12);
  return [up(third), up(fifth), up(seventh)];
};
const lineOver = (chart: readonly (readonly string[])[], low: number) =>
  `note("<${chart
    .map((b, i) => {
      const [a, x, c] = tones(b[0] as string, low);
      return (FIGURES[i % FIGURES.length] as (a: number, b: number, c: number) => string)(a, x, c);
    })
    .join(" ")}>")`;

export const CORPUS_W7: CorpusEntry[] = [
  // --- jazz: chord symbols, lead-sheet and glyph form ---------------------------------------------------------------
  {
    name: "332 J1.L02 hook: F6 D–7 G–7 C7sus C7 over the bass, lead-sheet symbols",
    code: J1_L02,
    bars: 4,
    key: F,
    staff: "bass",
    tracks: ["bass"],
    chords: [
      { bar: 0, beat: 1, symbol: "F6" },
      { bar: 1, beat: 1, symbol: "Dm7" },
      { bar: 2, beat: 1, symbol: "Gm7" },
      { bar: 3, beat: 1, symbol: "C7sus" },
      { bar: 3, beat: 3, symbol: "C7" },
    ],
    expect: {
      voices: { S1: "F2:1 | D2:1 | G2:1 | C2:2 C2:2" },
      chordTexts: ["F6", "Dm7", "Gm7", "C7sus4", "C7"],
    },
  },
  {
    name: "333 J1.L02 hook in jazz glyphs: F6 D–7 G–7 C7sus C7",
    code: J1_L02,
    bars: 4,
    key: F,
    staff: "bass",
    tracks: ["bass"],
    chordStyle: "jazz",
    chords: [
      { bar: 0, beat: 1, symbol: "F6" },
      { bar: 1, beat: 1, symbol: "Dm7" },
      { bar: 2, beat: 1, symbol: "Gm7" },
      { bar: 3, beat: 1, symbol: "C7sus" },
      { bar: 3, beat: 3, symbol: "C7" },
    ],
    expect: { chordTexts: ["F6", "D–7", "G–7", "C7sus", "C7"] },
  },
  {
    name: "334 extensions, lead-sheet: C6 C6/9 C9 C13 | C7♭9 C7♯9 C7alt C7♭13 | Cm11 Cmaj9 Cm6 Cm(maj7) | Csus4 C7sus4 C7♯11 Cmaj7♯11",
    code: 'note("c4*4")',
    bars: 4,
    key: C,
    staff: "treble",
    chords: perBeat([
      ["C6", "C69", "C9", "C13"],
      ["C7b9", "C7#9", "C7alt", "C7b13"],
      ["Cm11", "C^9", "Cm6", "Cm^7"],
      ["Csus", "C7sus", "C7#11", "C^7#11"],
    ]),
    expect: {
      chordTexts: [
        "C6",
        "C6/9",
        "C9",
        "C13",
        "C7♭9",
        "C7♯9",
        "C7alt",
        "C7♭13",
        "Cm11",
        "Cmaj9",
        "Cm6",
        "Cm(maj7)",
        "Csus4",
        "C7sus4",
        "C7♯11",
        "Cmaj7♯11",
      ],
    },
  },
  {
    name: "335 extensions in jazz glyphs: C6 C6/9 C9 C13 | C7♭9 C7♯9 C7alt C7♭13 | C–11 C∆9 C–6 C–∆ | Csus C7sus C7♯11 C∆♯11",
    code: 'note("c4*4")',
    bars: 4,
    key: C,
    staff: "treble",
    chordStyle: "jazz",
    chords: perBeat([
      ["C6", "C69", "C9", "C13"],
      ["C7b9", "C7#9", "C7alt", "C7b13"],
      ["Cm11", "C^9", "Cm6", "Cm^7"],
      ["Csus", "C7sus", "C7#11", "C^7#11"],
    ]),
    expect: {
      chordTexts: [
        "C6",
        "C6/9",
        "C9",
        "C13",
        "C7♭9",
        "C7♯9",
        "C7alt",
        "C7♭13",
        "C–11",
        "C∆9",
        "C–6",
        "C–∆",
        "Csus",
        "C7sus",
        "C7♯11",
        "C∆♯11",
      ],
    },
  },
  {
    name: "336 slash chords and half-diminished, lead-sheet: C7/E F/G Dm7/G B♭7/D | Dm7♭5 G7♭9 Cmaj7/B C°7",
    code: 'note("<[e4 g4 d4 d4] [f4 f4 e4 c#4]>")',
    bars: 2,
    key: C,
    staff: "treble",
    chords: perBeat([
      ["C7/E", "F/G", "Dm7/G", "Bb7/D"],
      ["Dm7b5", "G7b9", "C^7/B", "Co7"],
    ]),
    expect: {
      chordTexts: ["C7/E", "F/G", "Dm7/G", "B♭7/D", "Dm7♭5", "G7♭9", "Cmaj7/B", "C°7"],
      names: ["E4", "G4", "D4", "D4", "F4", "F4", "E4", "C#4"],
    },
  },
  {
    name: "337 slash chords and half-diminished in jazz glyphs: C7/E F/G D–7/G B♭7/D | Dø7 G7♭9 C∆7/B C°7",
    code: 'note("<[e4 g4 d4 d4] [f4 f4 e4 c#4]>")',
    bars: 2,
    key: C,
    staff: "treble",
    chordStyle: "jazz",
    chords: perBeat([
      ["C7/E", "F/G", "Dm7/G", "Bb7/D"],
      ["Dm7b5", "G7b9", "C^7/B", "Co7"],
    ]),
    expect: { chordTexts: ["C7/E", "F/G", "D–7/G", "B♭7/D", "Dø7", "G7♭9", "C∆7/B", "C°7"] },
  },
  {
    name: "338 J2.L02 hook: the minor ii–V–i in D (Eø7 A7♭9 D–7), swung eighths printed straight",
    code: J2_L02,
    bars: 4,
    key: key("D", "minor"),
    staff: "treble",
    host: true,
    hostSwing: SWUNG_8THS,
    chordStyle: "jazz",
    chords: chartChords([["Em7b5"], ["A7b9"], ["Dm7"], ["Dm7"]]),
    expect: {
      voices: { S1: "G4:4 r:4 E4:4 D4:4 | Bb4:4 r:4 A4:4 r:4 | F4:4 r:4 r:4 E4:4 | D4:4 r:4 r:2" },
      chordTexts: ["Eø7", "A7♭9", "D–7", "D–7"],
      abc: ['Q:"Swing 8ths"'],
    },
  },
  // --- jazz: voicings on the grand staff ----------------------------------------------------------------------------
  {
    name: "339 J1.L01 trio: lefthand voicings Dm7 G7 C∆7 on the Charleston over the two-feel bass, swing printed straight",
    code: J1_L01_TRIO,
    bars: 4,
    key: C,
    staff: "grand",
    host: true,
    hostSwing: SWUNG_8THS,
    chordByBar: ["Dm7", "G7", "C^7", "C^7"],
    chordTracks: ["chords"],
    chordStyle: "jazz",
    chords: chartChords([["Dm7"], ["G7"], ["C^7"], ["C^7"]]),
    expect: { chordTexts: ["D–7", "G7", "C∆7", "C∆7"], staves: ["RH:treble", "LH:bass"] },
  },
  {
    name: "340 J1.L05 shells by hand: root–7–3 and root–3–7 on the bass staff over the two-feel bass",
    code: J1_L05,
    bars: 4,
    key: C,
    staff: "bass",
    chordByBar: ["Dm7", "G7", "C^7", "C^7"],
    chordTracks: ["chords"],
    chords: chartChords([["Dm7"], ["G7"], ["C^7"], ["C^7"]]),
    expect: { chordTexts: ["Dm7", "G7", "Cmaj7", "Cmaj7"] },
  },
  {
    name: "341 J3.L01 rootless A and B by hand: G–7 (B♭ D F A), C7 (B♭ D E A), F∆7 (A C E G) over the bass",
    code: J3_L01,
    bars: 4,
    key: F,
    staff: "grand",
    split: "track",
    chordByBar: ["Gm7", "C7", "F^7", "F^7"],
    chordTracks: ["chords"],
    chordStyle: "jazz",
    chords: chartChords([["Gm7"], ["C7"], ["F^7"], ["F^7"]]),
    expect: { chordTexts: ["G–7", "C7", "F∆7", "F∆7"], staves: ["RH:treble", "LH:bass"] },
  },
  {
    name: "342 J3.L02 drop-2 voicings in C: D–7 G7 C∆7 C∆7 (the top voice C B B E) over the bass",
    code: J3_L02,
    bars: 4,
    key: C,
    staff: "grand",
    split: "track",
    chordByBar: ["Dm7", "G7", "C^7", "C^7"],
    chordTracks: ["chords"],
    chordStyle: "jazz",
    chords: chartChords([["Dm7"], ["G7"], ["C^7"], ["C^7"]]),
    expect: { staves: ["RH:treble", "LH:bass"] },
  },
  {
    name: "343 J3.L03 lefthand voicings anchored at a4: C–7 F7 B♭∆7 on the Charleston over the bass",
    code: J3_L03,
    bars: 4,
    key: Bb,
    staff: "grand",
    split: "track",
    chordByBar: ["Cm7", "F7", "Bb^7", "Bb^7"],
    chordTracks: ["chords"],
    chordStyle: "jazz",
    chords: chartChords([["Cm7"], ["F7"], ["Bb^7"], ["Bb^7"]]),
    expect: { chordTexts: ["C–7", "F7", "B♭∆7", "B♭∆7"] },
  },
  {
    name: "344 J2.L03 ireal-ext voicings: F–9 B♭13 E♭∆9 over the roots, in E♭",
    code: J2_L03,
    bars: 4,
    key: key("Eb"),
    staff: "grand",
    split: "track",
    chordByBar: ["Fm9", "Bb13", "Eb^9", "Eb^9"],
    chordTracks: ["chords"],
    chordStyle: "jazz",
    chords: chartChords([["Fm9"], ["Bb13"], ["Eb^9"], ["Eb^9"]]),
    expect: { chordTexts: ["F–9", "B♭13", "E♭∆9", "E♭∆9"] },
  },
  {
    name: "345 rootless G13 and G7alt spelled by the chord (F B E A, F B E♭ A♭), resolving to C∆9 (E A D G)",
    code: 'chords: note("<[f3,b3,e4,a4] [f3,b3,eb4,ab4] [e3,a3,d4,g4]>")',
    bars: 3,
    key: C,
    staff: "treble",
    chordByBar: ["G13", "G7alt", "C^9"],
    chordTracks: ["chords"],
    chords: chartChords([["G13"], ["G7alt"], ["C^9"]]),
    expect: {
      voices: { S1: "[F3,B3,E4,A4]:1 | [F3,B3,Eb4,Ab4]:1 | [E3,A3,D4,G4]:1" },
      chordTexts: ["G13", "G7alt", "Cmaj9"],
    },
  },
  {
    name: "346 the same voicings as numbers (no written names): the staff spells G7alt's ♭9 and ♯5 from the chord",
    code: 'chords: note("<[53,59,64,69] [53,59,63,68] [52,57,62,67]>")',
    bars: 3,
    key: C,
    staff: "treble",
    chordByBar: ["G13", "G7alt", "C^9"],
    chordTracks: ["chords"],
    chords: chartChords([["G13"], ["G7alt"], ["C^9"]]),
    expect: { voices: { S1: "[F3,B3,E4,A4]:1 | [F3,B3,Eb4,Ab4]:1 | [E3,A3,D4,G4]:1" } },
  },
  {
    name: "347 J5.L01 tritone sub: D–7 D♭7 C∆7 in lefthand voicings over the bass (D♭ A♭ written as flats)",
    code: J5_L01,
    bars: 4,
    key: C,
    staff: "grand",
    split: "track",
    chordByBar: ["Dm7", "Db7", "C^7", "C^7"],
    chordTracks: ["chords"],
    chordStyle: "jazz",
    chords: chartChords([["Dm7"], ["Db7"], ["C^7"], ["C^7"]]),
    expect: { chordTexts: ["D–7", "D♭7", "C∆7", "C∆7"] },
  },
  {
    name: "348 J5.L05 Coltrane changes: B∆7 D7 G∆7 B♭7 E♭∆7 F♯7 B∆7 in lefthand voicings over the roots",
    code: J5_L05,
    bars: 8,
    key: key("B"),
    staff: "grand",
    split: "track",
    chordByBar: ["B^7", "D7", "G^7", "Bb7", "Eb^7", "F#7", "B^7", "B^7"],
    chordTracks: ["chords"],
    chordStyle: "jazz",
    chords: chartChords([["B^7"], ["D7"], ["G^7"], ["Bb7"], ["Eb^7"], ["F#7"], ["B^7"], ["B^7"]]),
    expect: { chordTexts: ["B∆7", "D7", "G∆7", "B♭7", "E♭∆7", "F♯7", "B∆7", "B∆7"] },
  },
  // --- jazz: walking bass ---------------------------------------------------------------------------------------------
  {
    name: "349 J4.L02 the jazz-blues walk in F as the spec writes it (the code's names are kept)",
    code: `${T(132)}bass: note("${J4_L02_WALK}").s("upright")`,
    bars: 12,
    key: F,
    staff: "bass",
    chords: chartChords(J4_L02_CHART),
    abcOptions: { barsPerLine: 4 },
    expect: {
      names: [
        ..."F2 A2 C3 B2 Bb2 A2 Ab2 G2 F2 A2 C3 Db3 C3 Eb3 F2 A2".split(" "),
        ..."Bb2 Ab2 F2 C3 B2 Ab2 F2 E2 F2 A2 C3 C#3 D3 C3 A2 Ab2".split(" "),
        ..."G2 Bb2 D3 Db3 C3 Bb2 G2 Gb2 F2 A2 D2 F#2 G2 Bb2 C3 E2".split(" "),
      ],
    },
  },
  {
    name: "350 the same walk in MIDI numbers: every chromatic approach spelled by its direction (B into B♭, C♯ into D, A♭ into G, G♭ into F)",
    code: `${T(132)}bass: note("${J4_L02_WALK_MIDI}").s("upright")`,
    bars: 12,
    key: F,
    staff: "bass",
    chords: chartChords(J4_L02_CHART),
    abcOptions: { barsPerLine: 4 },
    expect: {
      names: [
        ..."F2 A2 C3 B2 Bb2 A2 Ab2 G2 F2 A2 C3 Db3 C3 Eb3 F2 A2".split(" "),
        ..."Bb2 Ab2 F2 C3 B2 Ab2 F2 E2 F2 A2 C3 C#3 D3 C3 A2 Ab2".split(" "),
        ..."G2 Bb2 D3 Db3 C3 Bb2 G2 Gb2 F2 A2 D2 F#2 G2 Bb2 C3 E2".split(" "),
      ],
    },
  },
  {
    name: "351 J3.L04 the walk in G as numbers: E♭ into D, A♭ into G, B♭ into A (approached from above, written flat)",
    code: `${T(132)}bass: note("${J3_L04_WALK_MIDI}").s("upright")`,
    bars: 4,
    key: key("G"),
    staff: "bass",
    chords: chartChords([["Am7"], ["D7"], ["G^7"], ["G^7"]]),
    expect: { names: "A1 C2 E2 Eb2 D2 F#2 A2 Ab2 G2 D2 B1 F#1 G1 A1 B1 Bb1".split(" ") },
  },
  {
    name: "352 J4.L02 the walk under the head: melody and bass on the grand staff, jazz-blues chart in jazz glyphs",
    code: `${T(132)}bass: note("${J4_L02_WALK}").s("upright")\nmel: ${J4_L02_MEL}.s("mutetpt")`,
    bars: 12,
    key: F,
    staff: "grand",
    split: "track",
    chordStyle: "jazz",
    chords: chartChords(J4_L02_CHART),
    abcOptions: { barsPerLine: 4 },
    expect: {
      staves: ["RH:treble", "LH:bass"],
      chordTexts: [..."F7 B♭7 F7 C–7 F7 B♭7 B°7 F7 D7 G–7 C7 F7 D7 G–7 C7".split(" ")],
    },
  },
  // --- jazz: comping as slash notation ------------------------------------------------------------------------------
  {
    name: "353 J1.L05 Charleston comping as slashes: on 1 and on the and of 2 under D–7 G7 C∆7",
    code: J1_L05,
    bars: 4,
    key: C,
    comping: "chords",
    chordStyle: "jazz",
    chords: chartChords([["Dm7"], ["G7"], ["C^7"], ["C^7"]]),
    expect: { chordTexts: ["D–7", "G7", "C∆7", "C∆7"], staves: ["S1:perc"] },
  },
  {
    name: "354 J3.L03 Charleston slashes in B♭ (lefthand voicings anchored at a4), lead-sheet symbols",
    code: J3_L03,
    bars: 4,
    key: Bb,
    comping: "chords",
    chords: chartChords([["Cm7"], ["F7"], ["Bb^7"], ["Bb^7"]]),
    expect: { chordTexts: ["Cm7", "F7", "B♭maj7", "B♭maj7"] },
  },
  {
    name: "355 the push: each chord on the and of 4, tied over the bar line into the chord it anticipates",
    code: `${T(144)}chords: chord("<F6 D7 Gm7 C7>").voicing().struct("x@2 ~@6").early(1/8).s("rhodes")`,
    bars: 4,
    key: F,
    comping: "chords",
    chordStyle: "jazz",
    chords: chartChords([["F6"], ["D7"], ["Gm7"], ["C7"]]),
    expect: { rhythm: { tiesAcrossBar: 4, tuplets: [] } },
  },
  {
    name: "356 comping in four: a slash on every beat under two chords a bar (rhythm changes, bars 1–4)",
    code: `${T(176)}chords: chord("${mini(RHYTHM.bars.slice(0, 4))}").voicing().struct("x x x x").s("rhodes")`,
    bars: 4,
    key: Bb,
    comping: "chords",
    chordStyle: "jazz",
    chords: chartChords(RHYTHM.bars.slice(0, 4)),
    expect: { chordTexts: ["B♭∆7", "G–7", "C–7", "F7", "B♭∆7", "G–7", "C–7", "F7"] },
  },
  {
    name: "357 an anticipation inside the bar: a dotted quarter, then a chord on the and of 2 held to beat 4",
    code: `${T(120)}chords: chord("<Dm7 G7>").voicing().struct("x@3 x@3 ~@2").s("rhodes")`,
    bars: 2,
    key: C,
    comping: "chords",
    chords: chartChords([["Dm7"], ["G7"]]),
    expect: {
      rhythm: { dotted: 2, ties: 2, tuplets: [] },
      voices: { S1: "rhythm:4. rhythm:8~ rhythm:4 r:4 | rhythm:4. rhythm:8~ rhythm:4 r:4" },
    },
  },
  {
    name: "358 R1.L03 clav stabs as sixteenth slashes under Em7",
    code: R1_L03_KEYS,
    bars: 2,
    key: key("E", "minor"),
    comping: "keys",
    chords: chartChords([["Em7"], ["Em7"]]),
    expect: { chordTexts: ["Em7", "Em7"] },
  },
  // --- jazz: the 32-bar charts of the three standards ----------------------------------------------------------------
  {
    name: "359 I Got Rhythm's changes (rhythm changes in B♭): 32 bars AABA as slashes in four, four bars a line",
    code: `${T(176)}chords: chord("${mini(RHYTHM.bars)}").voicing().struct("x x x x").s("rhodes")`,
    bars: 32,
    key: Bb,
    comping: "chords",
    chordStyle: "jazz",
    chords: chartChords(RHYTHM.bars),
    sections: formSectionMarks(RHYTHM.sections, 8),
    abcOptions: { barsPerLine: 4, barNumbers: true },
    expect: { parts: ["A", "A", "B", "A"], barNumbers: [5, 9, 13, 17, 21, 25, 29] },
  },
  {
    name: "360 J4.L03 hook: the rhythm-changes roots on the bass staff, 32 bars AABA, lead-sheet symbols",
    code: `${T(176)}const A = "<[Bb^7 Gm7] [Cm7 F7] [Bb^7 Gm7] [Cm7 F7] [Fm7 Bb7] [Eb^7 Eo7] [Dm7 G7] [Cm7 F7]>"
const A3 = "<[Bb^7 Gm7] [Cm7 F7] [Bb^7 Gm7] [Cm7 F7] [Fm7 Bb7] [Eb^7 Eo7] [Cm7 F7] Bb^7>"
const B = "<D7 D7 G7 G7 C7 C7 F7 F7>"

bass: arrange([8, chord(A)], [8, chord(A)], [8, chord(B)], [8, chord(A3)]).rootNotes(2).s("upright")`,
    bars: 32,
    key: Bb,
    staff: "bass",
    chords: chartChords(RHYTHM.bars),
    sections: formSectionMarks(["A", "A", "B", "A"], 8),
    abcOptions: { barsPerLine: 4, barNumbers: true },
    expect: { parts: ["A", "A", "B", "A"], barNumbers: [5, 9, 13, 17, 21, 25, 29] },
  },
  {
    name: "361 I Got Rhythm's 1930 refrain shape: 34 bars, A A B A with the two-bar tag (the last A ten bars)",
    code: `${T(176)}chords: chord("${mini(REFRAIN_34)}").voicing().struct("x ~ x ~").s("rhodes")`,
    bars: 34,
    key: Bb,
    comping: "chords",
    chords: chartChords(REFRAIN_34),
    sections: formSectionMarks(["A", "A", "B", "A"], [8, 8, 8, 10]),
    abcOptions: { barsPerLine: 4, barNumbers: true },
    expect: { parts: ["A", "A", "B", "A"], barNumbers: [5, 9, 13, 17, 21, 25, 29, 33] },
  },
  {
    name: "362 Georgia on My Mind's shape: a 32-bar AABA lead sheet in F (engraver's fixture, not the tune)",
    code: `${T(72)}mel: ${lineOver(BALLAD, 62)}`,
    bars: 32,
    key: F,
    staff: "lead",
    chordStyle: "jazz",
    chords: chartChords(BALLAD),
    sections: formSectionMarks(["A", "A", "B", "A"], 8),
    abcOptions: { barsPerLine: 4 },
    expect: { parts: ["A", "A", "B", "A"], barNumbers: [5, 9, 13, 17, 21, 25, 29] },
  },
  {
    name: "363 Body and Soul's shape: AABA in D♭, the bridge in D then C (key changes), engraver's fixture",
    code: `${T(66)}mel: ${lineOver(DB_CHART, 61)}`,
    bars: 32,
    key: key("Db"),
    staff: "lead",
    chordStyle: "jazz",
    chords: chartChords(DB_CHART),
    keyPlan: [
      { bar: 1, key: key("Db") },
      { bar: 17, key: key("D") },
      { bar: 21, key: C },
      { bar: 25, key: key("Db") },
    ],
    sections: formSectionMarks(["A", "A", "B", "A"], 8),
    abcOptions: { barsPerLine: 4 },
    expect: { parts: ["A", "A", "B", "A"], keyMarks: ["D", "C", "Db"] },
  },
  {
    name: "364 Body and Soul's shape as a chart: slashes in two under the changes, the key plan on the rhythm staff's symbols",
    code: `${T(66)}chords: chord("${mini(DB_CHART)}").voicing().struct("x ~ x ~").s("rhodes")`,
    bars: 32,
    key: key("Db"),
    comping: "chords",
    chords: chartChords(DB_CHART),
    sections: formSectionMarks(["A", "A", "B", "A"], 8),
    abcOptions: { barsPerLine: 4, barNumbers: true },
    expect: { parts: ["A", "A", "B", "A"] },
  },
  {
    name: "365 J4.L04 hook: the head's first four bars as a lead sheet, swung eighths printed straight",
    code: J4_L04,
    bars: 4,
    key: Bb,
    staff: "lead",
    host: true,
    hostSwing: SWUNG_8THS,
    chordStyle: "jazz",
    chords: chartChords(RHYTHM.bars.slice(0, 4)),
    expect: {
      voices: { S1: "D5:4 r:4 Bb4:4 D5:4 | Eb5:4 r:4 A4:4 r:4 | D5:4 r:4 Bb4:4 G4:4 | C5:4 r:4 A4:4 r:4" },
      abc: ['Q:"Swing 8ths"'],
    },
  },
  {
    name: "366 J5.L04 Aura Lee reharmonized: C∆7 C♯°7 D7 G7 D♭7 under the tune, jazz glyphs",
    code: `${T(72)}mel: n("<[-3 0 -1 0] [1 -2 1@2] [0 -1 -2 -1] 0 [-3 0 -1 0] [1 1 1@2] [0 -1 -2 -1] 0>").scale("C4:major").s("tenor")`,
    bars: 8,
    key: C,
    staff: "treble",
    chordStyle: "jazz",
    chords: [
      { bar: 0, beat: 1, symbol: "C^7" },
      { bar: 0, beat: 4, symbol: "C#o7" },
      { bar: 1, beat: 1, symbol: "D7" },
      { bar: 2, beat: 1, symbol: "G7" },
      { bar: 2, beat: 3, symbol: "Db7" },
      { bar: 3, beat: 1, symbol: "C^7" },
      { bar: 4, beat: 1, symbol: "C^7" },
      { bar: 5, beat: 1, symbol: "Am7" },
      { bar: 5, beat: 3, symbol: "D7" },
      { bar: 6, beat: 1, symbol: "G7" },
      { bar: 6, beat: 3, symbol: "Db7" },
      { bar: 7, beat: 1, symbol: "C^7" },
    ],
    expect: {
      chordTexts: ["C∆7", "C♯°7", "D7", "G7", "D♭7", "C∆7", "C∆7", "A–7", "D7", "G7", "D♭7", "C∆7"],
    },
  },
  // --- rhythm: sixteenth swing --------------------------------------------------------------------------------------
  {
    name: "367 R1.L02 drums: sixteenths swung .2 (kick and hats) printed straight under Swing 16ths",
    code: R1_L02,
    bars: 1,
    staff: "percussion",
    swing: { subdivision: 16, amount: 0.2 },
    expect: { abc: ['Q:"Swing 16ths"'] },
  },
  {
    name: "368 R1.L02 bass: the pushed sixteenth notes of a swung-16th line, printed straight",
    code: R1_L02_BASS,
    bars: 2,
    key: key("A", "minor"),
    staff: "bass",
    swing: { subdivision: 16, amount: 0.2 },
    expect: {
      voices: {
        S1: "A1:16 r:16 r:8 r:8 r:16 A1:16 r:8 A1:16 r:16 r:4 | D2:16 r:16 r:8 r:8 r:16 D2:16 r:8 D2:16 r:16 r:4",
      },
    },
  },
  // --- rhythm: ghost notes -------------------------------------------------------------------------------------------
  {
    name: "369 R1.L03 drums: the snare's ghost notes (.3) and the hats' quiet sixteenths in parentheses",
    code: R1_L03_DRUMS,
    bars: 1,
    staff: "percussion",
    ghosts: true,
    expect: {
      ghosts: [
        "hh@1/16",
        "hh@3/16",
        "hh@5/16",
        "sd@7/16",
        "hh@7/16",
        "sd@9/16",
        "hh@9/16",
        "sd@11/16",
        "hh@11/16",
        "hh@13/16",
        "sd@15/16",
        "hh@15/16",
      ],
    },
  },
  {
    name: "370 R.CP ghost-the-hats: [1 .3 .6 .3] on sixteenth hats, the e's and a's ghosted",
    code: `${T(100)}hats: s("hh*16").velocity("[1 .3 .6 .3]*4")`,
    bars: 1,
    staff: "percussion",
    ghosts: true,
    expect: {
      ghosts: ["hh@1/16", "hh@3/16", "hh@5/16", "hh@7/16", "hh@9/16", "hh@11/16", "hh@13/16", "hh@15/16"],
    },
  },
  {
    name: "371 a line quiet throughout has no ghost notes (every hat at .3)",
    code: `${T(100)}hats: s("hh*8").velocity(.3)`,
    bars: 1,
    staff: "percussion",
    ghosts: true,
    expect: { ghosts: [] },
  },
  {
    name: "372 R1.L03 bass: the funk line on the sixteenth grid (octave pop, the run into the one)",
    code: R1_L03_BASS,
    bars: 1,
    key: key("E", "minor"),
    staff: "bass",
    expect: { voices: { S1: "E2:16 r:16 r:16 E3:16 r:8 E2:16 r:16 r:8 G2:16 r:16 A2:16 r:16 B2:16 D3:16" } },
  },
  // --- rhythm: odd meters --------------------------------------------------------------------------------------------
  {
    name: "373 R2.L01 drums in 5/4 as 3+2, the grouping in the time signature",
    code: R2_L01,
    bars: 1,
    meter: "5/4",
    staff: "percussion",
    showGrouping: true,
    expect: { meter: "3+2/4", abc: ["M:3+2/4"] },
  },
  {
    name: "374 R2.L01 bass in 5/4 (3+2): E, then A, on 1 and 4, the groups' first beats",
    code: R2_L01_BASS,
    bars: 2,
    meter: "5/4",
    key: key("E", "minor"),
    staff: "bass",
    showGrouping: true,
    expect: { meter: "3+2/4", voices: { S1: "E2:4 r:2 E2:4 r:4 | A2:4 r:2 A2:4 r:4" } },
  },
  {
    name: "375 5/4 as 3+2: a half note on beat 3 is tied over the group boundary",
    code: `${T(150, 5)}mel: note("c4 d4 e4@2 f4")`,
    bars: 1,
    meter: "5/4",
    key: C,
    staff: "treble",
    showGrouping: true,
    expect: { meter: "3+2/4", voices: { S1: "C4:4 D4:4 E4:4~ E4:4 F4:4" } },
  },
  {
    name: "376 5/4 as 2+3: the same half note starts the second group and is one note",
    code: `${T(150, 5)}mel: note("c4 d4 e4@2 f4")`,
    bars: 1,
    meter: "5/4",
    grouping: [2, 3],
    key: C,
    staff: "treble",
    showGrouping: true,
    expect: { meter: "2+3/4", voices: { S1: "C4:4 D4:4 E4:2 F4:4" } },
  },
  {
    name: "377 R2.L02 drums in 7/8, beamed 2+2+3 with the grouping in the signature",
    code: R2_L02,
    bars: 1,
    meter: "7/8",
    staff: "percussion",
    showGrouping: true,
    expect: { meter: "2+2+3/8", abc: ["M:2+2+3/8"] },
  },
  {
    name: "378 R2.L02 bass in 7/8: notes on each group's first eighth",
    code: R2_L02_BASS,
    bars: 2,
    meter: "7/8",
    key: key("A", "minor"),
    staff: "bass",
    showGrouping: true,
    expect: {
      meter: "2+2+3/8",
      voices: { S1: "A1:8 r:8 A1:8 r:8 A1:8 r:8 r:8 | F2:8 r:8 F2:8 r:8 F2:8 r:8 r:8" },
    },
  },
  {
    name: "379 7/8 as 3+2+2: seven eighths beamed in three groups",
    code: `${T(240, 7)}mel: note("a4 b4 c5 d5 e5 d5 c5")`,
    bars: 1,
    meter: "7/8",
    grouping: [3, 2, 2],
    key: key("A", "minor"),
    staff: "treble",
    showGrouping: true,
    expect: { meter: "3+2+2/8", abc: ["!class=oak-e2!c2 !class=oak-e3!d2"] },
  },
  {
    name: "380 9/8 as 2+2+2+3: nine eighths beamed in four groups",
    code: `${T(270, 9)}mel: note("d4 e4 f4 g4 a4 g4 f4 e4 d4")`,
    bars: 1,
    meter: "9/8i",
    key: key("D", "minor"),
    staff: "treble",
    showGrouping: true,
    expect: { meter: "2+2+2+3/8" },
  },
  {
    name: "381 5/8 as 3+2: a dotted quarter and a quarter",
    code: `${T(200, 5)}mel: note("c4@3 g4@2")`,
    bars: 1,
    meter: "5/8",
    grouping: [3, 2],
    key: C,
    staff: "treble",
    showGrouping: true,
    expect: { meter: "3+2/8", voices: { S1: "C4:4. G4:4" } },
  },
  // --- rhythm: hemiola, polyrhythm, polymeter -----------------------------------------------------------------------
  {
    name: "382 6/8 against 3/4: a bar of two dotted quarters, then the hemiola's three quarters",
    code: `${T(60, 2)}mel: note("<[c4@3 e4@3] [c4@2 d4@2 e4@2]>")`,
    bars: 2,
    meter: "6/8",
    key: C,
    staff: "treble",
    brackets: [hemiolaBracket(1, "3 × 2", { compound: true })],
    expect: { above: ["3 × 2"], voices: { S1: "C4:4. E4:4. | C4:4 D4:4 E4:4" }, rhythm: { ties: 0 } },
  },
  {
    name: "383 the hemiola as played: half, half tied over the bar, half (one line, the bracket over both bars)",
    code: `${T(120, 3)}mel: note("c4@2 d4@2 e4@2").slow(2)`,
    bars: 2,
    meter: "3/4",
    key: C,
    staff: "treble",
    brackets: [hemiolaBracket(0)],
    expect: { above: ["3 × 2"], voices: { S1: "C4:2 D4:4~ | D4:4 E4:2" }, rhythm: { tiesAcrossBar: 1 } },
  },
  {
    name: "384 R2.L03 chords in 6/8: bar 1 in two (dotted quarters), bar 2 the hemiola in three",
    code: R2_L03,
    bars: 2,
    meter: "6/8",
    key: key("A", "minor"),
    staff: "treble",
    chordByBar: ["Am7", "Dm7"],
    chords: chartChords([["Am7"], ["Dm7"]]),
    brackets: [hemiolaBracket(1, "3 × 2", { compound: true })],
    expect: { above: ["3 × 2"], chordTexts: ["Am7", "Dm7"] },
  },
  {
    name: "385 R2.L03 bass in 6/8: the same two bars, two then three",
    code: R2_L03_BASS,
    bars: 2,
    meter: "6/8",
    key: key("A", "minor"),
    staff: "bass",
    expect: {},
  },
  {
    name: "386 R2.L04 hook: 3 against 2, the cowbell's triplet halves bracketed over the kick's halves",
    code: R2_L04,
    bars: 1,
    staff: "percussion",
    ...polyrhythmMarks({ track: "perc", a: 3, b: 2, bars: 1 }),
    expect: { above: ["3:2"], rhythm: { tuplets: [{ p: 3, q: 2, r: 3, bar: 0 }] } },
  },
  {
    name: "387 R2.L04 pitched: chords in three over the bass in two on the grand staff",
    code: R2_L04_PITCHED,
    bars: 2,
    key: key("C", "minor"),
    staff: "grand",
    split: "track",
    ...polyrhythmMarks({ track: "chords", a: 3, b: 2, bars: 2 }),
    expect: {
      above: ["3:2", "3:2"],
      rhythm: {
        tuplets: [
          { p: 3, q: 2, r: 3, bar: 0 },
          { p: 3, q: 2, r: 3, bar: 1 },
        ],
      },
    },
  },
  {
    name: "388 4 against 3 in 3/4: four cowbells as one (4:3:4 bracket of quarters over three kicks",
    code: `${T(90, 3)}kick: s("bd*3")\nperc: s("cb*4")`,
    bars: 1,
    meter: "3/4",
    staff: "percussion",
    ...polyrhythmMarks({ track: "perc", a: 4, b: 3, bars: 1 }),
    expect: { above: ["4:3"], rhythm: { tuplets: [{ p: 4, q: 3, r: 4, bar: 0 }] } },
  },
  {
    name: "389 4 against 3 left to the quantizer: the same cowbells as dotted eighths (no bracket)",
    code: `${T(90, 3)}kick: s("bd*3")\nperc: s("cb*4")`,
    bars: 1,
    meter: "3/4",
    staff: "percussion",
    expect: { rhythm: { tuplets: [], dotted: 2, ties: 2 } },
  },
  {
    name: "390 4 against 3 pitched: a quarter-note line of four over a 3/4 bar of three (bars of the bass left plain)",
    code: `${T(90, 3)}mel: note("<[e4 f4 g4 a4] [g4 f4 e4 d4]>")\nbass: note("<[c3 c3 c3] [g2 g2 g2]>")`,
    bars: 2,
    meter: "3/4",
    key: C,
    staff: "grand",
    split: "track",
    ...polyrhythmMarks({ track: "mel", a: 4, b: 3, bars: 2 }),
    expect: {
      above: ["4:3", "4:3"],
      rhythm: {
        tuplets: [
          { p: 4, q: 3, r: 4, bar: 0 },
          { p: 4, q: 3, r: 4, bar: 1 },
        ],
      },
    },
  },
  {
    name: "391 3 against 4: a triplet-half line over quarters in 4/4",
    code: `${T(80)}perc: s("cb*3")\nkick: s("bd*4")`,
    bars: 1,
    staff: "percussion",
    brackets: [{ bar: 0, from: rat(0), to: rat(1), text: "3:4" }],
    expect: { above: ["3:4"], rhythm: { tuplets: [{ p: 3, q: 2, r: 3, bar: 0 }] } },
  },
  {
    name: "392 R2.L05 polymeter {0 ~ 4}%4 in one meter: each cycle's first note accented, 3 over 4 over three bars",
    code: R2_L05_BASS,
    bars: 3,
    key: key("D", "minor"),
    staff: "bass",
    ...polymeterMarks({ track: "bass", steps: 3, stepsPerBar: 4 }),
    expect: {
      above: ["3 over 4"],
      accents: 4,
      voices: { S1: "D2:4 r:4 A2:4 D2:4 | r:4 A2:4 D2:4 r:4 | A2:4 D2:4 r:4 A2:4" },
    },
  },
  {
    name: "393 a five-step figure at eighths ({0 2 4 2 1}%8): accents every five eighths, 5 over 8",
    code: `${T(100)}mel: n("{0 2 4 2 1}%8").scale("D4:minor")`,
    bars: 5,
    key: key("D", "minor"),
    staff: "treble",
    abcOptions: { barsPerLine: 5 },
    ...polymeterMarks({ track: "mel", steps: 5, stepsPerBar: 8 }),
    expect: { above: ["5 over 8"], accents: 8 },
  },
  // --- rhythm: clave, tresillo, Euclid --------------------------------------------------------------------------------
  {
    name: "394 R3.L02 hook: son clave 3-2 on the rim, two bars",
    code: R3_L02_CLAVE,
    bars: 2,
    staff: "percussion",
    expect: { voices: { DR: "rim:8 r:8 r:8 rim:8 r:4 rim:8 r:8 | r:4 rim:8 r:8 rim:8 r:8 r:4" } },
  },
  {
    name: "395 son clave 2-3",
    code: `${T(104)}perc: s("<[~ ~ rim ~ rim ~ ~ ~] [rim ~ ~ rim ~ ~ rim ~]>")`,
    bars: 2,
    staff: "percussion",
    expect: { voices: { DR: "r:4 rim:8 r:8 rim:8 r:8 r:4 | rim:8 r:8 r:8 rim:8 r:4 rim:8 r:8" } },
  },
  {
    name: "396 rumba clave 3-2: the third stroke on the and of 4",
    code: `${T(104)}perc: s("<[rim ~ ~ rim ~ ~ ~ rim] [~ ~ rim ~ rim ~ ~ ~]>")`,
    bars: 2,
    staff: "percussion",
    expect: { voices: { DR: "rim:8 r:8 r:8 rim:8 r:4 r:8 rim:8 | r:4 rim:8 r:8 rim:8 r:8 r:4" } },
  },
  {
    name: "397 rumba clave 2-3",
    code: `${T(104)}perc: s("<[~ ~ rim ~ rim ~ ~ ~] [rim ~ ~ rim ~ ~ ~ rim]>")`,
    bars: 2,
    staff: "percussion",
    expect: { voices: { DR: "r:4 rim:8 r:8 rim:8 r:8 r:4 | rim:8 r:8 r:8 rim:8 r:4 r:8 rim:8" } },
  },
  {
    name: "398 R3.L02 the tune facing the clave: melody over the son 3-2 on two staves",
    code: `${R3_L02_CLAVE}\n${R3_L02_MEL.replace(T(104), "")}`,
    bars: 2,
    key: C,
    expect: { staves: ["S1:treble", "DR:perc"] },
  },
  {
    name: "399 R3.L01 tresillo bass: 3+3+2 eighths over C and F",
    code: `${T(100)}bass: note("<c2 f2>").struct("x ~ ~ x ~ ~ x ~").s("fingerbass")`,
    bars: 2,
    key: C,
    staff: "bass",
    expect: { voices: { S1: "C2:8 r:8 r:8 C2:8 r:4 C2:8 r:8 | F2:8 r:8 r:8 F2:8 r:4 F2:8 r:8" } },
  },
  {
    name: "400 cinquillo cb(5,8): x . x x . x x .",
    code: `${T(100)}perc: s("cb(5,8)")`,
    bars: 1,
    staff: "percussion",
    expect: { voices: { DR: "cb:8 r:8 cb:8 cb:8 r:8 cb:8 cb:8 r:8" } },
  },
  {
    name: "401 R3.L03 bossa rim rim(5,16,10): 3+3+4+3+3 sixteenths",
    code: `${T(128)}perc: s("rim(5,16,10)")`,
    bars: 1,
    staff: "percussion",
    expect: {},
  },
  {
    name: "402 R3.L04 montuno and tumbao on the grand staff (the bass on the and of 2 and on 4)",
    code: R3_L04,
    bars: 2,
    key: C,
    staff: "grand",
    split: "track",
    expect: { staves: ["RH:treble", "LH:bass"] },
  },
  // --- rhythm: interlock and displacement ---------------------------------------------------------------------------
  {
    name: "403 R1.L04 interlock: bass, clav and guitar in each other's gaps on the grand staff",
    code: R1_L04,
    bars: 1,
    key: key("C", "minor"),
    staff: "grand",
    split: "track",
    expect: { staves: ["RH:treble", "LH:bass"] },
  },
  {
    name: "404 R1.L05 displacement: the clav figure an eighth later in bar 2 (.late)",
    code: R1_L05,
    bars: 2,
    key: key("D", "minor"),
    staff: "treble",
    chordByBar: ["Dm7", "Dm7"],
    chords: chartChords([["Dm7"], ["Dm7"]]),
    expect: { chordTexts: ["Dm7", "Dm7"] },
  },
  // --- arrangement -----------------------------------------------------------------------------------------------------
  {
    name: "405 A2.L01 roles and registers: bass, chords and tune on the grand staff in A minor",
    code: A2_L01,
    bars: 4,
    key: key("A", "minor"),
    staff: "grand",
    split: "track",
    expect: { staves: ["RH:treble", "LH:bass"] },
  },
  {
    name: "406 A2.L03 counter-melody: the tune and its counter-line in two voices on one staff, each line whole",
    code: A2_L03,
    bars: 4,
    key: key("A", "minor"),
    staff: "treble",
    trackVoices: true,
    expect: {
      voices: {
        S1: "E5:4 r:4 C5:4 A4:4 | C5:4 r:4 A4:4 r:4 | E5:4 C5:4 E5:4 r:4 | B4:4 r:4 G5:4 r:4",
        S1v2: "r:2 A3:4 C4:4 | r:4 A3:4 C4:4 r:4 | C4:4 r:4 r:4 E4:4 | r:4 B3:4 r:4 G3:4",
      },
    },
  },
  {
    name: "407 J1.L01 ride pattern on the percussion staff, swung eighths printed straight",
    code: `${T(132)}drums: ${RIDE}.swingBy(1/3, 4)\nhats: s("~ hh ~ hh").bank("jazzkit")`,
    bars: 1,
    staff: "percussion",
    host: true,
    hostSwing: SWUNG_8THS,
    expect: { abc: ['Q:"Swing 8ths"'] },
  },
];
