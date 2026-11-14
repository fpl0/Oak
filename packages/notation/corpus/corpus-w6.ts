// Wave 6 golden corpus (entries 242–): sevenths, rhythm II, modes, chromatic harmony and key changes, on the U12–U17
// lesson material of content/specs (hooks and pinned tunes copied as written, so a later spec edit does not move a
// snapshot) and on three 32-bar lead sheets over the forms and changes of the CF-T standards. Every entry is
// evaluated by headless Strudel 1.2.6 and read back from the ABC independently (corpus.test.ts: pitches and
// durations parsed from the ABC equal the input; with a declared grid, the input moved to that grid by a second
// implementation in the test). The note lists and spellings below were checked by hand.
import type { KeySpec } from "@oak/content-kit";
import type { CorpusEntry } from "./harness.ts";

const T = (bpm: number, per = 4) => `setcpm(${bpm}/${per})\n\n`;
const C: KeySpec = { tonic: "C", mode: "major" };
const key = (tonic: string, mode = "major"): KeySpec => ({ tonic, mode }) as KeySpec;
/** One chord a bar from bar 1, with its numeral (the shape of the grader's `chromaticHarmonyView().chords`). */
const perBar = (list: [string, string][], from = 1) =>
  list.map(([symbol, rn], i) => ({ bar: from + i, beat: 1, symbol, rn }));
const marks = (list: [string, number][]) =>
  list.map(([tag, bar], i) => ({
    bar,
    tag,
    text: tag.charAt(0).toUpperCase() + tag.slice(1).replace(/(\d+)$/, " $1"),
    doubleBar: i > 0,
  }));
/** Triplet swing as the grader's `swingView` measures it on one track (the off-beat two thirds into the pair). */
const SWUNG_8THS = [
  { swung: 8 as const, eighths: { p: [2, 3] as [number, number] }, sixteenths: { p: null } },
];

// --- the U12–U17 hooks, as content/specs has them ---------------------------------------------------------------
const U12_L01 = `${T(84)}const changes = "<C^7 Am7 Dm7 G7>"

chords: chord(changes).voicing().s("rhodes")
bass: chord(changes).rootNotes(2).s("upright")
mel: n("<[2 ~ 4 6] [5 ~ 4 2] [3 ~ 1 5] [4 ~ 3 ~]>").scale("C4:major").s("piano")`;
const U12_L03 = `${T(76)}const changes = "<Bm7b5 E7 Am7 Am7>"

chords: chord(changes).voicing().s("rhodes")
bass: chord(changes).rootNotes(2).s("upright")
mel: n("<[3 ~ 5 3] [4 ~ 6 4] [2 ~ ~ ~] ~>").scale("A3:harmonic:minor").s("piano")`;
const U12_L05 = `${T(96)}const changes = "<Dm7 G7 C^7 F^7 Bm7b5 E7 Am7 Am7>"

chords: chord(changes).voicing().s("rhodes")
bass: chord(changes).rootNotes(2).s("upright")
mel: note("<f4 f4 e4 e4 d4 d4 c4 c4>").s("piano")`;
const U12_L06 = `${T(112)}const changes = "<Dm7 G7 C^7 C^7>"

chords: chord(changes).dict("lefthand").voicing().struct("~ x ~ ~ x ~ ~ ~").s("rhodes")
bass: chord(changes).rootNotes(2).struct("x x x x").s("upright")
gtr: n("<[~ 5 ~ 3] [~ 6 ~ 4] [~ 4 6 ~] ~>").scale("C4:major").s("jazzgtr")`;
const U13_L01 = `${T(96)}const changes = "<Dm7 G7 C^7 F^7>"

kick: s("bd ~ bd ~")
snare: s("~ sd ~ sd")
hats: s("hh*8").gain(.5)
bass: chord(changes).rootNotes(2).struct("x ~ ~ ~ x ~ x ~").s("fingerbass").lpf(800)
chords: chord(changes).voicing().early(1/8).s("rhodes")`;
const U13_L02 = `${T(96)}const changes = "<Dm7 G7>"

kick: s("bd ~ ~ ~ ~ ~ bd ~ ~ ~ bd ~ ~ ~ ~ ~")
snare: s("~ ~ ~ ~ sd ~ ~ sd ~ sd ~ ~ sd ~ ~ sd").velocity("1 1 1 1 1 1 1 .3 1 .3 1 1 1 1 1 .3")
hats: s("hh*16").velocity("[1 .4 .7 .4]*4").gain(.5)`;
const U13_L03_MEL =
  'mel: n("<[0 1 -3 2@2 2 3 4]@2 [4 3 2 1] [0 0 1 2] [1@3 0 0@4]>").scale("C4:major").s("piano")';
const U13_L04 = `${T(60, 2)}const changes = "<C^7 Am7 F^7 G7>"

kick: s("bd ~ ~ ~ ~ bd")
snare: s("~ ~ ~ sd ~ ~")
hats: s("hh*6").velocity("[1 .5 .6]*2").gain(.5)
bass: chord(changes).rootNotes(2).struct("x ~ ~ x ~ ~").s("fingerbass").lpf(800)
chords: chord(changes).voicing().arp("0 1 2 3 2 1").s("rhodes")`;
const U13_L05 = `${T(76)}kick: s("bd ~ bd ~")
snare: s("~ sd ~ sd").ply("<1 1 1 [1 1 1 3]>")
hats: s("hh*4").ply(3).velocity("[1 .5 .6]*4").gain(.5)`;
const U13_L06 = `${T(92)}const hits = "<[x ~ ~ x ~ ~ x ~] [x ~ ~ x ~ x ~ ~]>"

kick: s("bd").struct(hits)
snare: s("~ sd ~ sd")
hats: s("hh*8").gain(.5)
bass: n("<0 3>").struct(hits).scale("C2:major").s("fingerbass").lpf(800)`;
const U14_L01 = `${T(104)}gtr: n("<[0 0 -1 0 ~ 2 4 ~] [6 ~ 4 2 0 ~ -1 0]>").scale("<G3:major!2 G3:mixolydian!2>").s("crunch")`;
const U14_L06 = `${T(96)}gtr: n("0 2 4 3 1 5 6 7").scale("<D4:lydian D4:major D4:mixolydian D4:dorian D4:minor D4:phrygian>").s("cleangtr")`;
const SAILOR =
  'mel: n("<[4 [4 4] 4 [4 4]] [4 0 2 4] [3 [3 3] 3 [3 3]] [3 -1 1 3] [4 [4 4] 4 [4 4]] [4 5 6 7] [6 4 3 1] [0@2 0@2]>").scale("D4:dorian")';
const U15_L01 = `${T(92)}const changes = "<C Am Dm G7 C C7 F G7>"

chords: chord(changes).voicing().s("rhodes")
bass: chord(changes).rootNotes(2).s("upright")
mel: n("<[4 3# 4 7] [5 4# 5 ~] [3 0# 1 3] [4 ~ 3 1] [4 3# 4 7] [6b ~ 5 4] [5 ~ 3 5] [4 ~ ~ ~]>").scale("C4:major").s("piano")`;
const U15_L03 = `${T(88)}const changes = "<C E7 Am C7 F A7 Dm G7>"

chords: chord(changes).voicing().s("rhodes")
bass: chord(changes).rootNotes(2).s("upright")
mel: n("<[4 ~ 2 ~] [4# ~ 6 4#] [5 ~ 2 0] [6b ~ 4 2] [5 ~ 3 ~] [0# ~ 2 4] [1 ~ 3 1] [1 ~ -1 ~]>").scale("C4:major").s("piano")`;
const U15_L04 = `${T(84)}const changes = "<C C#o7 Dm7 F#o7 G7 G#o7 Am7 G7>"

chords: chord(changes).voicing().s("organ")
bass: chord(changes).rootNotes(2).s("upright")`;
const U15_L05 = `${T(120)}const changes = "<C E7 A7 A7 D7 G7 C G7>"

chords: chord(changes).voicing().struct("~ x ~ x").s("jazzgtr")
bass: chord(changes).rootNotes(2).struct("x ~ x ~").s("upright")
horns: chord(changes).voicing().struct("x ~ ~ ~ ~ ~ ~ x").s("horns").gain(.6)
mel: n("<[4 ~ 2 4] [4# ~ 6 4#] [0# ~ 2 4] [5 ~ ~ ~] [3# ~ 5 3#] [4 ~ 3 1] [2 ~ ~ ~] ~>").scale("C4:major").s("trumpet")`;
const U16_L01 = `${T(80)}const changes = "<C F Fm C>"

chords: chord(changes).voicing().struct("x x x x").s("piano")
bass: chord(changes).rootNotes(2).s("ebass")
mel: n("<[2 4 7 4] [5@3 3] [5b@3 3] [4@3 ~]>").scale("C4:major").s("cleangtr")`;
const U16_L02 = `${T(112)}const changes = "<C F [Ab Bb] C>"

chords: chord(changes).voicing().s("organ")
bass: chord(changes).rootNotes(2).struct("x*8").s("ebass")
mel: n("<[2 4 7 4] [5 7 5 3] [7@2 8@2] [9@3 ~]>").scale("C4:major").s("crunch")`;
const U16_L03 = `${T(100)}mel: n("<[4 ~ 4 2] [4 ~ 6b 4] [5 ~ 5 3] [4 ~ ~ ~] [4 ~ 4 2] [4 ~ 6b 4] [5b ~ 5b 3] [4 ~ ~ ~]>").scale("C4:major").s("crunch")`;
const U16_L04 = `${T(88)}mel: n("<[4 ~ 2 0] [5# ~ 3 ~] [5 ~ 3 2] [1 ~ ~ ~] [4 ~ 2 0] [5# ~ 3 ~] [2 1 1 4] [2#@3 ~]>").scale("A3:minor").s("acgtr")`;
const U16_L05 = `${T(84)}mel: n("<[-3 0 -1 0] [1 -2 1@2] [0 -1 -2 -1] 0 [-3 0 -1 0] [1 1 1@2] [0 -1 -2 -1] 0>").scale("C4:major").s("tenor")`;
const U17_L01 = `${T(96)}mel: n("<[2 ~ 4 2] [0 ~ ~ ~] [3 ~ 5 3] [4 ~ ~ ~] [2 ~ 4 2] [0 ~ 2 ~] [4 ~ 6 4] [7 ~ ~ ~]>").scale("<C4:major!6 G3:major!2>").s("piano")`;
const U17_L02 = `${T(112)}const melVerse = n("<[2 ~ 2 1] [0 ~ ~ ~] [3 ~ 3 2] [1 ~ ~ ~]>")
const melChorus = n("<[4 ~ 4 5] [4 ~ 1 ~] [5 ~ 5 7] [7 ~ 5 ~]>")

mel: arrange([4, melVerse], [4, melChorus], [4, melChorus]).scale("<C4:major!8 D4:major!4>").s("piano")`;
const U17_L03 = `${T(92)}mel: n("<[4 ~ 2 4] [2 ~ 0 ~] [5 ~ 3 5] [4 ~ ~ ~] [4 ~ 2 4] [2 ~ 0 ~] [4 ~ 6 4] [7 ~ ~ ~]>").scale("<C4:major!6 A3:harmonic:minor!2>").s("piano")`;
const U17_L04 = `${T(104)}bass: n("<0 5 3 4>").struct("x ~ x x").scale("<F2:major!4 G2:major!4>").s("ebass").lpf(700)
mel: n("<[2 ~ 4 2] [0 ~ 2 ~] [3 ~ 5 3] [1 ~ ~ ~]>").scale("<F4:major!4 G4:major!4>").s("piano")`;

// --- three 32-bar lead sheets in the shape of the CF-T standards ---------------------------------------------------
// The answer keys of Five Foot Two, Ain't She Sweet and Bye Bye Blackbird are content/repertoire's, transcribed
// from the prints and verified there; none existed when this corpus was written. These are the ENGRAVER'S
// fixtures: each standard's key, 32-bar form and the kind of changes it runs on (Five Foot Two's first eight bars
// are the chain C E7 A7 A7 D7 G7 C G7 that U15.L05 teaches; the other two sets are common-practice changes written
// from memory), under a line written for this corpus in the rhythm such a tune has: pushes tied over the bar line,
// dotted figures, a quarter-note triplet, long notes held over two chords, chromatic notes spelled by the chord
// under them. They are NOT the tunes and are never shown to a learner.
const A_552 = "[e4 g4 e4@2] [g#4 b4 g#4@2] [a4@3 a4 a4@2 b4 c#5@9]@2 [f#4 a4@2 f#4 a4@2 c5@2]";
const FIVE_FOOT_TWO = `${T(176)}mel: note("<${[
  `${A_552} [b4@3 a4 g4@2 f4@2] [e4@3 g4@13]@2`,
  `${A_552} [b4@3 a4 g4@2 d4@2] c4 [~@3 b3]`,
  "[b4 b4 b4@2] [d5@3 b4 g#4@4] [c#5 c#5 c#5@2] [e5@3 c#5 a4@4]",
  "[f#4 a4@2 f#4 a4@2 c5@2] [c5 [b4 a4 f#4]@2 a4] [g4@3 f4@5] [d4@2 f4 g4]",
  `${A_552} [b4@3 a4 g4@2 d4@2] c4@2`,
].join(" ")}>")`;
const FIVE_FOOT_TWO_CHANGES = [
  ..."C E7 A7 A7 D7 G7 C G7".split(" "),
  ..."C E7 A7 A7 D7 G7 C C".split(" "),
  ..."E7 E7 A7 A7 D7 D7 G7 G7".split(" "),
  ..."C E7 A7 A7 D7 G7 C C".split(" "),
];
const A_SWEET = "[g4@2 e4@2] [a4@2 g4@2] [e4@3 d4 d4@2 b3@2]@2 [e4 e4 e4 g#4 a4@4]@2 [f#4 a4 g4 b4]";
const AINT_SHE_SWEET = `${T(168)}mel: note("<${[
  `${A_SWEET} [c5@2 ~@2]`,
  `${A_SWEET} [c5@2 ~@2]`,
  "[a4 c5 a4@2] [eb5@3 c5 a4@4] [g4 c5 g4@2] [e5@3 c5 g4@4]",
  "[a4 c5 a4@2] [eb5@3 c5 a4@2 g4@2] [e4@2 f#4@2] [f4@2 g4 b3]",
  `${A_SWEET} c5`,
].join(" ")}>")`;
const SWEET_A: (string | string[])[] = [
  ["C", "C#o7"],
  ["Dm7", "G7"],
  ["C", "C#o7"],
  ["Dm7", "G7"],
  ["C", "E7"],
  "A7",
  ["D7", "G7"],
  "C",
];
const AINT_SHE_SWEET_CHANGES: (string | string[])[] = [
  ...SWEET_A,
  ...SWEET_A,
  "F7",
  "F7",
  "C",
  "C",
  "F7",
  "F7",
  ["C", "D7"],
  ["Dm7", "G7"],
  ...SWEET_A,
];
const A_BIRD = "[a4 a4 a4 a4] [a4@3 g4] [f4@7 d4]@2 [c4@3 d4 f4@4]@2 [g4 bb4 d5 bb4] [c5@2 [d5 c5 bb4]@2]";
const BLACKBIRD = `${T(132)}mel: note("<${[
  A_BIRD,
  "[g4 g4 g4 g4] [g4@3 f#4] [g4@3 e4]@2 [d4 f4 bb4 d5] [c5@3 bb4 g4@4] [a4@6 ~@2]@2",
  A_BIRD,
  "[bb4@2 a4 g4] [d5@3 c5 bb4@4] [c5 e4 g4 bb4] [bb4@3 g4 e4@2 c4@2] [d4 f4 g4 bb4] [g4@3 e4@5] [f4@7 ~]@2",
].join(" ")}>")`;
const BIRD_A = "F F F F F F Gm7 C7".split(" ");
const BIRD_B = "Gm7 Gm7 C7 C7 Gm7 C7 F F".split(" ");
const BLACKBIRD_CHANGES = [...BIRD_A, ...BIRD_B, ...BIRD_A, ...BIRD_B];

export const CORPUS_W6: CorpusEntry[] = [
  // --- rhythm II: pushes with .early() / .late() (U13.L01) ----------------------------------------------------------
  {
    name: "242 U13.L01 hook: the chords pushed an eighth early, each tied over the bar line",
    code: U13_L01,
    bars: 4,
    key: C,
    staff: "treble",
    tracks: ["chords"],
    chordByBar: ["G7", "C^7", "F^7", "Dm7"],
    expect: {
      rhythm: { tiesAcrossBar: 4, exact: true, tuplets: [] },
      abc: ["z8 z4 z2 "],
    },
  },
  {
    name: "243 a tune pushed with .early(1/8): every quarter on an and, tied over its beat",
    code: 'mel: n("0 2 4 7").scale("C4:major").early(1/8)',
    bars: 2,
    key: C,
    expect: {
      voices: {
        S1: "r:8 E4:8~ E4:8 G4:8~ G4:8 C5:8~ C5:8 C4:8~ | C4:8 E4:8~ E4:8 G4:8~ G4:8 C5:8~ C5:8 C4:8~",
      },
      rhythm: { ties: 8, tiesAcrossBar: 2, dotted: 0 },
    },
  },
  {
    name: "244 an organ chop moved late with .late(1/8): eighth-note chords on every and",
    code: 'chords: note("[c4,e4,g4]*8").struct("x ~ x ~ x ~ x ~").late(1/8)',
    bars: 1,
    key: C,
    expect: { voices: { S1: "r:8 [C4,E4,G4]:8 r:8 [C4,E4,G4]:8 r:8 [C4,E4,G4]:8 r:8 [C4,E4,G4]:8" } },
  },
  {
    name: "245 a sixteenth push, .early(1/16): a sixteenth tied to a dotted eighth, the beat still shown",
    code: 'mel: n("0 2 4 7").scale("C4:major").early(1/16)',
    bars: 2,
    key: C,
    expect: {
      voices: {
        S1: "r:8 r:16 E4:16~ E4:8. G4:16~ G4:8. C5:16~ C5:8. C4:16~ | C4:8. E4:16~ E4:8. G4:16~ G4:8. C5:16~ C5:8. C4:16~",
      },
      rhythm: { tiesAcrossBar: 2 },
    },
  },
  {
    name: "246 a lazy snare, .late(1/32), on the declared grid of 16: written on its beat",
    code: 'snare: s("~ sd ~ sd").late(1/32)',
    bars: 1,
    staff: "percussion",
    grid: 16,
    expect: { voices: { DR: "r:4 sd:4 r:4 sd:4" }, rhythm: { ties: 0, exact: true } },
  },
  {
    name: "247 the same snare with no declared grid: engraved to the 32nd, as played",
    code: 'snare: s("~ sd ~ sd").late(1/32)',
    bars: 1,
    staff: "percussion",
    expect: { rhythm: { exact: true }, abc: ["z4 z/2 "] },
  },
  {
    name: "248 microtiming in decimals, .early(.02), on the declared grid of 8: the tune stays on its beats",
    code: 'mel: n("0 2 4 7").scale("C4:major").early(.02)',
    bars: 2,
    key: C,
    grid: 8,
    expect: { voices: { S1: "r:4 E4:4 G4:4 C5:4 | C4:4 E4:4 G4:4 C5:4" }, approximate: false },
  },
  {
    name: "249 a flam closer than the declared grid: one stroke is not shown, and the Score says so",
    code: 'snare: s("~ sd ~ sd").off(1/64, x => x)',
    bars: 1,
    staff: "percussion",
    grid: 16,
    expect: { approximate: true, warnings: ["snapped-to-grid"], voices: { DR: "r:4 sd:4 r:4 sd:4" } },
  },
  {
    name: "250 a push by a triplet eighth, .early(1/12): triplets inside each beat, tied over the beats",
    code: 'mel: n("0 2 4 7").scale("C4:major").early(1/12)',
    bars: 2,
    key: C,
    expect: {
      voices: {
        S1: "(3:2 r:4 E4:8~) (3:2 E4:4 G4:8~) (3:2 G4:4 C5:8~) (3:2 C5:4 C4:8~) | (3:2 C4:4 E4:8~) (3:2 E4:4 G4:8~) (3:2 G4:4 C5:8~) (3:2 C5:4 C4:8~)",
      },
      rhythm: { tiesAcrossBar: 2, dotted: 0 },
    },
  },
  // --- dots and ties (U13.L03) ------------------------------------------------------------------------------------
  {
    name: "251 U13.L03 hook: the Ode's last phrase as written, the tie over the bar line and the dotted figure",
    code: U13_L03_MEL,
    bars: 5,
    key: C,
    expect: {
      voices: {
        S1: "C4:4 D4:4 G3:4 E4:4~ | E4:4 E4:4 F4:4 G4:4 | G4:4 F4:4 E4:4 D4:4 | C4:4 C4:4 D4:4 E4:4 | D4:4. C4:8 C4:2",
      },
      rhythm: { ties: 1, tiesAcrossBar: 1, dotted: 1 },
    },
  },
  {
    name: "252 U13.L03 S6 play from the page: a dotted quarter, an eighth tied to a half note",
    code: 'mel: n("<[4@3 5@5] [4@3 2 1@2 0@2]>").scale("C4:major")',
    bars: 2,
    key: C,
    expect: {
      voices: { S1: "G4:4. A4:8~ A4:2 | G4:4. E4:8 D4:4 C4:4" },
      rhythm: { ties: 1, tiesAcrossBar: 0, dotted: 2 },
    },
  },
  {
    name: "253 U13.L03 S7: the G arrives on the last eighth and holds into the next bar",
    code: 'mel: n("<[0@2 1@2 2@3 4@5 2@4]@2>").scale("C4:major")',
    bars: 2,
    key: C,
    expect: { voices: { S1: "C4:4 D4:4 E4:4. G4:8~ | G4:2 E4:2" }, rhythm: { tiesAcrossBar: 1, dotted: 1 } },
  },
  {
    name: "254 U13.CP read the push: a quarter on beat 4 tied to a half note",
    code: 'mel: n("<[4@3 5 4@2 2@6 1@2 0@2]@2>").scale("C4:major")',
    bars: 2,
    key: C,
    expect: { voices: { S1: "G4:4. A4:8 G4:4 E4:4~ | E4:2 D4:4 C4:4" } },
  },
  {
    name: "255 the Charleston: a dotted quarter, then an eighth tied over the half bar",
    code: 'mel: n("0@3 2@5").scale("C4:major")',
    bars: 1,
    key: C,
    expect: { voices: { S1: "C4:4. E4:8~ E4:2" } },
  },
  {
    name: "256 eighth, quarters on the ands, eighth: each quarter split at its beat so every beat shows",
    code: 'mel: n("0 1@2 2@2 3@2 4").scale("C4:major")',
    bars: 1,
    key: C,
    expect: { voices: { S1: "C4:8 D4:8~ D4:8 E4:8~ E4:8 F4:8~ F4:8 G4:8" }, rhythm: { ties: 3 } },
  },
  {
    name: "257 two dotted quarters and a quarter: the second split at the half bar and tied",
    code: 'mel: n("0@3 1@3 2@2").scale("C4:major")',
    bars: 1,
    key: C,
    expect: { voices: { S1: "C4:4. D4:8~ D4:4 E4:4" } },
  },
  {
    name: "258 sixteenth syncopation: sixteenth, eighth, sixteenth, then a dotted eighth and a sixteenth",
    code: 'mel: n("0 1@2 2 3@3 4 ~@2 5@3 6@3").scale("C4:major")',
    bars: 1,
    key: C,
    expect: { voices: { S1: "C4:16 D4:8 E4:16 F4:8. G4:16 r:8 A4:8~ A4:16 B4:8." } },
  },
  {
    name: "259 a note held for five beats: a whole note tied to a quarter in the next bar",
    code: 'mel: n("<[0@5 1 2 3]@2>").scale("C4:major")',
    bars: 2,
    key: C,
    expect: { voices: { S1: "C4:1~ | C4:4 D4:4 E4:4 F4:4" } },
  },
  {
    name: "260 dotted half notes in 3/4 tied over two bar lines",
    code: 'mel: n("<0@3 [1 2 3]>").scale("C4:major")',
    bars: 4,
    meter: "3/4",
    key: C,
    expect: { voices: { S1: "C4:2.~ | C4:2.~ | C4:2. | D4:4 E4:4 F4:4" }, rhythm: { tiesAcrossBar: 2 } },
  },
  // --- sixteenth grooves (U13.L02, U13.L06) -------------------------------------------------------------------------
  {
    name: "261 U13.L02 hook on the percussion staff: sixteenth hats over a syncopated kick and snare",
    code: U13_L02,
    bars: 1,
    staff: "percussion",
    expect: { staves: ["DR:perc"], rhythm: { exact: true, tuplets: [] } },
  },
  {
    name: "262 U13.L06 hook: the kick on 1, the and of 2, and 4, then moved; snare and hats square",
    code: U13_L06,
    bars: 2,
    staff: "percussion",
    tracks: ["kick", "snare", "hats"],
    expect: { staves: ["DR:perc"], rhythm: { exact: true } },
  },
  {
    name: "263 U13.L06 bass on the kick's hits: eighth notes on 1, the and of 2, and 4, rests by the beat",
    code: U13_L06,
    bars: 2,
    staff: "bass",
    tracks: ["bass"],
    key: C,
    expect: { voices: { S1: "C2:8 r:8 r:8 C2:8 r:4 C2:8 r:8 | F2:8 r:8 r:8 F2:8 r:8 F2:8 r:4" } },
  },
  // --- compound meter (U13.L04) -------------------------------------------------------------------------------------
  {
    name: "264 U13.L04 hook in 6/8: kick on 1 and the last eighth, snare on beat 2, six hats in two threes",
    code: U13_L04,
    bars: 2,
    meter: "6/8",
    staff: "percussion",
    tracks: ["kick", "snare", "hats"],
    expect: { abc: ["M:6/8"], rhythm: { exact: true, tuplets: [] } },
  },
  {
    name: "265 U13.L04 hook: the arpeggiated sevenths, six eighths beamed in threes",
    code: U13_L04,
    bars: 4,
    meter: "6/8",
    staff: "treble",
    tracks: ["chords"],
    key: C,
    chordByBar: ["C^7", "Am7", "F^7", "G7"],
    chords: ["C^7", "Am7", "F^7", "G7"].map((symbol, bar) => ({ bar, beat: 1, symbol })),
    expect: {
      voices: {
        S1: "C3:8 E4:8 G4:8 B4:8 G4:8 E4:8 | A3:8 C4:8 E4:8 G4:8 E4:8 C4:8 | F3:8 C4:8 E4:8 A4:8 E4:8 C4:8 | G3:8 D4:8 F4:8 G4:8 F4:8 D4:8",
      },
      rhythm: { exact: true, ties: 0 },
      chordTexts: ["Cmaj7", "Am7", "Fmaj7", "G7"],
    },
  },
  {
    name: "266 U13.L04 bass in 6/8: an eighth on each of the two beats, two eighth rests filling each",
    code: U13_L04,
    bars: 4,
    meter: "6/8",
    staff: "bass",
    tracks: ["bass"],
    key: C,
    expect: {
      voices: {
        S1: "C2:8 r:8 r:8 C2:8 r:8 r:8 | A2:8 r:8 r:8 A2:8 r:8 r:8 | F2:8 r:8 r:8 F2:8 r:8 r:8 | G2:8 r:8 r:8 G2:8 r:8 r:8",
      },
      rhythm: { dotted: 0 },
    },
  },
  {
    name: "267 6/8: quarter and eighth, then the dotted quarter that is the beat",
    code: 'mel: n("0@2 1 2@3").scale("C4:major")',
    bars: 1,
    meter: "6/8",
    key: C,
    expect: { voices: { S1: "C4:4 D4:8 E4:4." } },
  },
  {
    name: "268 6/8 against its beat: three quarters, the middle one tied over beat 2",
    code: 'mel: n("0@2 1@2 2@2").scale("C4:major")',
    bars: 1,
    meter: "6/8",
    key: C,
    expect: { voices: { S1: "C4:4 D4:8~ D4:8 E4:4" } },
  },
  {
    name: "269 6/8: two notes to the beat are dotted eighths; rests fill by the beat",
    code: 'mel: n("[0 1] ~").scale("C4:major")',
    bars: 1,
    meter: "6/8",
    key: C,
    expect: { voices: { S1: "C4:8. D4:8. r:4." } },
  },
  {
    name: "270 6/8: a dotted half note tied over the bar line",
    code: 'mel: n("<0@2 [1 2 3 4 5 6]>").scale("C4:major")',
    bars: 3,
    meter: "6/8",
    key: C,
    expect: { voices: { S1: "C4:2.~ | C4:2. | D4:8 E4:8 F4:8 G4:8 A4:8 B4:8" } },
  },
  {
    name: "271 U13.L05 the read-it bar in 12/8: dotted quarters and three eighths, no bracket",
    code: 'mel: n("0@3 2 4 7 4@3 2 1 0").scale("C4:major")',
    bars: 1,
    meter: "12/8",
    key: C,
    expect: {
      voices: { S1: "C4:4. E4:8 G4:8 C5:8 G4:4. E4:8 D4:8 C4:8" },
      rhythm: { tuplets: [], dotted: 2 },
    },
  },
  {
    name: "272 12/8: a note pushed over the half bar is tied there",
    code: 'mel: n("0@3 2@2 4@4 2 4@2").scale("C4:major")',
    bars: 1,
    meter: "12/8",
    key: C,
    expect: { voices: { S1: "C4:4. E4:4 G4:8~ G4:4. E4:8 G4:4" } },
  },
  {
    name: "273 12/8 slow-blues drums: twelve hats in four threes, kick and snare on the beats",
    code: 'drums: s("[bd ~ ~] [sd ~ ~] [bd ~ bd] [sd ~ ~], hh*12")',
    bars: 1,
    meter: "12/8",
    staff: "percussion",
    expect: { abc: ["M:12/8"], rhythm: { exact: true, tuplets: [] } },
  },
  {
    name: "274 9/8: three beats of three",
    code: 'mel: n("0 1 2 3@2 4 5@3").scale("C4:major")',
    bars: 1,
    meter: "9/8",
    key: C,
    expect: { voices: { S1: "C4:8 D4:8 E4:8 F4:4 G4:8 A4:4." } },
  },
  // --- triplets and other tuplets (U13.L05) -------------------------------------------------------------------------
  {
    name: "275 U13.L05 the read-it bar in 4/4: a quarter, a triplet, a quarter, a triplet",
    code: 'mel: n("0 [2 4 7] 4 [2 1 0]").scale("C4:major")',
    bars: 1,
    key: C,
    expect: {
      voices: { S1: "C4:4 (3:2 E4:8 G4:8 C5:8) G4:4 (3:2 E4:8 D4:8 C4:8)" },
      rhythm: {
        tuplets: [
          { p: 3, q: 2, r: 3, bar: 0 },
          { p: 3, q: 2, r: 3, bar: 0 },
        ],
      },
    },
  },
  {
    name: "276 U13.L05 hook: hats in triplets with .ply(3), and the snare's roll into the repeat",
    code: U13_L05,
    bars: 4,
    staff: "percussion",
    expect: { rhythm: { exact: true }, abc: ["(3:2:3"] },
  },
  {
    name: "277 U13.CP three to the beat: two eighths, a triplet, two eighths, a triplet over kick and snare",
    code: 'hats: s("[hh hh] [hh hh hh] [hh hh] [hh hh hh]")\ndrums: s("bd sd bd sd")',
    bars: 1,
    staff: "percussion",
    expect: {
      rhythm: {
        tuplets: [
          { p: 3, q: 2, r: 3, bar: 0 },
          { p: 3, q: 2, r: 3, bar: 0 },
        ],
      },
    },
  },
  {
    name: "278 the shuffle as triplets: the first and third of each three, a rest between",
    code: 'hats: s("[hh ~ hh]*4")',
    bars: 1,
    staff: "percussion",
    expect: {
      voices: { DR: "(3:2 hh:8 r:8 hh:8) (3:2 hh:8 r:8 hh:8) (3:2 hh:8 r:8 hh:8) (3:2 hh:8 r:8 hh:8)" },
    },
  },
  {
    name: "279 the same shuffle as swung eighths: the host hands over the measured swing, printed straight",
    code: 'mel: n("0 1 2 3 4 5 6 7").scale("C4:major").swingBy(1/3, 4)',
    bars: 1,
    key: C,
    host: true,
    hostSwing: SWUNG_8THS,
    expect: {
      voices: { S1: "C4:8 D4:8 E4:8 F4:8 G4:8 A4:8 B4:8 C5:8" },
      abc: ['Q:"Swing 8ths"'],
      rhythm: { tuplets: [] },
    },
  },
  {
    name: "332 a shuffle the code writes as triplets, [c4@2 d4], under a declared swing: plain eighths",
    code: 'mel: note("[c4@2 d4] [e4@2 f4] [g4@2 a4] [c5@2 b4]")',
    bars: 1,
    key: C,
    swing: { subdivision: 8, amount: 1 / 3 },
    expect: { voices: { S1: "C4:8 D4:8 E4:8 F4:8 G4:8 A4:8 C5:8 B4:8" }, abc: ['Q:"Swing 8ths"'] },
  },
  {
    name: "333 a swung line with a real triplet on beat 3: the pairs print straight, the triplet keeps its bracket",
    code: 'mel: note("[c4@2 d4] [e4@2 f4] [g4 a4 b4] [c5@2 b4]")',
    bars: 1,
    key: C,
    swing: { subdivision: 8, amount: 1 / 3 },
    expect: {
      voices: { S1: "C4:8 D4:8 E4:8 F4:8 (3:2 G4:8 A4:8 B4:8) C5:8 B4:8" },
      rhythm: { tuplets: [{ p: 3, q: 2, r: 3, bar: 0 }] },
    },
  },
  {
    name: "280 a quarter-note triplet over two beats keeps one bracket",
    code: 'mel: n("[0 1 2]@2 3 4").scale("C4:major")',
    bars: 1,
    key: C,
    expect: { voices: { S1: "(3:2 C4:4 D4:4 E4:4) F4:4 G4:4" } },
  },
  {
    name: "281 a half-note triplet over the whole bar",
    code: 'mel: n("0 1 2").scale("C4:major")',
    bars: 1,
    key: C,
    expect: { voices: { S1: "(3:2 C4:2 D4:2 E4:2)" } },
  },
  {
    name: "282 a quarter and an eighth under one triplet bracket (the long-short of swing, written out)",
    code: 'mel: n("[0@2 1] [2@2 3] 4 ~").scale("C4:major")',
    bars: 1,
    key: C,
    expect: { voices: { S1: "(3:2 C4:4 D4:8) (3:2 E4:4 F4:8) G4:4 r:4" } },
  },
  {
    name: "283 sixteenth-note triplets: six to the beat as two brackets of three",
    code: 'mel: n("[0 1 2 3 4 5] 4 2 0").scale("C4:major")',
    bars: 1,
    key: C,
    expect: { voices: { S1: "(3:2 C4:16 D4:16 E4:16) (3:2 F4:16 G4:16 A4:16) G4:4 E4:4 C4:4" } },
  },
  {
    name: "284 a quintuplet of sixteenths in one beat",
    code: 'mel: n("[0 1 2 3 4] 4 2 0").scale("C4:major")',
    bars: 1,
    key: C,
    expect: { voices: { S1: "(5:4 C4:16 D4:16 E4:16 F4:16 G4:16) G4:4 E4:4 C4:4" } },
  },
  {
    name: "285 a triplet whose last note is tied into the next beat",
    code: 'mel: n("[0 1 2@4]@2 3 4").scale("C4:major")',
    bars: 1,
    key: C,
    expect: { rhythm: { exact: true } },
  },
  // --- seventh chords (U12) -----------------------------------------------------------------------------------------
  {
    name: "286 U12.L01 hook: the tune under Cmaj7 Am7 Dm7 G7, numerals Imaj7 vi7 ii7 V7 below",
    code: U12_L01,
    bars: 4,
    key: C,
    staff: "treble",
    tracks: ["mel"],
    harmony: perBar([
      ["C^7", "Imaj7"],
      ["Am7", "vi7"],
      ["Dm7", "ii7"],
      ["G7", "V7"],
    ]),
    expect: {
      voices: { S1: "E4:4 r:4 G4:4 B4:4 | A4:4 r:4 G4:4 E4:4 | F4:4 r:4 D4:4 A4:4 | G4:4 r:4 F4:4 r:4" },
      chordTexts: ["Cmaj7", "Am7", "Dm7", "G7"],
      romanTexts: ["Imaj7", "vi7", "ii7", "V7"],
    },
  },
  {
    name: "287 U12.L01 hook on the grand staff: the four sevenths stacked over the bass's roots",
    code: U12_L01,
    bars: 4,
    key: C,
    staff: "grand",
    tracks: ["chords", "bass"],
    chordByBar: ["C^7", "Am7", "Dm7", "G7"],
    expect: {
      staves: ["RH:treble", "LH:bass"],
      voices: {
        RH: "[C3,E4,G4,B4]:1 | [A3,C4,E4,G4,C5]:1 | [F3,C4,D4,F4,C5]:1 | [G3,D4,F4,G4,B4]:1",
        LH: "C2:1 | A2:1 | D2:1 | G2:1",
      },
    },
  },
  {
    name: "288 the five seventh qualities on C, stacked in thirds, with their symbols",
    code: 'chords: note("<[c4,e4,g4,b4] [c4,e4,g4,bb4] [c4,eb4,g4,bb4] [c4,eb4,gb4,bb4] [c4,eb4,gb4,a4]>")',
    bars: 5,
    key: C,
    staff: "treble",
    chords: ["C^7", "C7", "Cm7", "Cm7b5", "Co7"].map((symbol, bar) => ({ bar, beat: 1, symbol })),
    expect: {
      voices: {
        S1: "[C4,E4,G4,B4]:1 | [C4,E4,G4,Bb4]:1 | [C4,Eb4,G4,Bb4]:1 | [C4,Eb4,Gb4,Bb4]:1 | [C4,Eb4,Gb4,A4]:1",
      },
      chordTexts: ["Cmaj7", "C7", "Cm7", "Cm7♭5", "C°7"],
    },
  },
  {
    name: "289 a diminished seventh spelled by its chord: C dim7 holds B double flat when the code plays the chord",
    code: 'chords: chord("Co7").voicing()',
    bars: 1,
    key: C,
    staff: "treble",
    chordByBar: ["Co7"],
    chords: [{ bar: 0, beat: 1, symbol: "Co7" }],
    expect: { voices: { S1: "[Eb3,C4,Gb4,Bbb4,C5]:1" }, chordTexts: ["C°7"] },
  },
  {
    name: "290 U12.L03 hook in A harmonic minor: ii half-diminished, V7 with G sharp, i7",
    code: U12_L03,
    bars: 4,
    staff: "treble",
    tracks: ["mel"],
    harmony: perBar([
      ["Bm7b5", "iih7"],
      ["E7", "V7"],
      ["Am7", "i7"],
    ]),
    expect: {
      key: { tonic: "A", mode: "harmonic minor" },
      voices: { S1: "D4:4 r:4 F4:4 D4:4 | E4:4 r:4 G#4:4 E4:4 | C4:4 r:4 r:2 | r:1" },
      chordTexts: ["Bm7♭5", "E7", "Am7"],
      romanTexts: ["iiø7", "V7", "i7"],
    },
  },
  {
    name: "291 U12.L03 hook on the grand staff: G sharp in E7, then a courtesy natural on the G of Am7",
    code: U12_L03,
    bars: 4,
    staff: "grand",
    tracks: ["chords", "bass"],
    key: key("A", "minor"),
    chordByBar: ["Bm7b5", "E7", "Am7", "Am7"],
    expect: { staves: ["RH:treble", "LH:bass"], abc: ["^G", "=G"] },
  },
  {
    name: "292 U12.L05 hook: the guide-tone line F F E E D D C C, each note the 3rd or the 7th of its chord",
    code: U12_L05,
    bars: 8,
    key: C,
    staff: "treble",
    tracks: ["mel"],
    harmony: perBar([
      ["Dm7", "ii7"],
      ["G7", "V7"],
      ["C^7", "Imaj7"],
      ["F^7", "IVmaj7"],
      ["Bm7b5", "viih7"],
      ["E7", "V7/vi"],
      ["Am7", "vi7"],
    ]),
    expect: {
      voices: { S1: "F4:1 | F4:1 | E4:1 | E4:1 | D4:1 | D4:1 | C4:1 | C4:1" },
      guide: [
        "F4=third/Dm7",
        "F4=seventh/G7",
        "E4=third/C^7",
        "E4=seventh/F^7",
        "D4=third/Bm7b5",
        "D4=seventh/E7",
        "C4=third/Am7",
        "C4=third/Am7",
      ],
      romanTexts: ["ii7", "V7", "Imaj7", "IVmaj7", "viiø7", "V7/vi", "vi7"],
    },
  },
  {
    name: "293 U12.L06 hook: left-hand voicings on the bass staff, rootless, comping on the and of 1 and beat 3",
    code: U12_L06,
    bars: 4,
    key: C,
    staff: "bass",
    tracks: ["chords"],
    chordByBar: ["Dm7", "G7", "C^7", "C^7"],
    expect: {
      staves: ["S1:bass"],
      voices: {
        S1: "r:8 [C4,E4,F4,A4]:8 r:4 [C4,E4,F4,A4]:8 r:8 r:4 | r:8 [B3,E4,F4,A4]:8 r:4 [B3,E4,F4,A4]:8 r:8 r:4 | r:8 [B3,D4,E4,G4]:8 r:4 [B3,D4,E4,G4]:8 r:8 r:4 | r:8 [B3,D4,E4,G4]:8 r:4 [B3,D4,E4,G4]:8 r:8 r:4",
      },
      guide: [
        "C4=seventh/Dm7",
        "F4=third/Dm7",
        "C4=seventh/Dm7",
        "F4=third/Dm7",
        "B3=third/G7",
        "F4=seventh/G7",
        "B3=third/G7",
        "F4=seventh/G7",
        "B3=seventh/C^7",
        "E4=third/C^7",
        "B3=seventh/C^7",
        "E4=third/C^7",
        "B3=seventh/C^7",
        "E4=third/C^7",
        "B3=seventh/C^7",
        "E4=third/C^7",
      ],
    },
  },
  {
    name: "294 U12.L06 trio on the grand staff: the guitar above, the left hand and the walking bass each in a voice",
    code: U12_L06,
    bars: 4,
    key: C,
    staff: "grand",
    trackClefs: { chords: "bass" },
    chordByBar: ["Dm7", "G7", "C^7", "C^7"],
    chordTracks: ["chords", "bass"],
    expect: {
      staves: ["RH:treble", "LH:bass"],
      voices: {
        RH: "r:4 A4:4 r:4 F4:4 | r:4 B4:4 r:4 G4:4 | r:4 G4:4 B4:4 r:4 | r:1",
        LHv2: "D2:4 D2:4 D2:4 D2:4 | G2:4 G2:4 G2:4 G2:4 | C2:4 C2:4 C2:4 C2:4 | C2:4 C2:4 C2:4 C2:4",
      },
    },
  },
  // --- secondary dominants (U15) ------------------------------------------------------------------------------------
  {
    name: "295 U15.L01 hook: fi, si, di and te, each drawn as the code wrote it (the host passes the code)",
    code: U15_L01,
    bars: 8,
    key: C,
    staff: "treble",
    tracks: ["mel"],
    host: true,
    expect: {
      voices: {
        S1: "G4:4 F#4:4 G4:4 C5:4 | A4:4 G#4:4 A4:4 r:4 | F4:4 C#4:4 D4:4 F4:4 | G4:4 r:4 F4:4 D4:4 | G4:4 F#4:4 G4:4 C5:4 | Bb4:4 r:4 A4:4 G4:4 | A4:4 r:4 F4:4 A4:4 | G4:4 r:4 r:2",
      },
      drawn: [
        "G4=5/sol",
        "F#4=♯4/fi",
        "G4=5/sol",
        "C5=1/do",
        "A4=6/la",
        "G#4=♯5/si",
        "A4=6/la",
        "F4=4/fa",
        "C#4=♯1/di",
        "D4=2/re",
        "F4=4/fa",
        "G4=5/sol",
        "F4=4/fa",
        "D4=2/re",
        "G4=5/sol",
        "F#4=♯4/fi",
        "G4=5/sol",
        "C5=1/do",
        "Bb4=♭7/te",
        "A4=6/la",
        "G4=5/sol",
        "A4=6/la",
        "F4=4/fa",
        "A4=6/la",
        "G4=5/sol",
      ],
    },
  },
  {
    name: "296 the same tune without the code: the lower neighbour of 6 falls back to the key's A flat",
    code: U15_L01,
    bars: 2,
    key: C,
    staff: "treble",
    tracks: ["mel"],
    expect: { voices: { S1: "G4:4 F#4:4 G4:4 C5:4 | A4:4 Ab4:4 A4:4 r:4" } },
  },
  {
    name: "297 U15.L03 hook: G sharp under E7, B flat under C7, C sharp under A7, the numerals of each visit",
    code: U15_L03,
    bars: 8,
    key: C,
    staff: "treble",
    tracks: ["mel"],
    harmony: perBar([
      ["C", "I"],
      ["E7", "V7/vi"],
      ["Am", "vi"],
      ["C7", "V7/IV"],
      ["F", "IV"],
      ["A7", "V7/ii"],
      ["Dm", "ii"],
      ["G7", "V7"],
    ]),
    expect: {
      voices: {
        S1: "G4:4 r:4 E4:4 r:4 | G#4:4 r:4 B4:4 G#4:4 | A4:4 r:4 E4:4 C4:4 | Bb4:4 r:4 G4:4 E4:4 | A4:4 r:4 F4:4 r:4 | C#4:4 r:4 E4:4 G4:4 | D4:4 r:4 F4:4 D4:4 | D4:4 r:4 B3:4 r:4",
      },
      romanTexts: ["I", "V7/vi", "vi", "V7/IV", "IV", "V7/ii", "ii", "V7"],
    },
  },
  {
    name: "298 U15.L04 hook: leading-tone diminished sevenths, vii°7 of ii, of V and of vi, on the grand staff",
    code: U15_L04,
    bars: 8,
    key: C,
    staff: "grand",
    chordByBar: ["C", "C#o7", "Dm7", "F#o7", "G7", "G#o7", "Am7", "G7"],
    harmony: perBar([
      ["C", "I"],
      ["C#o7", "viio7/ii"],
      ["Dm7", "ii7"],
      ["F#o7", "viio7/V"],
      ["G7", "V7"],
      ["G#o7", "viio7/vi"],
      ["Am7", "vi7"],
      ["G7", "V7"],
    ]),
    expect: {
      voices: { LH: "C2:1 | C#2:1 | D2:1 | F#2:1 | G2:1 | G#2:1 | A2:1 | G2:1" },
      chordTexts: ["C", "C♯°7", "Dm7", "F♯°7", "G7", "G♯°7", "Am7", "G7"],
      romanTexts: ["I", "vii°7/ii", "ii7", "vii°7/V", "V7", "vii°7/vi", "vi7", "V7"],
    },
  },
  {
    name: "299 U15.L05 hook: the dominant chain, trumpet and horn stabs on one staff, each in its own voice",
    code: U15_L05,
    bars: 8,
    key: C,
    staff: "treble",
    tracks: ["mel", "horns"],
    host: true,
    chordByBar: ["C", "E7", "A7", "A7", "D7", "G7", "C", "G7"],
    chordTracks: ["horns"],
    expect: {
      voices: {
        S1v2: "G4:4 r:4 E4:4 G4:4 | G#4:4 r:4 B4:4 G#4:4 | C#4:4 r:4 E4:4 G4:4 | A4:4 r:4 r:2 | F#4:4 r:4 A4:4 F#4:4 | G4:4 r:4 F4:4 D4:4 | E4:4 r:4 r:2 | ",
        S1: "[E3,C4,E4,G4,C5]:8 r:8 r:4 r:4 r:8 [E3,C4,E4,G4,C5]:8 | [E3,D4,E4,G#4,B4]:8 r:8 r:4 r:4 r:8 [E3,D4,E4,G#4,B4]:8 | [C#3,G3,C#4,E4,A4]:8 r:8 r:4 r:4 r:8 [C#3,G3,C#4,E4,A4]:8 | [C#3,G3,C#4,E4,A4]:8 r:8 r:4 r:4 r:8 [C#3,G3,C#4,E4,A4]:8 | [F#3,C4,D4,F#4,C5]:8 r:8 r:4 r:4 r:8 [F#3,C4,D4,F#4,C5]:8 | [G3,D4,F4,G4,B4]:8 r:8 r:4 r:4 r:8 [G3,D4,F4,G4,B4]:8 | [E3,C4,E4,G4,C5]:8 r:8 r:4 r:4 r:8 [E3,C4,E4,G4,C5]:8 | [G3,D4,F4,G4,B4]:8 r:8 r:4 r:4 r:8 [G3,D4,F4,G4,B4]:8",
      },
    },
  },
  {
    name: "300 the chain as a lead sheet with the changes of Five Foot Two's first eight bars",
    code: U15_L05,
    bars: 8,
    key: C,
    staff: "lead",
    tracks: ["mel"],
    host: true,
    chords: ["C", "E7", "A7", "A7", "D7", "G7", "C", "G7"].map((symbol, bar) => ({ bar, beat: 1, symbol })),
    expect: {
      chordTexts: ["C", "E7", "A7", "A7", "D7", "G7", "C", "G7"],
      names: [..."G4 E4 G4 G#4 B4 G#4 C#4 E4 G4 A4 F#4 A4 F#4 G4 F4 D4 E4".split(" ")],
      barNumbers: [5],
    },
  },
  // --- borrowed chords (U16) ----------------------------------------------------------------------------------------
  {
    name: "301 U16.L01 hook: A flat over the minor iv, the one changed note",
    code: U16_L01,
    bars: 4,
    key: C,
    staff: "treble",
    tracks: ["mel"],
    host: true,
    harmony: perBar([
      ["C", "I"],
      ["F", "IV"],
      ["Fm", "iv"],
      ["C", "I"],
    ]),
    expect: {
      voices: { S1: "E4:4 G4:4 C5:4 G4:4 | A4:2. F4:4 | Ab4:2. F4:4 | G4:2. r:4" },
      romanTexts: ["I", "IV", "iv", "I"],
    },
  },
  {
    name: "302 U16.L01 hook on the grand staff: the chord struck four times, A flat written once in the bar",
    code: U16_L01,
    bars: 4,
    key: C,
    staff: "grand",
    tracks: ["chords", "bass"],
    chordByBar: ["C", "F", "Fm", "C"],
    expect: {
      voices: { LH: "C2:1 | F2:1 | F2:1 | C2:1" },
      abc: ["_Ac]4"],
    },
  },
  {
    name: "303 U16.L02 hook: flat VI and flat VII in one bar, do re mi above them",
    code: U16_L02,
    bars: 4,
    key: C,
    staff: "treble",
    tracks: ["mel"],
    harmony: [
      { bar: 1, beat: 1, symbol: "C", rn: "I" },
      { bar: 2, beat: 1, symbol: "F", rn: "IV" },
      { bar: 3, beat: 1, symbol: "Ab", rn: "bVI" },
      { bar: 3, beat: 3, symbol: "Bb", rn: "bVII" },
      { bar: 4, beat: 1, symbol: "C", rn: "I" },
    ],
    expect: {
      voices: { S1: "E4:4 G4:4 C5:4 G4:4 | A4:4 C5:4 A4:4 F4:4 | C5:2 D5:2 | E5:2. r:4" },
      chordTexts: ["C", "F", "A♭", "B♭", "C"],
      romanTexts: ["I", "IV", "♭VI", "♭VII", "I"],
    },
  },
  {
    name: "304 U16.L02 hook on the grand staff: the borrowed chords in flats, E natural restored in the last bar",
    code: U16_L02,
    bars: 4,
    key: C,
    staff: "grand",
    tracks: ["chords", "bass"],
    chordByBar: ["C", "F", ["Ab", "Bb"], "C"],
    expect: { abc: ["[_A,_E_Ac]8", "[D,_B,DF_B]8", "=E"] },
  },
  {
    name: "305 U16.L03 hook: te over flat III, le over the minor iv",
    code: U16_L03,
    bars: 8,
    key: C,
    host: true,
    harmony: perBar([
      ["C", "I"],
      ["Eb", "bIII"],
      ["F", "IV"],
      ["C", "I"],
      ["C", "I"],
      ["Eb", "bIII"],
      ["Fm", "iv"],
      ["C", "I"],
    ]),
    expect: {
      voices: {
        S1: "G4:4 r:4 G4:4 E4:4 | G4:4 r:4 Bb4:4 G4:4 | A4:4 r:4 A4:4 F4:4 | G4:4 r:4 r:2 | G4:4 r:4 G4:4 E4:4 | G4:4 r:4 Bb4:4 G4:4 | Ab4:4 r:4 Ab4:4 F4:4 | G4:4 r:4 r:2",
      },
      romanTexts: ["I", "♭III", "IV", "I", "I", "♭III", "iv", "I"],
    },
  },
  {
    name: "306 U16.L04 hook in A minor: F sharp under the Dorian IV, F natural again, and the Picardy C sharp",
    code: U16_L04,
    bars: 8,
    key: key("A", "minor"),
    host: true,
    harmony: [
      ...perBar([
        ["Am", "i"],
        ["D", "IV"],
        ["F", "VI"],
        ["E", "V"],
        ["Am", "i"],
        ["D", "IV"],
      ]),
      { bar: 7, beat: 1, symbol: "F", rn: "VI" },
      { bar: 7, beat: 3, symbol: "E", rn: "V" },
      { bar: 8, beat: 1, symbol: "A", rn: "I" },
    ],
    expect: {
      voices: {
        S1: "E4:4 r:4 C4:4 A3:4 | F#4:4 r:4 D4:4 r:4 | F4:4 r:4 D4:4 C4:4 | B3:4 r:4 r:2 | E4:4 r:4 C4:4 A3:4 | F#4:4 r:4 D4:4 r:4 | C4:4 B3:4 B3:4 E4:4 | C#4:2. r:4",
      },
      abc: ["^F4", "=F4", "^C12"],
    },
  },
  {
    name: "307 U16.L05 hook: Aura Lee reharmonized; the held C is split and tied where flat VII arrives",
    code: U16_L05,
    bars: 8,
    key: C,
    harmony: [
      ...perBar([
        ["C", "I"],
        ["D7", "V7/V"],
        ["G7", "V7"],
      ]),
      { bar: 4, beat: 1, symbol: "Ab", rn: "bVI" },
      { bar: 4, beat: 3, symbol: "Bb", rn: "bVII" },
      ...perBar(
        [
          ["C", "I"],
          ["D7", "V7/V"],
          ["G7", "V7"],
          ["C", "I"],
        ],
        5,
      ),
    ],
    expect: {
      voices: {
        S1: "G3:4 C4:4 B3:4 C4:4 | D4:4 A3:4 D4:2 | C4:4 B3:4 A3:4 B3:4 | C4:2~ C4:2 | G3:4 C4:4 B3:4 C4:4 | D4:4 D4:4 D4:2 | C4:4 B3:4 A3:4 B3:4 | C4:1",
      },
      romanTexts: ["I", "V7/V", "V7", "♭VI", "♭VII", "I", "V7/V", "V7", "I"],
    },
  },
  // --- modes (U14) ----------------------------------------------------------------------------------------------------
  {
    name: "308 U14.L01 hook, the mode's own signature: one sharp, then none, with a natural cancelling F sharp",
    code: U14_L01,
    bars: 4,
    staff: "bass",
    keyPlan: [
      { bar: 1, key: key("G") },
      { bar: 3, key: key("G", "mixolydian") },
    ],
    expect: {
      key: { tonic: "G", mode: "major" },
      keyMarks: ["Gmix"],
      voices: {
        S1: "G3:8 G3:8 F#3:8 G3:8 r:8 B3:8 D4:8 r:8 | F#4:8 r:8 D4:8 B3:8 G3:8 r:8 F#3:8 G3:8 | G3:8 G3:8 F3:8 G3:8 r:8 B3:8 D4:8 r:8 | F4:8 r:8 D4:8 B3:8 G3:8 r:8 F3:8 G3:8",
      },
    },
  },
  {
    name: "309 U14.L01 hook, the parallel signature: one sharp throughout, the lowered 7th a natural every time",
    code: U14_L01,
    bars: 4,
    staff: "bass",
    keyPlan: [
      { bar: 1, key: key("G") },
      { bar: 3, key: key("G", "mixolydian") },
    ],
    modal: "parallel",
    expect: {
      key: { tonic: "G", mode: "major" },
      keyMarks: [],
      abc: ["=F,2", "=F2"],
    },
  },
  {
    name: "310 U14.L02 riff in G Mixolydian with I, flat VII and IV",
    code: `${T(112)}gtr: n("<[0 ~ 2 4 ~ 4 2 ~] [6 ~ 3 1 ~ 3 -1 ~] [3 ~ 5 7 ~ 5 3 ~] [4 2 0 ~ ~ ~ ~ ~]>").scale("G3:mixolydian").s("crunch")`,
    bars: 4,
    staff: "bass",
    harmony: perBar([
      ["G", "I"],
      ["F", "bVII"],
      ["C", "IV"],
      ["G", "I"],
    ]),
    expect: {
      key: { tonic: "G", mode: "mixolydian" },
      abc: ["K:Gmix clef=bass"],
      romanTexts: ["I", "♭VII", "IV", "I"],
    },
  },
  {
    name: "311 U14.L02 Old Joe Clark, the four pinned bars, as a lead sheet in A Mixolydian",
    code: 'mel: n("<[4 5 6 5] [4 3 2@2] [4 5 6 5] [4@2 ~@2]>").scale("A3:mixolydian")',
    bars: 4,
    staff: "lead",
    chords: [{ bar: 0, beat: 1, symbol: "A" }],
    expect: {
      key: { tonic: "A", mode: "mixolydian" },
      voices: { S1: "E4:4 F#4:4 G4:4 F#4:4 | E4:4 D4:4 C#4:2 | E4:4 F#4:4 G4:4 F#4:4 | E4:2 r:2" },
      abc: ["K:Amix"],
    },
  },
  {
    name: "312 U14.L03 Drunken Sailor, the eight pinned bars, in D Dorian: no sharps or flats, B natural unmarked",
    code: SAILOR,
    bars: 8,
    staff: "lead",
    chords: ["Dm", "Dm", "C", "C", "Dm", "Dm", "C", "Dm"].map((symbol, bar) => ({ bar, beat: 1, symbol })),
    expect: {
      key: { tonic: "D", mode: "dorian" },
      voices: {
        S1: "A4:4 A4:8 A4:8 A4:4 A4:8 A4:8 | A4:4 D4:4 F4:4 A4:4 | G4:4 G4:8 G4:8 G4:4 G4:8 G4:8 | G4:4 C4:4 E4:4 G4:4 | A4:4 A4:8 A4:8 A4:4 A4:8 A4:8 | A4:4 B4:4 C5:4 D5:4 | C5:4 A4:4 G4:4 E4:4 | D4:2 D4:2",
      },
      abc: ["K:Ddor"],
      barNumbers: [5],
    },
  },
  {
    name: "313 U14.L03 hook: D minor then D Dorian, the mode's own signature (one flat, then a natural cancels it)",
    code: `${T(100)}mel: n("<[4 ~ 5 4 ~ 2 0 ~] [5 ~ 4 2 ~ 1 2 ~]>").scale("<D4:minor!2 D4:dorian!2>").s("piano")`,
    bars: 4,
    keyPlan: [
      { bar: 1, key: key("D", "minor") },
      { bar: 3, key: key("D", "dorian") },
    ],
    expect: {
      keyMarks: ["Ddor"],
      names: [..."A4 Bb4 A4 F4 D4 Bb4 A4 F4 E4 F4 A4 B4 A4 F4 D4 B4 A4 F4 E4 F4".split(" ")],
    },
  },
  {
    name: "314 U14.L04 hook: F major then F Lydian, parallel signature, the raised 4th a natural on B",
    code: `${T(84)}mel: n("<[0 ~ 2 3] [5 ~ 3 ~]>").scale("<F4:major!2 F4:lydian!2>").s("piano")`,
    bars: 4,
    keyPlan: [
      { bar: 1, key: key("F") },
      { bar: 3, key: key("F", "lydian") },
    ],
    modal: "parallel",
    expect: {
      voices: { S1: "F4:4 r:4 A4:4 Bb4:4 | D5:4 r:4 Bb4:4 r:4 | F4:4 r:4 A4:4 B4:4 | D5:4 r:4 B4:4 r:4" },
      keyMarks: [],
      abc: ["=B4"],
    },
  },
  {
    name: "315 U14.L05 hook: E minor then E Phrygian, parallel signature, the lowered 2nd a natural on F",
    code: `${T(96)}gtr: n("<[0 ~ 1 0 ~ 2 1 0] [1 ~ 3 1 ~ 0 ~ ~]>").scale("<E4:minor!2 E4:phrygian!2>").s("acgtr")`,
    bars: 4,
    keyPlan: [
      { bar: 1, key: key("E", "minor") },
      { bar: 3, key: key("E", "phrygian") },
    ],
    modal: "parallel",
    expect: {
      keyMarks: [],
      names: [..."E4 F#4 E4 G4 F#4 E4 F#4 A4 F#4 E4 E4 F4 E4 G4 F4 E4 F4 A4 F4 E4".split(" ")],
    },
  },
  {
    name: "316 U14.L06 Mode Lab: one line on D through six scales, each bar in its mode's own signature",
    code: U14_L06,
    bars: 6,
    keyPlan: ["lydian", "major", "mixolydian", "dorian", "minor", "phrygian"].map((mode, i) => ({
      bar: i + 1,
      key: key("D", mode),
    })),
    abcOptions: { barsPerLine: 3 },
    expect: { key: { tonic: "D", mode: "lydian" }, keyMarks: ["D", "Dmix", "Ddor", "Dm", "Dphr"] },
  },
  {
    name: "317 U14.L06 Mode Lab, parallel signatures: two sharps then one flat, one note dropping a bar",
    code: U14_L06,
    bars: 6,
    keyPlan: ["lydian", "major", "mixolydian", "dorian", "minor", "phrygian"].map((mode, i) => ({
      bar: i + 1,
      key: key("D", mode),
    })),
    modal: "parallel",
    abcOptions: { barsPerLine: 3 },
    expect: {
      keyMarks: ["Dm"],
      voices: {
        S1: "D4:8 F#4:8 A4:8 G#4:8 E4:8 B4:8 C#5:8 D5:8 | D4:8 F#4:8 A4:8 G4:8 E4:8 B4:8 C#5:8 D5:8 | D4:8 F#4:8 A4:8 G4:8 E4:8 B4:8 C5:8 D5:8 | D4:8 F4:8 A4:8 G4:8 E4:8 B4:8 C5:8 D5:8 | D4:8 F4:8 A4:8 G4:8 E4:8 Bb4:8 C5:8 D5:8 | D4:8 F4:8 A4:8 G4:8 Eb4:8 Bb4:8 C5:8 D5:8",
      },
    },
  },
  // --- key changes (U17) --------------------------------------------------------------------------------------------
  {
    name: "318 U17.L01 hook: C major to G major at bar 7 after a double bar, F sharp in the signature",
    code: U17_L01,
    bars: 8,
    keyPlan: [
      { bar: 1, key: C },
      { bar: 7, key: key("G") },
    ],
    harmony: perBar([
      ["C", "I"],
      ["Am", "vi"],
      ["F", "IV"],
      ["G", "V"],
      ["C", "I"],
      ["Am", "vi"],
      ["D7", "V7"],
      ["G", "I"],
    ]),
    expect: {
      keyMarks: ["G"],
      voices: {
        S1: "E4:4 r:4 G4:4 E4:4 | C4:4 r:4 r:2 | F4:4 r:4 A4:4 F4:4 | G4:4 r:4 r:2 | E4:4 r:4 G4:4 E4:4 | C4:4 r:4 E4:4 r:4 | D4:4 r:4 F#4:4 D4:4 | G4:4 r:4 r:2",
      },
      abc: [" || [K:G] "],
    },
  },
  {
    name: "319 U17.L01 hook, sixteen bars: to G, back to C with a natural cancelling the sharp, and to G again",
    code: U17_L01,
    bars: 16,
    keyPlan: [
      { bar: 1, key: C },
      { bar: 7, key: key("G") },
      { bar: 9, key: C },
      { bar: 15, key: key("G") },
    ],
    expect: { keyMarks: ["G", "C", "G"] },
  },
  {
    name: "320 U17.L02 hook: the last chorus a whole step up, two sharps after the double bar, sections named",
    code: U17_L02,
    bars: 12,
    staff: "lead",
    keyPlan: [
      { bar: 1, key: C },
      { bar: 9, key: key("D") },
    ],
    sections: marks([
      ["verse", 0],
      ["chorus", 4],
      ["chorus2", 8],
    ]),
    chords: ["C", "Am", "F", "G", "C", "G", "Am", "F", "D", "A", "Bm", "G"].map((symbol, bar) => ({
      bar,
      beat: 1,
      symbol,
    })),
    expect: {
      keyMarks: ["D"],
      parts: ["Verse", "Chorus", "Chorus 2"],
      names: [
        ..."E4 E4 D4 C4 F4 F4 E4 D4 G4 G4 A4 G4 D4 A4 A4 C5 C5 A4 A4 A4 B4 A4 E4 B4 B4 D5 D5 B4".split(" "),
      ],
    },
  },
  {
    name: "321 U17.L03 hook: C major to A minor has the same signature, so no double bar and no new signature",
    code: U17_L03,
    bars: 8,
    keyPlan: [
      { bar: 1, key: C },
      { bar: 7, key: key("A", "harmonic minor") },
    ],
    expect: {
      keyMarks: [],
      voices: {
        S1: "G4:4 r:4 E4:4 G4:4 | E4:4 r:4 C4:4 r:4 | A4:4 r:4 F4:4 A4:4 | G4:4 r:4 r:2 | G4:4 r:4 E4:4 G4:4 | E4:4 r:4 C4:4 r:4 | E4:4 r:4 G#4:4 E4:4 | A4:4 r:4 r:2",
      },
    },
  },
  {
    name: "322 U17.L04 hook: the chorus in F and again in G, tune and bass on the grand staff",
    code: U17_L04,
    bars: 8,
    staff: "grand",
    keyPlan: [
      { bar: 1, key: key("F") },
      { bar: 5, key: key("G") },
    ],
    expect: {
      staves: ["RH:treble", "LH:bass"],
      voices: {
        RH: "A4:4 r:4 C5:4 A4:4 | F4:4 r:4 A4:4 r:4 | Bb4:4 r:4 D5:4 Bb4:4 | G4:4 r:4 r:2 | B4:4 r:4 D5:4 B4:4 | G4:4 r:4 B4:4 r:4 | C5:4 r:4 E5:4 C5:4 | A4:4 r:4 r:2",
        LH: "F2:4 r:4 F2:4 F2:4 | D3:4 r:4 D3:4 D3:4 | Bb2:4 r:4 Bb2:4 Bb2:4 | C3:4 r:4 C3:4 C3:4 | G2:4 r:4 G2:4 G2:4 | E3:4 r:4 E3:4 E3:4 | C3:4 r:4 C3:4 C3:4 | D3:4 r:4 D3:4 D3:4",
      },
      keyMarks: ["G", "G"],
    },
  },
  {
    name: "323 a key change at a system break: two sharps to none, then to five flats",
    code: 'mel: note("<[d4 f#4 a4 f#4] [d4 e4 f#4 g4] [c4 e4 g4 e4] [c4 d4 e4 f4] [db4 f4 ab4 f4] [db4 eb4 f4 gb4]>")',
    bars: 6,
    keyPlan: [
      { bar: 1, key: key("D") },
      { bar: 3, key: C },
      { bar: 5, key: key("Db") },
    ],
    abcOptions: { barsPerLine: 2 },
    expect: {
      keyMarks: ["C", "Db"],
      voices: {
        S1: "D4:4 F#4:4 A4:4 F#4:4 | D4:4 E4:4 F#4:4 G4:4 | C4:4 E4:4 G4:4 E4:4 | C4:4 D4:4 E4:4 F4:4 | Db4:4 F4:4 Ab4:4 F4:4 | Db4:4 Eb4:4 F4:4 Gb4:4",
      },
    },
  },
  {
    name: "324 courtesy accidentals after a key change: F sharp by accident before it, F natural written after it",
    code: 'mel: note("<[c4 e4 f#4 g4] [f4 a4 c5 a4] [bb4 a4 g4 f4]>")',
    bars: 3,
    keyPlan: [
      { bar: 1, key: C },
      { bar: 2, key: key("F") },
    ],
    expect: {
      keyMarks: ["F"],
      voices: { S1: "C4:4 E4:4 F#4:4 G4:4 | F4:4 A4:4 C5:4 A4:4 | Bb4:4 A4:4 G4:4 F4:4" },
      abc: ["^F4", "[K:F] !class=oak-e4!=F4"],
    },
  },
  {
    name: "325 a pickup, then a key change: bar numbers count the first full bar as 1",
    code: 'mel: note("<[~ ~ ~ g4] [c5 b4 a4 g4] [e4 d4 c4 a4] [d5 c#5 b4 a4] [f#4 e4 d4 ~]>")',
    bars: 5,
    pickup: { units: [1, 1] },
    keyPlan: [
      { bar: 0, key: C },
      { bar: 3, key: key("D") },
    ],
    expect: {
      keyMarks: ["D"],
      voices: {
        S1: "G4:4 | C5:4 B4:4 A4:4 G4:4 | E4:4 D4:4 C4:4 A4:4 | D5:4 C#5:4 B4:4 A4:4 | F#4:4 E4:4 D4:4",
      },
    },
  },
  {
    name: "326 Body and Soul's key plan on a fixture line: five flats, two sharps, none, five flats again",
    code: 'mel: note("<[db4 f4 ab4 c5] [d4 f#4 a4 c#5] [c4 e4 g4 b4] [db4 f4 ab4 c5]>")',
    bars: 4,
    keyPlan: [
      { bar: 1, key: key("Db") },
      { bar: 2, key: key("D") },
      { bar: 3, key: C },
      { bar: 4, key: key("Db") },
    ],
    expect: {
      keyMarks: ["D", "C", "Db"],
      voices: {
        S1: "Db4:4 F4:4 Ab4:4 C5:4 | D4:4 F#4:4 A4:4 C#5:4 | C4:4 E4:4 G4:4 B4:4 | Db4:4 F4:4 Ab4:4 C5:4",
      },
    },
  },
  // --- C7 Chromatic Colour and the finale ---------------------------------------------------------------------------
  {
    name: "327 C7's changes on the grand staff: a secondary dominant, flat VI and flat VII, the numerals below",
    code: `${T(100)}chords: chord("<C A7 Dm G Ab Bb C C>").voicing().s("piano")\nbass: chord("<C A7 Dm G Ab Bb C C>").rootNotes(2).s("ebass")`,
    bars: 8,
    key: C,
    staff: "grand",
    chordByBar: ["C", "A7", "Dm", "G", "Ab", "Bb", "C", "C"],
    harmony: perBar([
      ["C", "I"],
      ["A7", "V7/ii"],
      ["Dm", "ii"],
      ["G", "V"],
      ["Ab", "bVI"],
      ["Bb", "bVII"],
      ["C", "I"],
    ]),
    expect: {
      voices: { LH: "C2:1 | A2:1 | D2:1 | G2:1 | Ab2:1 | Bb2:1 | C2:1 | C2:1" },
      romanTexts: ["I", "V7/ii", "ii", "V", "♭VI", "♭VII", "I"],
    },
  },
  {
    name: "328 CF-T fixture in the shape of Five Foot Two: 32 bars AABA in C over the chain of dominants",
    code: FIVE_FOOT_TWO,
    bars: 32,
    key: C,
    staff: "lead",
    chords: FIVE_FOOT_TWO_CHANGES.map((symbol, bar) => ({ bar, beat: 1, symbol })),
    sections: marks([
      ["a", 0],
      ["a2", 8],
      ["b", 16],
      ["a3", 24],
    ]),
    expect: {
      parts: ["A", "A 2", "B", "A 3"],
      barNumbers: [5, 9, 13, 17, 21, 25, 29],
      rhythm: { exact: true },
    },
  },
  {
    name: "329 CF-T fixture in the shape of Ain't She Sweet: 32 bars AABA in C, two chords a bar, a diminished passing chord",
    code: AINT_SHE_SWEET,
    bars: 32,
    key: C,
    staff: "lead",
    chords: AINT_SHE_SWEET_CHANGES.flatMap((c, bar) =>
      Array.isArray(c)
        ? c.map((symbol, i) => ({ bar, beat: 1 + 2 * i, symbol }))
        : [{ bar, beat: 1, symbol: c }],
    ),
    sections: marks([
      ["a", 0],
      ["a2", 8],
      ["b", 16],
      ["a3", 24],
    ]),
    expect: { parts: ["A", "A 2", "B", "A 3"], rhythm: { exact: true } },
  },
  {
    name: "330 CF-T fixture in the shape of Bye Bye Blackbird: 32 bars ABAC in F, long notes over two bars, a triplet",
    code: BLACKBIRD,
    bars: 32,
    key: key("F"),
    staff: "lead",
    chords: BLACKBIRD_CHANGES.map((symbol, bar) => ({ bar, beat: 1, symbol })),
    sections: marks([
      ["a", 0],
      ["b", 8],
      ["a2", 16],
      ["c", 24],
    ]),
    expect: { parts: ["A", "B", "A 2", "C"], rhythm: { exact: true }, abc: ["K:F"] },
  },
  {
    name: "331 CF-T page 2: bars 17 to 32 of the Five Foot Two fixture, the bridge restating its chord and section",
    code: FIVE_FOOT_TWO,
    bars: 16,
    startBar: 16,
    key: C,
    staff: "lead",
    chords: FIVE_FOOT_TWO_CHANGES.map((symbol, bar) => ({ bar, beat: 1, symbol })),
    sections: marks([
      ["a", 0],
      ["a2", 8],
      ["b", 16],
      ["a3", 24],
    ]).filter((m) => m.bar >= 16),
    expect: { parts: ["B", "A 3"], barNumbers: [17, 21, 25, 29] },
  },
];
