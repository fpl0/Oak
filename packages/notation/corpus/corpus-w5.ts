// Wave 5 golden corpus (entries 182–): minor keys with raised 6 and 7 in every signature, blue notes and the blues
// scale, dominant sevenths and 12-bar lead sheets, swung lines, bass lines with approach tones down to E1,
// section-labelled lead sheets, and the U08–U11 lesson material of content/specs (hooks copied as written, so a
// later spec edit does not move a snapshot). Every entry is evaluated by headless Strudel 1.2.6 and read back from
// the ABC independently (corpus.test.ts); the note lists and spellings below were checked by hand.
import type { CorpusEntry } from "./harness.ts";

const SW8 = { subdivision: 8, amount: 1 / 3 } as const;
const T = (bpm: number) => `setcpm(${bpm}/4)\n\n`;
/** A section list as `sectionMarks` gives it (0-based bars; a double bar before every section but the first). */
const marks = (list: [string, number][]) =>
  list.map(([tag, bar], i) => ({
    bar,
    tag,
    text: tag.charAt(0).toUpperCase() + tag.slice(1).replace(/(\d+)$/, " $1"),
    doubleBar: i > 0,
  }));
const perBar = (symbols: string[], from = 0) =>
  symbols.map((symbol, i) => ({ bar: from + i, beat: 1, symbol }));
const TWELVE_C = ["C7", "C7", "C7", "C7", "F7", "F7", "C7", "C7", "G7", "F7", "C7", "G7"];

export const CORPUS_W5: CorpusEntry[] = [
  // --- minor keys: signatures, raised 6 and 7, cancelling inside the bar, courtesy accidentals -------------------
  {
    name: "182 A natural minor up an octave: no signature, no accidentals",
    code: 'n("0 1 2 3 4 5 6 7").scale("A3:minor")',
    bars: 1,
    expect: {
      key: { tonic: "A", mode: "minor" },
      voices: { S1: "A3:8 B3:8 C4:8 D4:8 E4:8 F4:8 G4:8 A4:8" },
      abc: ["K:Am\n"],
    },
  },
  {
    name: "183 A harmonic minor: the raised 7th G sharp written in the bar",
    code: 'n("0 1 2 3 4 5 6 7").scale("A3:harmonic:minor")',
    bars: 1,
    expect: {
      key: { tonic: "A", mode: "harmonic minor" },
      voices: { S1: "A3:8 B3:8 C4:8 D4:8 E4:8 F4:8 G#4:8 A4:8" },
      abc: ["K:Am\n", "^G2"],
    },
  },
  {
    name: "184 A melodic minor up, natural minor down in one bar: F sharp G sharp, then the naturals",
    code: 'note("a4 b4 c5 d5 e5 f#5 g#5 a5 g5 f5 e5 d5 c5 b4 a4 ~")',
    bars: 1,
    key: { tonic: "A", mode: "minor" },
    expect: {
      voices: {
        S1: "A4:16 B4:16 C5:16 D5:16 E5:16 F#5:16 G#5:16 A5:16 G5:16 F5:16 E5:16 D5:16 C5:16 B4:16 A4:16 r:16",
      },
      abc: ["^f!class=oak-e6!^g", "=g!class=oak-e9!=f"],
    },
  },
  {
    name: "185 G sharp in one bar, G in the next: a courtesy natural",
    code: 'note("<[e4 g#4 a4 b4] [c5 b4 a4 g4]>")',
    bars: 2,
    key: { tonic: "A", mode: "minor" },
    expect: { voices: { S1: "E4:4 G#4:4 A4:4 B4:4 | C5:4 B4:4 A4:4 G4:4" }, abc: ["=G4 |]"] },
  },
  {
    name: "186 E harmonic minor: one sharp, D sharp as the leading note",
    code: 'n("0 1 2 3 4 5 6 7").scale("E4:harmonic:minor")',
    bars: 1,
    expect: { key: { tonic: "E", mode: "harmonic minor" }, abc: ["K:Em\n", "^d2"] },
  },
  {
    name: "187 C melodic minor: three flats, A and B natural",
    code: 'n("0 1 2 3 4 5 6 7").scale("C4:melodic:minor")',
    bars: 1,
    expect: {
      key: { tonic: "C", mode: "melodic minor" },
      voices: { S1: "C4:8 D4:8 Eb4:8 F4:8 G4:8 A4:8 B4:8 C5:8" },
      abc: ["K:Cm\n", "=A2 !class=oak-e6!=B2"],
    },
  },
  {
    name: "188 F harmonic minor: four flats, E natural",
    code: 'n("[4 5 6 7] [6 5 4 ~]").scale("F4:harmonic:minor")',
    bars: 1,
    expect: { voices: { S1: "C5:8 Db5:8 E5:8 F5:8 E5:8 Db5:8 C5:8 r:8" }, abc: ["K:Fm\n", "=e2"] },
  },
  {
    name: "189 B minor: two sharps, A sharp as the leading note",
    code: 'n("0 2 4 6 7 6 4 0").scale("B3:harmonic:minor")',
    bars: 1,
    expect: { voices: { S1: "B3:8 D4:8 F#4:8 A#4:8 B4:8 A#4:8 F#4:8 B3:8" }, abc: ["K:Bm\n", "^A2"] },
  },
  {
    name: "190 F sharp minor melodic: three sharps, D sharp and E sharp",
    code: 'n("0 1 2 3 4 5 6 7").scale("F#4:melodic:minor")',
    bars: 1,
    expect: {
      voices: { S1: "F#4:8 G#4:8 A4:8 B4:8 C#5:8 D#5:8 E#5:8 F#5:8" },
      abc: ["K:F#m\n", "^d2", "^e2"],
    },
  },
  {
    name: "191 C sharp minor: B sharp as the raised 7th",
    code: 'n("[0 6 7 ~]").scale("C#4:harmonic:minor")',
    bars: 1,
    expect: { voices: { S1: "C#4:4 B#4:4 C#5:4 r:4" }, abc: ["K:C#m\n", "^B4"] },
  },
  {
    name: "192 G sharp minor: five sharps, F double sharp",
    code: 'n("[4 6 7 ~]").scale("G#3:harmonic:minor")',
    bars: 1,
    expect: { voices: { S1: "D#4:4 F##4:4 G#4:4 r:4" }, abc: ["K:G#m\n", "^^F4"] },
  },
  {
    name: "193 D sharp minor: six sharps, C double sharp",
    code: 'n("[0 6 7 ~]").scale("D#4:harmonic:minor")',
    bars: 1,
    expect: { voices: { S1: "D#4:4 C##5:4 D#5:4 r:4" }, abc: ["K:D#m\n", "^^c4"] },
  },
  {
    name: "194 B flat minor: five flats, A natural",
    code: 'n("[0 6 7 ~]").scale("Bb3:harmonic:minor")',
    bars: 1,
    expect: { voices: { S1: "Bb3:4 A4:4 Bb4:4 r:4" }, abc: ["K:Bbm\n", "=A4"] },
  },
  {
    name: "195 E flat minor: six flats, D natural",
    code: 'n("[0 6 7 ~]").scale("Eb4:harmonic:minor")',
    bars: 1,
    expect: { voices: { S1: "Eb4:4 D5:4 Eb5:4 r:4" }, abc: ["K:Ebm\n", "=d4"] },
  },
  {
    name: "196 A flat minor: seven flats, G natural",
    code: 'n("[0 6 7 ~]").scale("Ab3:harmonic:minor")',
    bars: 1,
    expect: { voices: { S1: "Ab3:4 G4:4 Ab4:4 r:4" }, abc: ["K:Abm\n", "=G4"] },
  },
  {
    name: "197 U10.L01 hook: the tune in C major, then the same four bars in C minor (three flats from bar 5)",
    code: `${T(84)}mel: n("<[4 ~ 2 4] [6 ~ 4 ~] [5 ~ 7 5] [5 ~ 3 ~]>").scale("<C4:major!4 C4:minor!4>").s("piano")`,
    bars: 8,
    key: { tonic: "C", mode: "major" },
    keyChanges: [{ bar: 4, key: { tonic: "C", mode: "minor" } }],
    expect: {
      voices: {
        S1: "G4:4 r:4 E4:4 G4:4 | B4:4 r:4 G4:4 r:4 | A4:4 r:4 C5:4 A4:4 | A4:4 r:4 F4:4 r:4 | G4:4 r:4 Eb4:4 G4:4 | Bb4:4 r:4 G4:4 r:4 | Ab4:4 r:4 C5:4 Ab4:4 | Ab4:4 r:4 F4:4 r:4",
      },
      abc: [" ||\n[K:Cm] "],
    },
  },
  {
    name: "198 U10.L06 hook: a harmonic-minor tune over Am Dm E Am, G sharp only where the tune climbs to 1",
    code: `${T(84)}mel: n("<[4 ~ 2 0] [3 ~ 5 3] [4 ~ 1 ~] [0 ~ ~ ~] [4 ~ 2 0] [3 ~ 5 3] [4 ~ 6 ~] [7 ~ ~ ~]>").scale("A3:harmonic:minor").s("piano")`,
    bars: 8,
    staff: "lead",
    chords: perBar(["Am", "Dm", "Em", "Am", "Am", "Dm", "E", "Am"]),
    expect: {
      key: { tonic: "A", mode: "harmonic minor" },
      voices: {
        S1: "E4:4 r:4 C4:4 A3:4 | D4:4 r:4 F4:4 D4:4 | E4:4 r:4 B3:4 r:4 | A3:4 r:4 r:2 | E4:4 r:4 C4:4 A3:4 | D4:4 r:4 F4:4 D4:4 | E4:4 r:4 G#4:4 r:4 | A4:4 r:4 r:2",
      },
      chordTexts: ["Am", "Dm", "Em", "Am", "Am", "Dm", "E", "Am"],
    },
  },
  {
    name: "199 U10.L08 hook: natural minor, then the melodic-minor climb, then back (no new signature for a new form)",
    code: `${T(88)}mel: n("<[0 2 4 ~] [3 ~ 2 1] [4 5 6 ~] [7 ~ ~ ~]>").scale("<A3:minor!2 A3:melodic:minor A3:minor>").s("piano")`,
    bars: 4,
    key: { tonic: "A", mode: "minor" },
    keyChanges: [
      { bar: 2, key: { tonic: "A", mode: "melodic minor" } },
      { bar: 3, key: { tonic: "A", mode: "minor" } },
    ],
    expect: {
      voices: { S1: "A3:4 C4:4 E4:4 r:4 | D4:4 r:4 C4:4 B3:4 | E4:4 F#4:4 G#4:4 r:4 | A4:4 r:4 r:2" },
      abc: ["K:Am\n"],
    },
  },
  {
    name: "200 U10.L03 hook: the Aeolian tune in A minor, bass under it on the grand staff",
    code: `${T(92)}bass: n("[0 ~ 0 7]").add(n("<0 3 5 4>")).scale("A1:minor").s("fingerbass")\nmel: n("<[2 ~ 1 0] [5 ~ 3 ~] [7 ~ 5 4] [4 ~ ~ ~]>").scale("A3:minor").s("piano")`,
    bars: 4,
    expect: {
      key: { tonic: "A", mode: "minor" },
      staves: ["RH:treble", "LH:bass"],
      voices: {
        RH: "C4:4 r:4 B3:4 A3:4 | F4:4 r:4 D4:4 r:4 | A4:4 r:4 F4:4 E4:4 | E4:4 r:4 r:2",
        LH: "A1:4 r:4 A1:4 A2:4 | D2:4 r:4 D2:4 D3:4 | F2:4 r:4 F2:4 F3:4 | E2:4 r:4 E2:4 E3:4",
      },
    },
  },
  // --- blues: blue notes in a major signature, the blues scale, dominant sevenths -------------------------------
  {
    name: "201 the C blues scale up and down: major signature, E flat and B flat, F sharp up and G flat down",
    code: 'n("0 1 2 3 4 5 6 5 4 3 2 1 0 ~").scale("C4:blues")',
    bars: 1,
    meter: "7/8",
    grouping: [2, 2, 3],
    expect: {
      key: { tonic: "C", mode: "blues" },
      names: ["C4", "Eb4", "F4", "F#4", "G4", "Bb4", "C5", "Bb4", "G4", "Gb4", "F4", "Eb4", "C4"],
      abc: ["K:C\n"],
    },
  },
  {
    name: "202 a blue third over C7 and F7: E flat climbing to E stays a flat",
    code: 'note("<[60 63 64 67] [69 72 75 72]>")',
    bars: 2,
    key: { tonic: "C", mode: "major" },
    chords: perBar(["C7", "F7"]),
    staff: "lead",
    expect: {
      voices: { S1: "C4:4 Eb4:4 E4:4 G4:4 | A4:4 C5:4 Eb5:4 C5:4" },
      chordTexts: ["C7", "F7"],
      abc: ["_E4", "=E4"],
    },
  },
  {
    name: "203 the same line over C and F (no blues): D sharp leads into E",
    code: 'note("<[60 63 64 67] [69 72 75 72]>")',
    bars: 2,
    key: { tonic: "C", mode: "major" },
    chords: perBar(["C", "F"]),
    staff: "lead",
    expect: { voices: { S1: "C4:4 D#4:4 E4:4 G4:4 | A4:4 C5:4 Eb5:4 C5:4" } },
  },
  {
    name: "204 a flat seven passing up to the octave in a blues: B flat, not A sharp",
    code: 'note("69 70 71 72")',
    bars: 1,
    key: { tonic: "C", mode: "major" },
    blues: true,
    expect: { voices: { S1: "A4:4 Bb4:4 B4:4 C5:4" }, abc: ["_B4", "=B4"] },
  },
  {
    name: "205 the flat five falling to 4 over F7: G flat",
    code: 'note("69 66 65 60")',
    bars: 1,
    key: { tonic: "C", mode: "major" },
    chords: perBar(["F7", "C7"]),
    expect: { voices: { S1: "A4:4 Gb4:4 F4:4 C4:4" }, abc: ["_G4"] },
  },
  {
    name: "206 U11.L03 hook: the blues scale on the guitar, bass clef, no three-flat signature",
    code: `${T(92)}gtr: n("<[0 1 2 3] [4 ~ 3 2]>").scale("C3:blues").s("crunch").distort(.8)`,
    bars: 2,
    expect: {
      key: { tonic: "C", mode: "blues" },
      staves: ["S1:bass"],
      voices: { S1: "C3:4 Eb3:4 F3:4 F#3:4 | G3:4 r:4 Gb3:4 F3:4" },
      abc: ["K:C clef=bass\n"],
    },
  },
  {
    name: "207 U11.L04 hook: the riff over C7 and F7 as a lead sheet, dominant-seventh symbols",
    code: `${T(90)}gtr: n("<[0 1 2 4] [3 2 0 ~]>").scale("C4:blues").s("crunch")`,
    bars: 2,
    staff: "lead",
    chords: perBar(["C7", "F7"]),
    expect: {
      voices: { S1: "C4:4 Eb4:4 F4:4 G4:4 | Gb4:4 F4:4 C4:4 r:4" },
      chordTexts: ["C7", "F7"],
    },
  },
  {
    name: "208 U11.L05 exemplar: the riff over twelve bars of C7 F7 G7, a symbol at each change",
    code: `${T(100)}gtr: n("<[0 1 2 4] [3 2 0 ~]>").scale("C4:blues").s("crunch")`,
    bars: 12,
    staff: "lead",
    chords: perBar(TWELVE_C),
    abcOptions: { barsPerLine: 4 },
    expect: {
      chordTexts: TWELVE_C,
      barNumbers: [5, 9],
      voices: {
        S1: "C4:4 Eb4:4 F4:4 G4:4 | Gb4:4 F4:4 C4:4 r:4 | C4:4 Eb4:4 F4:4 G4:4 | Gb4:4 F4:4 C4:4 r:4 | C4:4 Eb4:4 F4:4 G4:4 | Gb4:4 F4:4 C4:4 r:4 | C4:4 Eb4:4 F4:4 G4:4 | Gb4:4 F4:4 C4:4 r:4 | C4:4 Eb4:4 F4:4 G4:4 | Gb4:4 F4:4 C4:4 r:4 | C4:4 Eb4:4 F4:4 G4:4 | Gb4:4 F4:4 C4:4 r:4",
      },
    },
  },
  {
    name: "209 U11.L06 quick change with a turnaround: F7 in bar 2, C7 F7 and C7 G7 in the last two bars",
    code: 'gtr: note("<c4 eb4 c4 c4 f4 f4 c4 c4 g4 f4 [c4 f4] [c4 g4]>")',
    bars: 12,
    staff: "lead",
    chords: [
      ...perBar(["C7", "F7", "C7", "C7", "F7", "F7", "C7", "C7", "G7", "F7"]),
      { bar: 10, beat: 1, symbol: "C7" },
      { bar: 10, beat: 3, symbol: "F7" },
      { bar: 11, beat: 1, symbol: "C7" },
      { bar: 11, beat: 3, symbol: "G7" },
    ],
    expect: {
      chordTexts: ["C7", "F7", "C7", "C7", "F7", "F7", "C7", "C7", "G7", "F7", "C7", "F7", "C7", "G7"],
      voices: {
        S1: "C4:1 | Eb4:1 | C4:1 | C4:1 | F4:1 | F4:1 | C4:1 | C4:1 | G4:1 | F4:1 | C4:2 F4:2 | C4:2 G4:2",
      },
    },
  },
  {
    name: "210 U11.L02 hook: the minor-pentatonic riff in A, A minor signature, bass clef",
    code: `${T(100)}gtr: n("0 ~ 1 2 3 2 1 ~").scale("A2:minor:pentatonic").s("acgtr")`,
    bars: 1,
    expect: {
      key: { tonic: "A", mode: "minor pentatonic" },
      voices: { S1: "A2:8 r:8 C3:8 D3:8 E3:8 D3:8 C3:8 r:8" },
      abc: ["K:Am clef=bass\n"],
    },
  },
  {
    name: "211 U11.L01 hook: the major-pentatonic tune over I V vi IV",
    code: `${T(96)}mel: n("<[4 3 2 1] [0 1 2 ~] [3 4 5 4] [2 1 0 ~]>").scale("C4:major:pentatonic").s("piano")`,
    bars: 4,
    staff: "lead",
    chords: perBar(["C", "G", "Am", "F"]),
    expect: {
      key: { tonic: "C", mode: "major pentatonic" },
      voices: { S1: "A4:4 G4:4 E4:4 D4:4 | C4:4 D4:4 E4:4 r:4 | G4:4 A4:4 C5:4 A4:4 | E4:4 D4:4 C4:4 r:4" },
    },
  },
  {
    name: "212 F blues lead sheet: B flat 7 in the symbols, A flat as the blue third",
    code: 'mel: note("<[65 68 69 72] [75 ~ 72 ~] [65 ~ ~ ~] [~ 72 68 65]>")',
    bars: 4,
    key: { tonic: "F", mode: "major" },
    staff: "lead",
    chords: perBar(["F7", "Bb7", "F7", "C7"]),
    expect: {
      voices: { S1: "F4:4 Ab4:4 A4:4 C5:4 | Eb5:4 r:4 C5:4 r:4 | F4:4 r:4 r:2 | r:4 C5:4 Ab4:4 F4:4" },
      chordTexts: ["F7", "B♭7", "F7", "C7"],
    },
  },
  // --- swing: straightened, "Swing 8ths" on the tempo line --------------------------------------------------------
  {
    name: "213 U11.L07 hook: the swung riff written in plain eighths over C7",
    code: `${T(112)}gtr: n("<[0 ~ 1 2 ~ 4 2 ~] [3 2 0 ~]>").scale("C4:blues").swingBy(1/3, 4).s("crunch")`,
    bars: 2,
    swing: SW8,
    staff: "lead",
    chords: perBar(["C7", "C7"]),
    tempoBpm: 112,
    expect: {
      voices: { S1: "C4:8 r:8 Eb4:8 F4:8 r:8 G4:8 F4:8 r:8 | Gb4:4 F4:4 C4:4 r:4" },
      abc: ['Q:"Swing 8ths" 1/4=112\n'],
    },
  },
  {
    name: "214 swung eighths over two bars: the off-beat of beat 4 crosses the bar line and is put back",
    code: 'note("<[c4 d4 e4 f4 g4 a4 b4 c5] [d5 c5 b4 a4 g4 f4 e4 d4]>").swingBy(1/3, 4)',
    bars: 2,
    swing: SW8,
    expect: {
      voices: { S1: "C4:8 D4:8 E4:8 F4:8 G4:8 A4:8 B4:8 C5:8 | D5:8 C5:8 B4:8 A4:8 G4:8 F4:8 E4:8 D4:8" },
    },
  },
  {
    name: "215 swung off-beats after rests: a shuffle that starts on the and",
    code: 'note("[~ c4] [~ e4] [g4 ~] [~ c5]").swingBy(1/3, 4)',
    bars: 1,
    swing: SW8,
    expect: { voices: { S1: "r:8 C4:8 r:8 E4:8 G4:8 r:8 r:8 C5:8" } },
  },
  {
    name: "216 swing in 3/4: the off-beats of three beats",
    code: 'note("c4 d4 e4 f4 g4 a4").swingBy(1/3, 3)',
    bars: 1,
    meter: "3/4",
    swing: SW8,
    expect: { voices: { S1: "C4:8 D4:8 E4:8 F4:8 G4:8 A4:8" } },
  },
  {
    name: "217 swung sixteenths in a melodic line",
    code: 'note("c5 b4 a4 g4 f4 e4 d4 c4 d4 e4 f4 g4 a4 b4 c5 ~").swingBy(1/3, 8)',
    bars: 1,
    swing: { subdivision: 16, amount: 1 / 3 },
    expect: {
      voices: {
        S1: "C5:16 B4:16 A4:16 G4:16 F4:16 E4:16 D4:16 C4:16 D4:16 E4:16 F4:16 G4:16 A4:16 B4:16 C5:16 r:16",
      },
      abc: ['Q:"Swing 16ths"\n'],
    },
  },
  {
    name: "218 a swung quarter-note bass is unchanged by the swing",
    code: 'bass: note("c2 e2 g2 a2").swingBy(1/3, 4)',
    bars: 1,
    swing: SW8,
    expect: { voices: { S1: "C2:4 E2:4 G2:4 A2:4" }, staves: ["S1:bass"] },
  },
  {
    name: "219 swing declared in 6/8 cannot be written: engraved as played, warned",
    code: 'note("c4 d4 e4 f4 g4 a4")',
    bars: 1,
    meter: "6/8",
    swing: SW8,
    expect: { warnings: ["swing-unsupported"], voices: { S1: "C4:8 D4:8 E4:8 F4:8 G4:8 A4:8" } },
  },
  // --- bass lines: roots, fifths, approach tones, ledger lines to E1 ----------------------------------------------
  {
    name: "220 U08.L01 hook: the roots of I V vi IV low in the bass clef",
    code: `${T(92)}bass: n("<0 4 5 3>").scale("C2:major").s("ebass").lpf(600)`,
    bars: 4,
    expect: { staves: ["S1:bass"], voices: { S1: "C2:1 | G2:1 | A2:1 | F2:1" } },
  },
  {
    name: "221 U08.L03 hook: approach notes, B1 into A1 from above, E1 and F sharp 1 from below, ledger lines to E1",
    code: `${T(92)}bass: note("<[c2 ~ c2 b1] [a1 ~ a1 e1] [f1 ~ f1 f#1] [g1 ~ g1 b1]>").s("ebass").lpf(600)`,
    bars: 4,
    key: { tonic: "C", mode: "major" },
    chords: perBar(["C", "Am", "F", "G"]),
    expect: {
      staves: ["S1:bass"],
      voices: { S1: "C2:4 r:4 C2:4 B1:4 | A1:4 r:4 A1:4 E1:4 | F1:4 r:4 F1:4 F#1:4 | G1:4 r:4 G1:4 B1:4" },
      abc: ["^F,,,4"],
    },
  },
  {
    name: "222 a G major walking bass: D sharp into E, B flat and A flat into the chord below",
    code: 'bass: note("<[31 35 38 39] [40 43 35 34] [33 36 40 32] 31>")',
    bars: 4,
    key: { tonic: "G", mode: "major" },
    chords: perBar(["G", "Em", "Am", "G"]),
    expect: {
      voices: { S1: "G1:4 B1:4 D2:4 D#2:4 | E2:4 G2:4 B1:4 Bb1:4 | A1:4 C2:4 E2:4 Ab1:4 | G1:1" },
    },
  },
  {
    name: "223 approach tones in C: G sharp into A, A flat into G, D sharp into E, D flat into C",
    code: 'bass: note("<[36 40 32 33] [36 35 32 31] [36 38 39 40] [31 ~ 37 36]>")',
    bars: 4,
    key: { tonic: "C", mode: "major" },
    expect: {
      voices: {
        S1: "C2:4 E2:4 G#1:4 A1:4 | C2:4 B1:4 Ab1:4 G1:4 | C2:4 D2:4 D#2:4 E2:4 | G1:4 r:4 Db2:4 C2:4",
      },
    },
  },
  {
    name: "224 F major: B natural into B flat stays B (never C flat), E into F",
    code: 'bass: note("<[29 33 36 35] [34 38 41 40] 41>")',
    bars: 3,
    key: { tonic: "F", mode: "major" },
    chords: perBar(["F", "Bb", "F"]),
    expect: {
      voices: { S1: "F1:4 A1:4 C2:4 B1:4 | Bb1:4 D2:4 F2:4 E2:4 | F2:1" },
      abc: ["=B,,,4 |", "_B,,,4"],
    },
  },
  {
    name: "225 D major: F natural into F sharp stays F (never E sharp)",
    code: 'bass: note("38 41 42 45")',
    bars: 1,
    key: { tonic: "D", mode: "major" },
    expect: { voices: { S1: "D2:4 F2:4 F#2:4 A2:4" }, abc: ["=F,,4", "^F,,4"] },
  },
  {
    name: "226 U08.L05 hook: root, octave and fifth under I vi IV V in the bass clef",
    code: `${T(96)}bass: n("<[0 ~ 0 4] [5 ~ 5 9] [3 ~ 3 7] [4 ~ 4 8]>").scale("C2:major").s("fingerbass").lpf(600)`,
    bars: 4,
    expect: {
      staves: ["S1:bass"],
      voices: { S1: "C2:4 r:4 C2:4 G2:4 | A2:4 r:4 A2:4 E3:4 | F2:4 r:4 F2:4 C3:4 | G2:4 r:4 G2:4 D3:4" },
    },
  },
  {
    name: "227 U10.L06 bass: chord roots of Am Dm E Am, the E major chord under it",
    code: `${T(84)}bass: chord("<Am Dm E Am>").rootNotes(2).s("fingerbass")`,
    bars: 4,
    key: { tonic: "A", mode: "minor" },
    expect: { staves: ["S1:bass"], voices: { S1: "A2:1 | D2:1 | E2:1 | A2:1" } },
  },
  {
    name: "228 an E minor bass walking down to E1: four ledger lines, F sharp 1 on its own",
    code: 'bass: note("<[40 38 36 35] [33 31 30 28]>")',
    bars: 2,
    key: { tonic: "E", mode: "minor" },
    expect: {
      staves: ["S1:bass"],
      voices: { S1: "E2:4 D2:4 C2:4 B1:4 | A1:4 G1:4 F#1:4 E1:4" },
      abc: ["K:Em clef=bass\n", "E,,,4 |]"],
      warnings: [],
    },
  },
  {
    name: "229 U08.L04 hook: the bass locked to the kick's 3+3+2 hits",
    code: `${T(96)}bass: n("<0 4 5 3>").struct("x ~ ~ x ~ ~ x ~").scale("C2:major").s("ebass")`,
    bars: 2,
    expect: {
      staves: ["S1:bass"],
      voices: { S1: "C2:8 r:8 r:8 C2:8 r:4 C2:8 r:8 | G2:8 r:8 r:8 G2:8 r:4 G2:8 r:8" },
    },
  },
  // --- form: section labels and double bars on lead sheets ---------------------------------------------------------
  {
    name: "230 U09.L02 exemplar: verse, chorus, verse, chorus as a lead sheet, a label and a double bar at each",
    code: `${T(100)}const melVerse = n("<[2 ~ 4 2] [0 ~ 2 ~] [3 ~ 5 3] [1 ~ ~ ~]>").scale("C4:major")\nconst melChorus = n("<[7 ~ 5 ~] [6 ~ 4 ~] [7 ~ 9 7] [7 ~ ~ ~]>").scale("C4:major")\nmel: arrange([4, melVerse], [4, melChorus], [4, melVerse], [4, melChorus]).s("piano")`,
    bars: 16,
    staff: "lead",
    chords: perBar(["C", "Am", "F", "G", "F", "G", "C", "C", "C", "Am", "F", "G", "F", "G", "C", "C"]),
    sections: marks([
      ["verse", 0],
      ["chorus", 4],
      ["verse", 8],
      ["chorus2", 12],
    ]),
    expect: {
      parts: ["Verse", "Chorus", "Verse", "Chorus 2"],
      abc: ["[P:Verse]", "z8 ||\n[P:Chorus]", "z8 ||\n[P:Chorus 2]", "%%partsfont Helvetica 13 bold"],
      barNumbers: [5, 9, 13],
    },
  },
  {
    name: "231 the exemplar's second page from bar 7: the chorus named again in parentheses, then the verse",
    code: `${T(100)}const melVerse = n("<[2 ~ 4 2] [0 ~ 2 ~] [3 ~ 5 3] [1 ~ ~ ~]>").scale("C4:major")\nconst melChorus = n("<[7 ~ 5 ~] [6 ~ 4 ~] [7 ~ 9 7] [7 ~ ~ ~]>").scale("C4:major")\nmel: arrange([4, melVerse], [4, melChorus], [4, melVerse], [4, melChorus]).s("piano")`,
    bars: 6,
    startBar: 6,
    endsPiece: false,
    staff: "lead",
    abcOptions: { barsPerLine: 2, finalBar: false, barNumbers: true },
    chords: perBar(["C", "Am", "F", "G", "F", "G", "C", "C", "C", "Am", "F", "G", "F", "G", "C", "C"]),
    sections: [
      { bar: 6, tag: "chorus", text: "(Chorus)", doubleBar: false },
      { bar: 8, tag: "verse", text: "Verse", doubleBar: true },
    ],
    expect: { parts: ["(Chorus)", "Verse"], barNumbers: [7, 9, 11] },
  },
  {
    name: "232 U09.L03 hook: A A B A, sections by letter",
    code: `${T(112)}const melA = n("<[4 ~ 2 4] [5 ~ 2 ~] [3 ~ 5 3] [1 ~ ~ ~]>").scale("C4:major")\nconst melB = n("<[5 ~ 5 7] [6 ~ 4 ~] [3 ~ 5 3] [4 ~ ~ ~]>").scale("C4:major")\nmel: arrange([4, melA], [4, melA], [4, melB], [4, melA]).s("piano")`,
    bars: 16,
    staff: "lead",
    chords: perBar(["C", "Am", "F", "G", "C", "Am", "F", "G", "F", "Em", "Dm", "G", "C", "Am", "F", "G"]),
    sections: marks([
      ["a", 0],
      ["a", 4],
      ["b", 8],
      ["a", 12],
    ]),
    expect: { parts: ["A", "A", "B", "A"] },
  },
  {
    name: "233 U09.L05 hook on the grand staff: intro and verse, the label over the top staff only, double bars on both",
    code: `${T(104)}const bassIntro = n("<0 5 3 4>").scale("C2:major").mask("<0 1 1 1>")\nconst bassVerse = n("<0 5 3 4>").scale("C2:major")\nconst melIntro = n("<~ ~ ~ [~ ~ 4 5]>").scale("C4:major")\nconst melVerse = n("<[7 ~ 4 2] [0 ~ 2 ~] [3 ~ 5 3] [4 ~ ~ ~]>").scale("C4:major")\nbass: arrange([4, bassIntro], [4, bassVerse]).s("ebass")\nmel: arrange([4, melIntro], [4, melVerse]).s("piano")`,
    bars: 8,
    staff: "grand",
    sections: marks([
      ["intro", 0],
      ["verse", 4],
    ]),
    expect: { staves: ["RH:treble", "LH:bass"], parts: ["Intro", "Verse"] },
  },
  {
    name: "234 a swung, sectioned lead sheet (a C3 flavour): exact, with Swing 8ths and both labels",
    code: `${T(108)}const melVerse = n("<[0 ~ 2 4 ~ 2 0 ~] [4 ~ ~ ~]>").scale("C4:major")\nconst melChorus = n("<[7 ~ 7 5 ~ 4 2 ~] [4 ~ ~ ~]>").scale("C4:major")\nmel: arrange([2, melVerse], [2, melChorus]).swingBy(1/3, 4).s("piano")`,
    bars: 4,
    staff: "lead",
    swing: SW8,
    chords: perBar(["C", "G", "F", "C"]),
    sections: marks([
      ["verse", 0],
      ["chorus", 2],
    ]),
    expect: {
      approximate: false,
      parts: ["Verse", "Chorus"],
      voices: {
        S1: "C4:8 r:8 E4:8 G4:8 r:8 E4:8 C4:8 r:8 | G4:4 r:4 r:2 | C5:8 r:8 C5:8 A4:8 r:8 G4:8 E4:8 r:8 | G4:4 r:4 r:2",
      },
      abc: ['Q:"Swing 8ths"\n'],
    },
  },
  {
    name: "235 a C minor ballad verse and chorus (a C4 shape): flats in the signature, B natural in the V chord's bar",
    code: `${T(76)}const melVerse = n("<[4 ~ 2 0] [5 ~ 4 ~] [2 ~ 0 ~] [0 ~ ~ ~]>").scale("C4:minor")\nconst melChorus = n("<[7 ~ 6 4] [5 ~ 4 2] [4 ~ 6 ~] [7 ~ ~ ~]>").scale("C4:harmonic:minor")\nmel: arrange([4, melVerse], [4, melChorus]).s("piano")`,
    bars: 8,
    staff: "lead",
    key: { tonic: "C", mode: "minor" },
    chords: perBar(["Cm", "Ab", "Eb", "Cm", "Cm", "Fm", "G", "Cm"]),
    sections: marks([
      ["verse", 0],
      ["chorus", 4],
    ]),
    expect: {
      parts: ["Verse", "Chorus"],
      voices: {
        S1: "G4:4 r:4 Eb4:4 C4:4 | Ab4:4 r:4 G4:4 r:4 | Eb4:4 r:4 C4:4 r:4 | C4:4 r:4 r:2 | C5:4 r:4 B4:4 G4:4 | Ab4:4 r:4 G4:4 Eb4:4 | G4:4 r:4 B4:4 r:4 | C5:4 r:4 r:2",
      },
      abc: ["K:Cm\n", "=B"],
    },
  },
  // --- c5: unisons, lens lines on a second voice ---------------------------------------------------------------
  {
    name: "236 c5: a chord tone in unison with the tune in the same rhythm is one notehead",
    code: 'mel: note("<63 70>")\nchords: note("<[63,66,70] [66,70,73]>")',
    bars: 2,
    key: { tonic: "Eb", mode: "minor" },
    expect: { voices: { S1: "[Eb4,Gb4,Bb4]:1 | [Gb4,Bb4,Db5]:1" }, warnings: [] },
  },
  {
    name: "237 c5: a tune over held chords with degrees and numerals: lines under both voices, numerals below",
    code: 'mel: note("<[e5 d5 c5 b4] [c5 ~ ~ ~]>")\nchords: note("<[c4,e4,g4] [c4,e4,g4]>")',
    bars: 2,
    key: { tonic: "C", mode: "major" },
    staff: "treble",
    annotations: { degree: true },
    romans: [
      { bar: 0, beat: 1, rn: "I" },
      { bar: 1, beat: 1, rn: "I" },
    ],
    expect: {
      voices: { S1: "E5:4 D5:4 C5:4 B4:4 | C5:4 r:4 r:2", S1v2: "[C4,E4,G4]:1 | [C4,E4,G4]:1" },
      abc: ["w:3 2 1 7 | 1\nw:~ ~ ~ ~ | ~\n", "w:1~3~5 | 1~3~5"],
      romanTexts: ["I", "I"],
    },
  },
  // --- more U08–U11 lesson material -------------------------------------------------------------------------------
  {
    name: "238 U10.L07 Andalusian bass: A1 G1 F1 E1 with fifths above, E1 on the fourth ledger line",
    code: `${T(100)}bass: note("<[a1 ~ a1 e2] [g1 ~ g1 d2] [f1 ~ f1 c2] [e1 ~ e1 b1]>").s("fingerbass")`,
    bars: 4,
    key: { tonic: "A", mode: "minor" },
    expect: {
      staves: ["S1:bass"],
      voices: { S1: "A1:4 r:4 A1:4 E2:4 | G1:4 r:4 G1:4 D2:4 | F1:4 r:4 F1:4 C2:4 | E1:4 r:4 E1:4 B1:4" },
    },
  },
  {
    name: "239 U10.L07 tune over Am G F E: G sharp only over the E chord",
    code: `${T(100)}mel: n("<[7 ~ 6 7] [6 ~ 8 6] [5 ~ 2 0] [1 ~ ~ ~]>").scale("A3:minor").s("piano")\nlead: note("<~ ~ ~ [~ ~ g#4 a4]>")`,
    bars: 4,
    key: { tonic: "A", mode: "minor" },
    staff: "lead",
    tracks: ["mel"],
    chords: perBar(["Am", "G", "F", "E"]),
    expect: { voices: { S1: "A4:4 r:4 G4:4 A4:4 | G4:4 r:4 B4:4 G4:4 | F4:4 r:4 C4:4 A3:4 | B3:4 r:4 r:2" } },
  },
  {
    name: "240 U11.L08 call and answer: the guitar's call, the organ's answer in bar 3, swung, both read in the blues",
    code: `${T(108)}keys: n("<~ ~ [~ 4 5 4 ~ 2 ~ ~] [1 ~ 0 ~]>").scale("C4:blues").swingBy(1/3, 4).s("organ")`,
    bars: 4,
    swing: SW8,
    expect: {
      key: { tonic: "C", mode: "blues" },
      voices: { S1: "r:1 | r:1 | r:8 G4:8 Bb4:8 G4:8 r:8 F4:8 r:4 | Eb4:4 r:4 C4:4 r:4" },
    },
  },
  {
    name: "241 U10.L05 bass: the Aeolian loop i VI III VII with a pick-up octave",
    code: `${T(96)}bass: n("[0 0 0 0 0 0 0 7]").add(n("<0 5 2 6>")).scale("A1:minor").s("fingerbass")`,
    bars: 4,
    expect: {
      key: { tonic: "A", mode: "minor" },
      staves: ["S1:bass"],
      voices: {
        S1: "A1:8 A1:8 A1:8 A1:8 A1:8 A1:8 A1:8 A2:8 | F2:8 F2:8 F2:8 F2:8 F2:8 F2:8 F2:8 F3:8 | C2:8 C2:8 C2:8 C2:8 C2:8 C2:8 C2:8 C3:8 | G2:8 G2:8 G2:8 G2:8 G2:8 G2:8 G2:8 G3:8",
      },
    },
  },
];
