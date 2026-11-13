// The golden corpus of @oak/notation: Strudel patterns with the notation a musician expects, stated
// by hand (note-list DSL: value 4 = quarter, `.` dot, `~` tie, `(p:q …)` tuplet, `|` bar line).
// Entries 01–10 are the ten patterns spike S4 required; the rest cover meters, ties, tuplets, swing,
// pickups, staves, keys, chromatic spelling, voicings and lead sheets; 132–181 (Wave 4) cover triads and
// inversions, chord symbols and Roman numerals, chords on the grand staff, lead sheets with pickups, key changes
// inside a bar and two keys on one staff, much of it the U05–U07 material of content/specs; 182– (Wave 5,
// corpus-w5.ts) cover minor keys, blues, swing, bass lines, sections and the U08–U11 material.
import { CORPUS_W5 } from "./corpus-w5.ts";
import type { CorpusEntry } from "./harness.ts";

export const CORPUS: CorpusEntry[] = [
  // --- the ten patterns of spike S4 ---------------------------------------------------------------
  {
    name: "01 four quarters",
    code: 'note("c4 d4 e4 f4")',
    bars: 1,
    expect: {
      voices: { S1: "C4:4 D4:4 E4:4 F4:4" },
      abc: ["!class=oak-e0!C4 !class=oak-e1!D4 !class=oak-e2!E4 !class=oak-e3!F4 |]"],
    },
  },
  {
    name: "02 eighth pair in a beat",
    code: 'note("c4 [d4 e4] f4 g4")',
    bars: 1,
    expect: { voices: { S1: "C4:4 D4:8 E4:8 F4:4 G4:4" }, abc: ["!class=oak-e1!D2!class=oak-e2!E2 "] },
  },
  {
    name: "03 dotted half + quarter",
    code: 'note("c4@3 d4")',
    bars: 1,
    expect: { voices: { S1: "C4:2. D4:4" } },
  },
  {
    name: "04 alternation over 2 bars",
    code: 'note("<c4 e4> g4")',
    bars: 2,
    expect: { voices: { S1: "C4:2 G4:2 | E4:2 G4:2" } },
  },
  { name: "05 rests", code: 'note("c4 ~ d4 ~")', bars: 1, expect: { voices: { S1: "C4:4 r:4 D4:4 r:4" } } },
  {
    name: "06 quarter triplet in half a bar",
    code: 'note("c4*3 e4")',
    bars: 1,
    expect: { voices: { S1: "(3:2 C4:4 C4:4 C4:4) E4:2" }, abc: ["(3:2:3!class=oak-e0!C4"] },
  },
  {
    name: "07 D major by scale",
    code: 'n("0 2 4 6").scale("D4:major")',
    bars: 1,
    expect: { voices: { S1: "D4:4 F#4:4 A4:4 C#5:4" }, key: { tonic: "D", mode: "major" }, abc: ["K:D\n"] },
  },
  {
    name: "08 chord stack",
    code: 'note("[c4,e4,g4] [f4,a4,c5]")',
    bars: 1,
    expect: {
      voices: { S1: "[C4,E4,G4]:2 [F4,A4,C5]:2" },
      abc: ["!class=oak-e0![CEG]8 !class=oak-e1![FAc]8"],
    },
  },
  {
    name: "09 syncopated tie",
    code: 'note("~ c4@1.5 d4@1.5")',
    bars: 1,
    expect: {
      voices: { S1: "r:4 C4:4~ C4:8 D4:8~ D4:4" },
      abc: ["z4 !class=oak-e0!C4- !class=oak-e0!C2!class=oak-e1!D2- !class=oak-e1!D4"],
    },
  },
  {
    name: "10 F# major scale",
    code: 'n("0 1 2 3 4 5 6 7").scale("F#4:major")',
    bars: 1,
    expect: {
      voices: { S1: "F#4:8 G#4:8 A#4:8 B4:8 C#5:8 D#5:8 E#5:8 F#5:8" },
      key: { tonic: "F#", mode: "major" },
      abc: [
        "K:F#\n",
        "!class=oak-e0!F2!class=oak-e1!G2 !class=oak-e2!A2!class=oak-e3!B2 !class=oak-e4!c2!class=oak-e5!d2 !class=oak-e6!e2!class=oak-e7!f2 |]",
      ],
    },
  },
  // --- ties, dots, beats ---------------------------------------------------------------------------
  {
    name: "11 cross-bar tie with bar-scoped accidentals",
    code: 'note("f#4@5 f#4 f4 f#4").slow(2)',
    bars: 2,
    expect: {
      voices: { S1: "F#4:1~ | F#4:4 F#4:4 F4:4 F#4:4" },
      abc: [
        "!class=oak-e0!^F16- | !class=oak-e0!F4 !class=oak-e1!^F4 !class=oak-e2!=F4 !class=oak-e3!^F4 |]",
      ],
    },
  },
  {
    name: "12 ties across the bar line and the half bar",
    code: 'note("c4@3 d4@2 e4@3").slow(2)',
    bars: 2,
    expect: { voices: { S1: "C4:2. D4:4~ | D4:4 E4:4~ E4:2" } },
  },
  {
    name: "13 syncopation: half note on beat 2",
    code: 'note("c4 d4@2 e4")',
    bars: 1,
    expect: { voices: { S1: "C4:4 D4:2 E4:4" } },
  },
  {
    name: "14 dotted quarter and eighth",
    code: 'note("c4@3 d4 e4@4")',
    bars: 1,
    expect: { voices: { S1: "C4:4. D4:8 E4:2" } },
  },
  {
    name: "15 sixteenths and a dotted eighth",
    code: 'note("c4 d4 e4 f4 g4@3 a4 b4@2 c5@2 ~@4")',
    bars: 1,
    expect: { voices: { S1: "C4:16 D4:16 E4:16 F4:16 G4:8. A4:16 B4:8 C5:8 r:4" } },
  },
  {
    name: "16 off-beat note tied over the beat",
    code: 'note("~ c4@2 ~@5")',
    bars: 1,
    expect: { voices: { S1: "r:8 C4:8~ C4:8 r:8 r:2" } },
  },
  {
    name: "17 long note across two bars",
    code: 'note("c4@7 d4").slow(2)',
    bars: 2,
    expect: { voices: { S1: "C4:1~ | C4:2. D4:4" } },
  },
  // --- tuplets -------------------------------------------------------------------------------------
  {
    name: "18 eighth triplets by beat",
    code: 'note("[c4 d4 e4] f4 [g4 a4 b4] c5")',
    bars: 1,
    expect: { voices: { S1: "(3:2 C4:8 D4:8 E4:8) F4:4 (3:2 G4:8 A4:8 B4:8) C5:4" } },
  },
  {
    name: "19 quintuplet in a beat",
    code: 'note("[c4 d4 e4 f4 g4] a4 b4 c5")',
    bars: 1,
    expect: { voices: { S1: "(5:4 C4:16 D4:16 E4:16 F4:16 G4:16) A4:4 B4:4 C5:4" }, abc: ["(5:4:5"] },
  },
  {
    name: "20 sextuplet beat as two sixteenth triplets",
    code: 'note("[c4 d4 e4 f4 g4 a4] c5 ~ c5")',
    bars: 1,
    expect: { voices: { S1: "(3:2 C4:16 D4:16 E4:16) (3:2 F4:16 G4:16 A4:16) C5:4 r:4 C5:4" } },
  },
  {
    name: "21 quarter triplets then a half",
    code: 'note("[c4 d4 e4] f4")',
    bars: 1,
    expect: { voices: { S1: "(3:2 C4:4 D4:4 E4:4) F4:2" } },
  },
  {
    name: "22 not notatable: 11 in a bar (approximate)",
    code: 'note("c4*11")',
    bars: 1,
    expect: { approximate: true, warnings: ["tuplet-too-long"] },
  },
  {
    name: "23 mixed tuplets: a triplet inside a quintuplet (approximate)",
    code: 'note("[c4 d4 e4] f4@4")',
    bars: 1,
    expect: { approximate: true, warnings: ["mixed-tuplets"] },
  },
  // --- meters --------------------------------------------------------------------------------------
  {
    name: "24 3/4 waltz",
    code: 'note("c4 e4 g4")',
    bars: 1,
    meter: "3/4",
    expect: { voices: { S1: "C4:4 E4:4 G4:4" }, abc: ["M:3/4"] },
  },
  {
    name: "25 3/4 dotted half then a half on beat 2",
    code: 'note("<c4 [e4 g4@2]>")',
    bars: 2,
    meter: "3/4",
    expect: { voices: { S1: "C4:2. | E4:4 G4:2" } },
  },
  {
    name: "26 6/8 eighths beamed in threes",
    code: 'note("c4 d4 e4 f4 g4 a4")',
    bars: 1,
    meter: "6/8",
    expect: {
      voices: { S1: "C4:8 D4:8 E4:8 F4:8 G4:8 A4:8" },
      abc: ["M:6/8", "!class=oak-e0!C2!class=oak-e1!D2!class=oak-e2!E2 !class=oak-e3!F2"],
    },
  },
  {
    name: "27 6/8 dotted quarters",
    code: 'note("c4 g4")',
    bars: 1,
    meter: "6/8",
    expect: { voices: { S1: "C4:4. G4:4." } },
  },
  {
    name: "28 6/8 quarter-eighth",
    code: 'note("[c4@2 d4] [e4@2 f4]")',
    bars: 1,
    meter: "6/8",
    expect: { voices: { S1: "C4:4 D4:8 E4:4 F4:8" } },
  },
  {
    name: "29 6/8 note tied over the beat",
    code: 'note("c4 d4@4 e4")',
    bars: 1,
    meter: "6/8",
    expect: { voices: { S1: "C4:8 D4:4~ D4:4 E4:8" } },
  },
  {
    name: "30 12/8 compound beats",
    code: 'note("[c4 d4 e4] [f4@2 g4] a4 [b4 a4 g4]")',
    bars: 1,
    meter: "12/8",
    expect: { voices: { S1: "C4:8 D4:8 E4:8 F4:4 G4:8 A4:4. B4:8 A4:8 G4:8" } },
  },
  {
    name: "31 7/8 grouped 2+2+3",
    code: 'note("c4 d4 e4 f4 g4 a4 b4")',
    bars: 1,
    meter: "7/8",
    expect: {
      voices: { S1: "C4:8 D4:8 E4:8 F4:8 G4:8 A4:8 B4:8" },
      abc: ["C2!class=oak-e1!D2 !class=oak-e2!E2!class=oak-e3!F2 !class=oak-e4!G2"],
    },
  },
  {
    name: "32 5/4 grouped 3+2",
    code: 'note("c4 d4@2 e4 f4")',
    bars: 1,
    meter: "5/4",
    expect: { voices: { S1: "C4:4 D4:2 E4:4 F4:4" } },
  },
  // --- swing and pickups ---------------------------------------------------------------------------
  {
    name: "33 swing 8ths straightened",
    code: 'note("c4 d4 e4 f4 g4 a4 b4 c5").swingBy(1/3, 4)',
    bars: 1,
    swing: { subdivision: 8, amount: 1 / 3 },
    expect: {
      voices: { S1: "C4:8 D4:8 E4:8 F4:8 G4:8 A4:8 B4:8 C5:8" },
      approximate: false,
      abc: ['Q:"Swing 8ths"\n'],
    },
  },
  {
    name: "34 swing 16ths on a hi-hat",
    code: 's("hh*16").swingBy(1/3, 8)',
    bars: 1,
    staff: "percussion",
    swing: { subdivision: 16, amount: 1 / 3 },
    expect: {
      voices: { DR: Array(16).fill("hh:16").join(" ") },
      approximate: false,
      abc: ['Q:"Swing 16ths"\n', "clef=perc"],
    },
  },
  {
    name: "35 pickup in 3/4 (one beat), last bar shortened",
    code: 'note("<[~ ~ g4] [c5 c5 d5] [e5@2 c5] [~ ~ ~]>")',
    bars: 4,
    meter: "3/4",
    pickup: { units: [1, 1] },
    expect: { voices: { S1: "G4:4 | C5:4 C5:4 D5:4 | E5:2 C5:4 | r:2" } },
  },
  {
    name: "36 pickup of two eighths in 4/4",
    code: 'note("<[~@3 [g4 a4]] [b4 c5 d5 e5] [c5@3 ~]>")',
    bars: 3,
    pickup: { units: [1, 1] },
    expect: { voices: { S1: "G4:8 A4:8 | B4:4 C5:4 D5:4 E5:4 | C5:2." } },
  },
  // --- staves ---------------------------------------------------------------------------------------
  {
    name: "37 grand staff by track",
    code: 'rh: note("e4 g4 c5 g4")\nlh: note("c3 g2")',
    bars: 1,
    staff: "grand",
    split: "track",
    expect: {
      voices: { RH: "E4:4 G4:4 C5:4 G4:4", LH: "C3:2 G2:2" },
      abc: ["%%score {RH LH}", "V:LH clef=bass"],
    },
  },
  {
    name: "38 grand staff split by register",
    code: 'note("[c3,c4,e4,g4] [g2,b3,d4,g4]")',
    bars: 1,
    staff: "grand",
    expect: { voices: { RH: "[C4,E4,G4]:2 [D4,G4]:2", LH: "C3:2 [G2,B3]:2" } },
  },
  {
    name: "39 bass clef chosen by register",
    code: 'note("c2 e2 g2 c3")',
    bars: 1,
    expect: { voices: { S1: "C2:4 E2:4 G2:4 C3:4" }, staves: ["S1:bass"], abc: ["K:C clef=bass"] },
  },
  {
    name: "40 two voices on one staff",
    code: 'note("[c5@3 b4, e4@2 g4@2]")',
    bars: 1,
    staff: "treble",
    expect: { voices: { S1: "C5:2. B4:4", S1v2: "E4:2 G4:2" }, abc: ["%%score (S1 S1v2)", "stem=down"] },
  },
  {
    name: "41 drum staff: hands up, kick down",
    code: 's("bd hh sd hh")',
    bars: 1,
    staff: "percussion",
    expect: { voices: { DR: "r:4 hh:4 sd:4 hh:4", DRv2: "bd:4 r:4 r:2" }, abc: ["!style=x!"] },
  },
  {
    name: "42 drum staff: hi-hat eighths with snare chord",
    code: 's("hh*8, bd sd")',
    bars: 1,
    staff: "percussion",
    expect: {
      voices: { DR: "hh:8 hh:8 hh:8 hh:8 [sd,hh]:8 hh:8 hh:8 hh:8", DRv2: "bd:2 r:2" },
      abc: ["[c!style=x!g]2"],
    },
  },
  {
    name: "43 rhythm staff with counts",
    code: 's("bd [~ bd] sd [bd bd]")',
    bars: 1,
    staff: "rhythm",
    labels: "counts",
    expect: {
      voices: { S1: "rhythm:4 r:8 rhythm:8 rhythm:4 rhythm:8 rhythm:8" },
      abc: ["stafflines=1", "w:1 & 3 4 &"],
    },
  },
  {
    name: "44 drums and melody together (auto)",
    code: 'mel: note("c5 b4 g4 e4")\ndr: s("bd sd bd sd")',
    bars: 1,
    expect: { staves: ["S1:treble", "DR:perc"], voices: { S1: "C5:4 B4:4 G4:4 E4:4" } },
  },
  // --- keys and spelling ----------------------------------------------------------------------------
  {
    name: "45 sharp key: E major",
    code: 'n("0 1 2 3 4 5 6 7").scale("E4:major")',
    bars: 1,
    expect: {
      voices: { S1: "E4:8 F#4:8 G#4:8 A4:8 B4:8 C#5:8 D#5:8 E5:8" },
      abc: ["K:E\n", "!class=oak-e1!F2 !class=oak-e2!G2"],
    },
  },
  {
    name: "46 flat key: E-flat major",
    code: 'n("0 2 4 6 7 4 2 0").scale("Eb4:major")',
    bars: 1,
    expect: { voices: { S1: "Eb4:8 G4:8 Bb4:8 D5:8 Eb5:8 Bb4:8 G4:8 Eb4:8" }, abc: ["K:Eb\n"] },
  },
  {
    name: "47 flat key: B-flat major below middle C",
    code: 'n("0 1 2 3").scale("Bb3:major")',
    bars: 1,
    expect: { voices: { S1: "Bb3:4 C4:4 D4:4 Eb4:4" }, key: { tonic: "Bb", mode: "major" } },
  },
  {
    name: "48 A harmonic minor: raised 7th as an accidental",
    code: 'n("0 1 2 3 4 5 6 7").scale("A3:harmonic:minor")',
    bars: 1,
    expect: {
      voices: { S1: "A3:8 B3:8 C4:8 D4:8 E4:8 F4:8 G#4:8 A4:8" },
      key: { tonic: "A", mode: "harmonic minor" },
      abc: ["K:Am\n", "^G2"],
    },
  },
  {
    name: "49 C harmonic minor: B natural against the key signature",
    code: 'n("4 6 7 ~").scale("C4:harmonic:minor")',
    bars: 1,
    expect: { voices: { S1: "G4:4 B4:4 C5:4 r:4" }, abc: ["K:Cm\n", "=B4"] },
  },
  {
    name: "50 F# harmonic minor: E sharp, never F",
    code: 'n("4 5 6 7").scale("F#4:harmonic:minor")',
    bars: 1,
    expect: { voices: { S1: "C#5:4 D5:4 E#5:4 F#5:4" }, abc: ["K:F#m\n", "^e4"] },
  },
  {
    name: "51 D minor with B flat in the signature",
    code: 'n("0 2 4 5 4 2 1 0").scale("D4:minor")',
    bars: 1,
    expect: { voices: { S1: "D4:8 F4:8 A4:8 Bb4:8 A4:8 F4:8 E4:8 D4:8" }, abc: ["K:Dm\n"] },
  },
  {
    name: "52 chromatic degrees b3, #4, b7 in C",
    code: 'n("0 2b 3# 6b").scale("C4:major")',
    bars: 1,
    expect: { voices: { S1: "C4:4 Eb4:4 F#4:4 Bb4:4" }, abc: ["_E4", "^F4", "_B4"] },
  },
  {
    name: "53 bar-scoped natural in D major",
    code: 'n("2 2b 2 0").scale("D4:major")',
    bars: 1,
    expect: {
      voices: { S1: "F#4:4 F4:4 F#4:4 D4:4" },
      abc: ["!class=oak-e0!F4 !class=oak-e1!=F4 !class=oak-e2!^F4 !class=oak-e3!D4"],
    },
  },
  {
    name: "54 key estimated from the notes (G major)",
    code: 'note("g4 a4 b4 c5 d5 e5 f#5 g5")',
    bars: 1,
    expect: { key: { tonic: "G", mode: "major" }, abc: ["K:G\n", "!class=oak-e6!f2"] },
  },
  {
    name: "55 chromatic passing tone spelled by direction",
    code: 'note("c4 c#4 d4 ~ e4 eb4 d4 ~")',
    bars: 1,
    expect: { voices: { S1: "C4:8 C#4:8 D4:8 r:8 E4:8 Eb4:8 D4:8 r:8" } },
  },
  {
    name: "56 voicing() chords in A major spelled from the symbol",
    code: 'chord("<A E>").voicing()',
    bars: 2,
    key: { tonic: "A", mode: "major" },
    chordByBar: ["A", "E"],
    staff: "grand",
    expect: { voices: { RH: "[C#4,E4,A4]:1 | [E4,G#4,B4]:1" } },
  },
  {
    name: "57 voicing() in B major: D sharp and A sharp",
    code: 'chord("<B F#>").voicing()',
    bars: 2,
    key: { tonic: "B", mode: "major" },
    chordByBar: ["B", "F#"],
    staff: "grand",
    expect: {
      voices: { RH: "[D#4,F#4,B4]:1 | [C#4,F#4,A#4]:1", LH: "[D#3,B3]:1 | F#3:1" },
      abc: ["K:B\n", "[DFB]16 | !class=oak-e1![CFA]16"],
    },
  },
  // --- lead sheets and lyrics -----------------------------------------------------------------------
  {
    name: "58 lead sheet with chord symbols",
    code: 'note("<[e4 d4 c4 d4] [e4 e4 e4@2]>")',
    bars: 2,
    staff: "lead",
    key: { tonic: "C", mode: "major" },
    chords: [
      { bar: 0, beat: 1, symbol: "C" },
      { bar: 0, beat: 3, symbol: "Am7" },
      { bar: 1, beat: 1, symbol: "Dm7" },
      { bar: 1, beat: 3, symbol: "G7" },
    ],
    expect: {
      voices: { S1: "E4:4 D4:4 C4:4 D4:4 | E4:4 E4:4 E4:2" },
      abc: ['"C"', '"Am7"', '"Dm7"', '"G7"'],
    },
  },
  {
    name: "59 lead sheet from a chord track: display translation",
    code: 'mel: note("<b4 g#4 a4 c5>")\nch: chord("<Bm7b5 E7 A^7 Co7>").voicing()',
    bars: 4,
    staff: "lead",
    key: { tonic: "A", mode: "minor" },
    chordByBar: ["Bm7b5", "E7", "A^7", "Co7"],
    chordTracks: ["ch"],
    expect: { voices: { S1: "B4:1 | G#4:1 | A4:1 | C5:1" }, chordTexts: ["Bm7♭5", "E7", "Amaj7", "C°7"] },
  },
  {
    name: "60 chord symbol in the middle of a long note splits it",
    code: 'note("c4@4")',
    bars: 1,
    staff: "lead",
    chords: [
      { bar: 0, beat: 1, symbol: "C" },
      { bar: 0, beat: 3, symbol: "F" },
    ],
    expect: { voices: { S1: "C4:2~ C4:2" }, abc: ['"F"!class=oak-e0!C8'] },
  },
  {
    name: "61 degree lyrics in G major",
    code: 'n("0 1 2 3 4 3 2 0").scale("G4:major")',
    bars: 1,
    labels: "degree",
    expect: { abc: ["w:1 2 3 4 5 4 3 1"] },
  },
  {
    name: "62 solfege in A minor (do-based minor)",
    code: 'n("0 2 4 7").scale("A3:minor")',
    bars: 1,
    labels: "solfege",
    expect: { abc: ["w:do me sol do"] },
  },
  {
    name: "63 nested triplet inside a bar-wide triplet",
    code: 'note("[c4 [d4 d4] e4] f4 g4")',
    bars: 1,
    expect: { approximate: false },
  },
  // --- Wave 3: clefs, per-track clefs and the grand staff ------------------------------------------------
  {
    name: "64 bass clef by request for a bass line",
    code: 'bass: note("c2 g2 c3 g2")',
    bars: 1,
    staff: "bass",
    expect: { voices: { S1: "C2:4 G2:4 C3:4 G2:4" }, staves: ["S1:bass"], abc: ["K:C clef=bass"] },
  },
  {
    name: "65 auto: a track named bass reads in the bass clef even when it climbs",
    code: 'bass: note("a2 e3 a3 f#4")',
    bars: 1,
    expect: { voices: { S1: "A2:4 E3:4 A3:4 F#4:4" }, staves: ["S1:bass"], abc: ["clef=bass"] },
  },
  {
    name: "66 auto: melody and bass tracks on a grand staff, each track whole on its staff",
    code: 'mel: note("c4 b3 c4 d4")\nbass: note("c3 g2 c3 g2")',
    bars: 1,
    expect: {
      staves: ["RH:treble", "LH:bass"],
      voices: { RH: "C4:4 B3:4 C4:4 D4:4", LH: "C3:4 G2:4 C3:4 G2:4" },
      abc: ["%%score {RH LH}"],
    },
  },
  {
    name: "67 per-track clef: a track sent to the bass staff reads with ledger lines above it",
    code: 'a: note("g4 a4 b4 c5")\nb: note("c4 e4 g4 c5")',
    bars: 1,
    staff: "grand",
    trackClefs: { b: "bass" },
    expect: { voices: { RH: "G4:4 A4:4 B4:4 C5:4", LH: "C4:4 E4:4 G4:4 C5:4" } },
  },
  {
    name: "68 grand staff split at E4 (splitMidi 64)",
    code: 'note("c4 d4 e4 f4")',
    bars: 1,
    staff: "grand",
    splitMidi: 64,
    expect: { voices: { RH: "r:2 E4:4 F4:4", LH: "C4:4 D4:4 r:2" } },
  },
  {
    name: "69 grand staff: one line crossing middle C changes staff by register",
    code: 'note("e4 c4 a3 c4")',
    bars: 1,
    staff: "grand",
    expect: { voices: { RH: "E4:4 C4:4 r:4 C4:4", LH: "r:2 A3:4 r:4" } },
  },
  {
    name: "70 percussion staff with rests",
    code: 's("hh ~ sd ~")',
    bars: 1,
    staff: "percussion",
    expect: { voices: { DR: "hh:4 r:4 sd:4 r:4" }, abc: ["clef=perc"] },
  },
  // --- Wave 3: every key signature (15 major, their relative minors) -------------------------------------
  {
    name: "71 C major: no signature",
    code: 'n("0 1 2 3 4 5 6 7").scale("C4:major")',
    bars: 1,
    expect: { voices: { S1: "C4:8 D4:8 E4:8 F4:8 G4:8 A4:8 B4:8 C5:8" }, abc: ["K:C\n"] },
  },
  {
    name: "72 G major: one sharp, F written plain",
    code: 'n("0 1 2 3 4 5 6 7").scale("G3:major")',
    bars: 1,
    expect: {
      voices: { S1: "G3:8 A3:8 B3:8 C4:8 D4:8 E4:8 F#4:8 G4:8" },
      abc: ["K:G\n", "!class=oak-e6!F2"],
    },
  },
  {
    name: "73 A major: three sharps",
    code: 'n("0 1 2 3 4 5 6 7").scale("A3:major")',
    bars: 1,
    expect: { voices: { S1: "A3:8 B3:8 C#4:8 D4:8 E4:8 F#4:8 G#4:8 A4:8" }, abc: ["K:A\n"] },
  },
  {
    name: "74 B major: five sharps",
    code: 'n("0 1 2 3 4 5 6 7").scale("B3:major")',
    bars: 1,
    expect: { voices: { S1: "B3:8 C#4:8 D#4:8 E4:8 F#4:8 G#4:8 A#4:8 B4:8" }, abc: ["K:B\n"] },
  },
  {
    name: "75 C sharp major: seven sharps, B sharp",
    code: 'n("0 1 2 3 4 5 6 7").scale("C#4:major")',
    bars: 1,
    expect: { voices: { S1: "C#4:8 D#4:8 E#4:8 F#4:8 G#4:8 A#4:8 B#4:8 C#5:8" }, abc: ["K:C#\n"] },
  },
  {
    name: "76 F major: one flat",
    code: 'n("0 1 2 3 4 5 6 7").scale("F4:major")',
    bars: 1,
    expect: {
      voices: { S1: "F4:8 G4:8 A4:8 Bb4:8 C5:8 D5:8 E5:8 F5:8" },
      abc: ["K:F\n", "!class=oak-e3!B2"],
    },
  },
  {
    name: "77 A flat major: four flats",
    code: 'n("0 1 2 3 4 5 6 7").scale("Ab3:major")',
    bars: 1,
    expect: { voices: { S1: "Ab3:8 Bb3:8 C4:8 Db4:8 Eb4:8 F4:8 G4:8 Ab4:8" }, abc: ["K:Ab\n"] },
  },
  {
    name: "78 D flat major: five flats",
    code: 'n("0 1 2 3 4 5 6 7").scale("Db4:major")',
    bars: 1,
    expect: { voices: { S1: "Db4:8 Eb4:8 F4:8 Gb4:8 Ab4:8 Bb4:8 C5:8 Db5:8" }, abc: ["K:Db\n"] },
  },
  {
    name: "79 G flat major: six flats, C flat",
    code: 'n("0 1 2 3 4 5 6 7").scale("Gb3:major")',
    bars: 1,
    expect: { voices: { S1: "Gb3:8 Ab3:8 Bb3:8 Cb4:8 Db4:8 Eb4:8 F4:8 Gb4:8" }, abc: ["K:Gb\n"] },
  },
  {
    name: "80 C flat major: seven flats, F flat",
    code: 'n("0 1 2 3 4 5 6 7").scale("Cb4:major")',
    bars: 1,
    expect: { voices: { S1: "Cb4:8 Db4:8 Eb4:8 Fb4:8 Gb4:8 Ab4:8 Bb4:8 Cb5:8" }, abc: ["K:Cb\n"] },
  },
  {
    name: "81 E minor: one sharp",
    code: 'n("0 1 2 3 4 5 6 7").scale("E4:minor")',
    bars: 1,
    expect: { voices: { S1: "E4:8 F#4:8 G4:8 A4:8 B4:8 C5:8 D5:8 E5:8" }, abc: ["K:Em\n"] },
  },
  {
    name: "82 B minor: two sharps",
    code: 'n("0 1 2 3 4 5 6 7").scale("B3:minor")',
    bars: 1,
    expect: { voices: { S1: "B3:8 C#4:8 D4:8 E4:8 F#4:8 G4:8 A4:8 B4:8" }, abc: ["K:Bm\n"] },
  },
  {
    name: "83 C sharp minor: four sharps",
    code: 'n("0 1 2 3 4 5 6 7").scale("C#4:minor")',
    bars: 1,
    expect: { voices: { S1: "C#4:8 D#4:8 E4:8 F#4:8 G#4:8 A4:8 B4:8 C#5:8" }, abc: ["K:C#m\n"] },
  },
  {
    name: "84 G minor: two flats",
    code: 'n("0 1 2 3 4 5 6 7").scale("G3:minor")',
    bars: 1,
    expect: { voices: { S1: "G3:8 A3:8 Bb3:8 C4:8 D4:8 Eb4:8 F4:8 G4:8" }, abc: ["K:Gm\n"] },
  },
  {
    name: "85 F minor: four flats",
    code: 'n("0 1 2 3 4 5 6 7").scale("F3:minor")',
    bars: 1,
    expect: { voices: { S1: "F3:8 G3:8 Ab3:8 Bb3:8 C4:8 Db4:8 Eb4:8 F4:8" }, abc: ["K:Fm\n"] },
  },
  {
    name: "86 B flat minor: five flats",
    code: 'n("0 1 2 3 4 5 6 7").scale("Bb3:minor")',
    bars: 1,
    expect: { voices: { S1: "Bb3:8 C4:8 Db4:8 Eb4:8 F4:8 Gb4:8 Ab4:8 Bb4:8" }, abc: ["K:Bbm\n"] },
  },
  {
    name: "87 E flat minor in the bass clef: six flats, C flat",
    code: 'n("0 1 2 3 4 5 6 7").scale("Eb2:minor")',
    bars: 1,
    staff: "bass",
    expect: {
      voices: { S1: "Eb2:8 F2:8 Gb2:8 Ab2:8 Bb2:8 Cb3:8 Db3:8 Eb3:8" },
      abc: ["K:Ebm clef=bass\n"],
    },
  },
  {
    name: "88 A flat minor: seven flats",
    code: 'n("0 1 2 3 4 5 6 7").scale("Ab3:minor")',
    bars: 1,
    expect: { voices: { S1: "Ab3:8 Bb3:8 Cb4:8 Db4:8 Eb4:8 Fb4:8 Gb4:8 Ab4:8" }, abc: ["K:Abm\n"] },
  },
  {
    name: "89 G sharp minor: five sharps",
    code: 'n("0 1 2 3 4 5 6 7").scale("G#3:minor")',
    bars: 1,
    expect: { voices: { S1: "G#3:8 A#3:8 B3:8 C#4:8 D#4:8 E4:8 F#4:8 G#4:8" }, abc: ["K:G#m\n"] },
  },
  {
    name: "90 D sharp minor: six sharps, E sharp",
    code: 'n("0 1 2 3 4 5 6 7").scale("D#4:minor")',
    bars: 1,
    expect: { voices: { S1: "D#4:8 E#4:8 F#4:8 G#4:8 A#4:8 B4:8 C#5:8 D#5:8" }, abc: ["K:D#m\n"] },
  },
  {
    name: "91 A sharp minor: seven sharps, B sharp",
    code: 'n("0 1 2 3 4 5 6 7").scale("A#3:minor")',
    bars: 1,
    expect: { voices: { S1: "A#3:8 B#3:8 C#4:8 D#4:8 E#4:8 F#4:8 G#4:8 A#4:8" }, abc: ["K:A#m\n"] },
  },
  // --- Wave 3: accidentals, naturals and courtesy accidentals --------------------------------------------
  {
    name: "92 courtesy sharp in the bar after a natural (D major)",
    code: 'note("<[f4 f4 a4 d4] [f#4 a4 d5 a4]>")',
    bars: 2,
    key: { tonic: "D", mode: "major" },
    expect: {
      voices: { S1: "F4:4 F4:4 A4:4 D4:4 | F#4:4 A4:4 D5:4 A4:4" },
      abc: ["!class=oak-e0!=F4 !class=oak-e1!F4", "| !class=oak-e4!^F4"],
    },
  },
  {
    name: "93 courtesy natural for the same letter in another octave (C major)",
    code: 'note("f#4 f5 f4 f#5")',
    bars: 1,
    key: { tonic: "C", mode: "major" },
    expect: {
      voices: { S1: "F#4:4 F5:4 F4:4 F#5:4" },
      abc: ["!class=oak-e0!^F4 !class=oak-e1!=f4 !class=oak-e2!=F4 !class=oak-e3!^f4"],
    },
  },
  {
    name: "94 double sharp and double flat",
    code: 'note("f##4 g4 bbb4 a4")',
    bars: 1,
    key: { tonic: "C", mode: "major" },
    expect: { voices: { S1: "F##4:4 G4:4 Bbb4:4 A4:4" }, abc: ["^^F4", "__B4"] },
  },
  {
    name: "95 a natural cancels the signature for one bar only (B flat major)",
    code: 'note("<[b4 bb4 b4 c5] [b4 bb4 a4 bb4]>")',
    bars: 2,
    key: { tonic: "Bb", mode: "major" },
    expect: {
      voices: { S1: "B4:4 Bb4:4 B4:4 C5:4 | B4:4 Bb4:4 A4:4 Bb4:4" },
      abc: [
        "!class=oak-e0!=B4 !class=oak-e1!_B4 !class=oak-e2!=B4 !class=oak-e3!c4 | !class=oak-e4!=B4 !class=oak-e5!_B4 !class=oak-e6!A4 !class=oak-e7!B4 |]",
      ],
    },
  },
  {
    name: "96 an accidental holds through its bar in its own octave",
    code: 'note("c#5 c#5 c#4 c5")',
    bars: 1,
    key: { tonic: "C", mode: "major" },
    expect: {
      voices: { S1: "C#5:4 C#5:4 C#4:4 C5:4" },
      abc: ["!class=oak-e0!^c4 !class=oak-e1!c4 !class=oak-e2!^C4 !class=oak-e3!=c4"],
    },
  },
  // --- Wave 3: ledger lines -------------------------------------------------------------------------------
  {
    name: "97 ledger lines above the treble staff",
    code: 'note("a5 c6 e6 c6")',
    bars: 1,
    staff: "treble",
    expect: { voices: { S1: "A5:4 C6:4 E6:4 C6:4" }, abc: ["a4 !class=oak-e1!c'4 !class=oak-e2!e'4"] },
  },
  {
    name: "98 ledger lines below the treble staff",
    code: 'note("c4 a3 f3 g3")',
    bars: 1,
    staff: "treble",
    expect: { voices: { S1: "C4:4 A3:4 F3:4 G3:4" }, abc: ["C4 !class=oak-e1!A,4 !class=oak-e2!F,4"] },
  },
  {
    name: "99 ledger lines below the bass staff",
    code: 'note("e2 c2 a1 c2")',
    bars: 1,
    staff: "bass",
    expect: { voices: { S1: "E2:4 C2:4 A1:4 C2:4" }, abc: ["!class=oak-e2!A,,,4"] },
  },
  {
    name: "100 ledger lines above the bass staff: middle C and up",
    code: 'note("c4 d4 e4 c4")',
    bars: 1,
    staff: "bass",
    expect: { voices: { S1: "C4:4 D4:4 E4:4 C4:4" }, abc: ["K:C clef=bass", "!class=oak-e0!C4"] },
  },
  {
    name: "101 far above the bass staff: an out-of-range warning",
    code: 'note("c6 c3")',
    bars: 1,
    staff: "bass",
    expect: { voices: { S1: "C6:2 C3:2" }, warnings: ["out-of-range"] },
  },
  // --- Wave 3: rests in 3/4 and 4/4 -----------------------------------------------------------------------
  {
    name: "102 3/4 with rests and a dotted half",
    code: 'note("<[c4 ~ e4] [~ g4@2] [c5@3]>")',
    bars: 3,
    meter: "3/4",
    expect: { voices: { S1: "C4:4 r:4 E4:4 | r:4 G4:2 | C5:2." } },
  },
  {
    name: "103 4/4 with a whole-bar rest between phrases",
    code: 'note("<[c4 e4 g4 c5] ~ [g4@4]>")',
    bars: 3,
    expect: { voices: { S1: "C4:4 E4:4 G4:4 C5:4 | r:1 | G4:1" } },
  },
  {
    name: "104 3/4 eighth rests on the off-beats",
    code: 'note("[c4 ~] [d4 ~] [e4 ~]")',
    bars: 1,
    meter: "3/4",
    expect: { voices: { S1: "C4:8 r:8 D4:8 r:8 E4:8 r:8" } },
  },
  {
    name: "105 3/4 waltz bass in the bass clef with a rest",
    code: 'note("<[c3 ~ g2] [e3@2 ~]>")',
    bars: 2,
    meter: "3/4",
    staff: "bass",
    expect: { voices: { S1: "C3:4 r:4 G2:4 | E3:2 r:4" } },
  },
  // --- Wave 3: annotations (degree, solfège, name) ----------------------------------------------------------
  {
    name: "106 annotations under the notes: degree, solfège and name in D major",
    code: 'n("0 2 4 7").scale("D4:major")',
    bars: 1,
    annotations: { degree: true, solfege: true, noteName: true },
    expect: {
      voices: { S1: "D4:4 F#4:4 A4:4 D5:4" },
      abc: ["%%vocalfont Helvetica 12", "w:1 3 5 1\nw:do mi sol do\nw:D4 F♯4 A4 D5"],
    },
  },
  {
    name: "107 annotations over the notes in A minor: do-based minor",
    code: 'n("0 2 4 6").scale("A3:minor")',
    bars: 1,
    annotations: { degree: true, solfege: true, position: "above" },
    expect: {
      voices: { S1: "A3:4 C4:4 E4:4 G4:4" },
      abc: ['"^1""^do"!class=oak-e0!A,4', '"^♭3""^me"', '"^♭7""^te"!class=oak-e3!G4'],
    },
  },
  {
    name: "108 annotations on a grand staff: each staff its own line",
    code: 'mel: note("e4 g4 c5 g4")\nbass: note("c3 g2 c3 g2")',
    bars: 1,
    key: { tonic: "C", mode: "major" },
    staff: "grand",
    annotations: { degree: true },
    expect: {
      voices: { RH: "E4:4 G4:4 C5:4 G4:4", LH: "C3:4 G2:4 C3:4 G2:4" },
      abc: ["G4 |]\nw:3 5 1 5\n", "G,,4 |]\nw:1 5 1 5\n"],
    },
  },
  {
    name: "109 annotations: a chord is one syllable, a tied continuation takes *",
    code: 'note("[c4,e4,g4]@5 [b3,d4,f4,g4]@3").slow(2)',
    bars: 2,
    key: { tonic: "C", mode: "major" },
    annotations: { degree: true },
    expect: { abc: ["w:1~3~5 | * 7~2~4~5"] },
  },
  {
    name: "110 annotations follow the spelling: ♯4 rising, ♭7 falling",
    code: 'note("c4 d4 f#4 g4 bb4 a4 g4 c4")',
    bars: 1,
    key: { tonic: "C", mode: "major" },
    annotations: { degree: true, solfege: true },
    expect: {
      voices: { S1: "C4:8 D4:8 F#4:8 G4:8 Bb4:8 A4:8 G4:8 C4:8" },
      abc: ["w:1 2 ♯4 5 ♭7 6 5 1\nw:do re fi sol te la sol do"],
    },
  },
  {
    name: "111 a theoretical key: G sharp major written with an explicit signature",
    code: 'n("0 1 2 3").scale("G#4:major")',
    bars: 1,
    expect: {
      voices: { S1: "G#4:4 A#4:4 B#4:4 C#5:4" },
      key: { tonic: "G#", mode: "major" },
      warnings: ["abcjs-limit"],
      abc: [
        "K:C exp ^^f ^c ^g ^d ^a ^e ^b\n",
        "!class=oak-e0!G4 !class=oak-e1!A4 !class=oak-e2!B4 !class=oak-e3!c4",
      ],
    },
  },
  // --- Wave 3: U03–U04 lesson material (content/specs/U03.md, U04.md) ----------------------------------------
  {
    name: "112 U03.L09 Ode to Joy bars 1–4, degrees in C, degree lines",
    code: 'n("<[2 2 3 4] [4 3 2 1] [0 0 1 2] [2 1 1@2]>").scale("C4:major")',
    bars: 4,
    annotations: { degree: true },
    expect: {
      voices: { S1: "E4:4 E4:4 F4:4 G4:4 | G4:4 F4:4 E4:4 D4:4 | C4:4 C4:4 D4:4 E4:4 | E4:4 D4:4 D4:2" },
      abc: ["w:3 3 4 5 | 5 4 3 2 | 1 1 2 3 | 3 2 2"],
    },
  },
  {
    name: "113 U03.L09 When the Saints in F, the source key",
    code: 'note("<[~ f4 a4 bb4] [c5@4] [~ f4 a4 bb4] [c5@4]>")',
    bars: 4,
    key: { tonic: "F", mode: "major" },
    expect: {
      voices: { S1: "r:4 F4:4 A4:4 Bb4:4 | C5:1 | r:4 F4:4 A4:4 Bb4:4 | C5:1" },
      abc: ["K:F\n", "!class=oak-e2!B4 |"],
    },
  },
  {
    name: "114 U03.L09 When the Saints as degrees in C, the same shape",
    code: 'n("<[~ 0 2 3] [4@4] [~ 0 2 3] [4@4]>").scale("C4:major")',
    bars: 4,
    expect: { voices: { S1: "r:4 C4:4 E4:4 F4:4 | G4:1 | r:4 C4:4 E4:4 F4:4 | G4:1" } },
  },
  {
    name: "115 U03.L10 Swing Low in F, plain rhythm",
    code: 'note("<[a4@2 f4@2] [a4@2 f4 d4] [c4@4] ~>")',
    bars: 4,
    key: { tonic: "F", mode: "major" },
    expect: { voices: { S1: "A4:2 F4:2 | A4:2 F4:4 D4:4 | C4:1 | r:1" } },
  },
  {
    name: "116 U03.L10 Swing Low as degrees in C, below home, with degree lines",
    code: 'n("<[2@2 0@2] [2@2 0 -2] [-3@4] ~>").scale("C4:major")',
    bars: 4,
    annotations: { degree: true },
    expect: {
      voices: { S1: "E4:2 C4:2 | E4:2 C4:4 A3:4 | G3:1 | r:1" },
      abc: ["w:3 1 | 3 1 6 | 5 | "],
    },
  },
  {
    name: "117 U03.L10 Auld Lang Syne in F, plain rhythm",
    code: 'note("<[f4 f4 f4 a4] [g4 f4 g4 a4] [f4 f4 a4 c5] [d5@4]>")',
    bars: 4,
    key: { tonic: "F", mode: "major" },
    expect: {
      voices: { S1: "F4:4 F4:4 F4:4 A4:4 | G4:4 F4:4 G4:4 A4:4 | F4:4 F4:4 A4:4 C5:4 | D5:1" },
    },
  },
  {
    name: "118 U03.L10 Michael, Row the Boat Ashore in C",
    code: 'note("<[e4 g4 e4 g4] [a4 g4@2 ~] [~ e4 g4 a4] [g4@4]>")',
    bars: 4,
    expect: { voices: { S1: "E4:4 G4:4 E4:4 G4:4 | A4:4 G4:2 r:4 | r:4 E4:4 G4:4 A4:4 | G4:1" } },
  },
  {
    name: "119 U03.L06 play from the page: a G major tune, F sharp from the signature",
    code: 'n("<[0 1 2 0] [4 6 7@2]>").scale("G4:major")',
    bars: 2,
    expect: {
      voices: { S1: "G4:4 A4:4 B4:4 G4:4 | D5:4 F#5:4 G5:2" },
      abc: ["K:G\n", "!class=oak-e5!f4 !class=oak-e6!g8"],
    },
  },
  {
    name: "120 U03.L06 D major: F sharp and C sharp held by the signature",
    code: 'note("d4 f#4 a4 c#5")',
    bars: 1,
    key: { tonic: "D", mode: "major" },
    expect: {
      voices: { S1: "D4:4 F#4:4 A4:4 C#5:4" },
      abc: ["K:D\n!class=oak-e0!D4 !class=oak-e1!F4 !class=oak-e2!A4 !class=oak-e3!c4 |]"],
    },
  },
  {
    name: "121 U03.L07 B flat major: B flat and E flat held by the signature",
    code: 'note("bb3 eb4 f4 bb4")',
    bars: 1,
    key: { tonic: "Bb", mode: "major" },
    expect: { voices: { S1: "Bb3:4 Eb4:4 F4:4 Bb4:4" }, abc: ["K:Bb\n!class=oak-e0!B,4 !class=oak-e1!E4"] },
  },
  {
    name: "122 U03.CP E flat major arpeggio in the bass clef",
    code: 'n("0 2 4 7").scale("Eb3:major")',
    bars: 1,
    staff: "bass",
    expect: { voices: { S1: "Eb3:4 G3:4 Bb3:4 Eb4:4" }, abc: ["K:Eb clef=bass\n"] },
  },
  {
    name: "123 U03.CP D major degree item: 1 5 3 1",
    code: 'n("0 4 2 7").scale("D4:major")',
    bars: 1,
    annotations: { degree: true },
    expect: { voices: { S1: "D4:4 A4:4 F#4:4 D5:4" }, abc: ["w:1 5 3 1"] },
  },
  {
    name: "124 U03.L08 solfège in F with a chromatic te",
    code: 'n("0 4 6b 5").scale("F4:major")',
    bars: 1,
    annotations: { degree: true, solfege: true },
    expect: {
      voices: { S1: "F4:4 C5:4 Eb5:4 D5:4" },
      abc: ["_e4", "w:1 5 ♭7 6\nw:do sol te la"],
    },
  },
  {
    name: "125 U04.L01 thirds in two lines, written as one voice of dyads",
    code: 'n("[0 1 2 3], [2 3 4 5]").scale("C4:major")',
    bars: 1,
    expect: { voices: { S1: "[C4,E4]:4 [D4,F4]:4 [E4,G4]:4 [F4,A4]:4" } },
  },
  {
    name: "126 U04.L01 distances from home: a 2nd, a 3rd, a 5th, an octave",
    code: 'n("<[0 1] [0 2] [0 4] [0 7]>").scale("C4:major")',
    bars: 4,
    annotations: { degree: true },
    expect: {
      voices: { S1: "C4:2 D4:2 | C4:2 E4:2 | C4:2 G4:2 | C4:2 C5:2" },
      abc: ["w:1 2 | 1 3 | 1 5 | 1 1"],
    },
  },
  {
    name: "127 U04.L02 major and minor thirds, C sharp in the last",
    code: 'note("[c4,e4] [d4,f4] [e4,g4] [a3,c#4]")',
    bars: 1,
    key: { tonic: "C", mode: "major" },
    expect: { voices: { S1: "[C4,E4]:4 [D4,F4]:4 [E4,G4]:4 [A3,C#4]:4" }, abc: ["[A,^C]4"] },
  },
  {
    name: "128 U04.L03 harmonic tritone F–B resolving to E–C",
    code: 'note("[f4,b4]@2 [e4,c5]@2")',
    bars: 1,
    expect: { voices: { S1: "[F4,B4]:2 [E4,C5]:2" }, abc: ["[FB]8 !class=oak-e1![Ec]8"] },
  },
  {
    name: "129 U04.CP name the quality: M3, P5 and the tritone on the staff",
    code: 'note("[c4,e4] [d4,a4] [f4,b4] ~")',
    bars: 1,
    expect: { voices: { S1: "[C4,E4]:4 [D4,A4]:4 [F4,B4]:4 r:4" } },
  },
  {
    name: "130 U04 3rds and 6ths in G major under the signature",
    code: 'n("[0,2] [1,3] [4,6] [0,5]").scale("G3:major")',
    bars: 1,
    expect: {
      voices: { S1: "[G3,B3]:4 [A3,C4]:4 [D4,F#4]:4 [G3,E4]:4" },
      abc: ["K:G\n", "[DF]4"],
    },
  },
  {
    name: "131 U04.L04 sing 1 3 1 5 on syllables",
    code: 'n("0 2 0 4").scale("C4:major")',
    bars: 1,
    annotations: { solfege: true },
    expect: { voices: { S1: "C4:4 E4:4 C4:4 G4:4" }, abc: ["w:do mi do sol"] },
  },
  // --- Wave 4: triads and inversions, chord symbols and numerals, the grand staff with chords, lead sheets
  // with pickups, key changes inside a bar, two keys on one staff (U05–U07 material from content/specs) ---
  {
    name: "132 U05.L01 stacking thirds: I V vi IV as whole-bar triads, symbols and numerals",
    code: 'chords: n("<[0,2,4] [4,6,8] [5,7,9] [3,5,7]>").scale("C3:major")',
    bars: 4,
    key: {
      tonic: "C",
      mode: "major",
    },
    chords: [
      {
        bar: 0,
        beat: 1,
        symbol: "C",
      },
      {
        bar: 1,
        beat: 1,
        symbol: "G",
      },
      {
        bar: 2,
        beat: 1,
        symbol: "Am",
      },
      {
        bar: 3,
        beat: 1,
        symbol: "F",
      },
    ],
    romans: [
      {
        bar: 0,
        beat: 1,
        rn: "I",
      },
      {
        bar: 1,
        beat: 1,
        rn: "V",
      },
      {
        bar: 2,
        beat: 1,
        rn: "vi",
      },
      {
        bar: 3,
        beat: 1,
        rn: "IV",
      },
    ],
    expect: {
      voices: {
        S1: "[C3,E3,G3]:1 | [G3,B3,D4]:1 | [A3,C4,E4]:1 | [F3,A3,C4]:1",
      },
      staves: ["S1:bass"],
      chordTexts: ["C", "G", "Am", "F"],
      romanTexts: ["I", "V", "vi", "IV"],
    },
  },
  {
    name: "133 U05.L01 hook on the grand staff: left-hand triads under the tune",
    code: 'chords: n("<[0,2,4] [4,6,8] [5,7,9] [3,5,7]>").scale("C3:major")\nmel: n("<[4 ~ 2 4] [6 ~ 4 ~] [5 ~ 7 5] [5 ~ 3 ~]>").scale("C4:major")',
    bars: 4,
    key: {
      tonic: "C",
      mode: "major",
    },
    staff: "grand",
    split: "track",
    trackClefs: {
      chords: "bass",
      mel: "treble",
    },
    chords: [
      {
        bar: 0,
        beat: 1,
        symbol: "C",
      },
      {
        bar: 1,
        beat: 1,
        symbol: "G",
      },
      {
        bar: 2,
        beat: 1,
        symbol: "Am",
      },
      {
        bar: 3,
        beat: 1,
        symbol: "F",
      },
    ],
    romans: [
      {
        bar: 0,
        beat: 1,
        rn: "I",
      },
      {
        bar: 1,
        beat: 1,
        rn: "V",
      },
      {
        bar: 2,
        beat: 1,
        rn: "vi",
      },
      {
        bar: 3,
        beat: 1,
        rn: "IV",
      },
    ],
    expect: {
      voices: {
        RH: "G4:4 r:4 E4:4 G4:4 | B4:4 r:4 G4:4 r:4 | A4:4 r:4 C5:4 A4:4 | A4:4 r:4 F4:4 r:4",
        LH: "[C3,E3,G3]:1 | [G3,B3,D4]:1 | [A3,C4,E4]:1 | [F3,A3,C4]:1",
      },
      staves: ["RH:treble", "LH:bass"],
      chordTexts: ["C", "G", "Am", "F"],
      romanTexts: ["I", "V", "vi", "IV"],
    },
  },
  {
    name: "134 U05.L02 A minor then A major: the C sharp in the chord",
    code: 'chords: note("<[a3,c4,e4]!2 [a3,c#4,e4]!2>")',
    bars: 4,
    key: {
      tonic: "C",
      mode: "major",
    },
    chords: [
      {
        bar: 0,
        beat: 1,
        symbol: "Am",
      },
      {
        bar: 1,
        beat: 1,
        symbol: "Am",
      },
      {
        bar: 2,
        beat: 1,
        symbol: "A",
      },
      {
        bar: 3,
        beat: 1,
        symbol: "A",
      },
    ],
    expect: {
      voices: {
        S1: "[A3,C4,E4]:1 | [A3,C4,E4]:1 | [A3,C#4,E4]:1 | [A3,C#4,E4]:1",
      },
      chordTexts: ["Am", "Am", "A", "A"],
    },
  },
  {
    name: "135 U05.L03 augmented and diminished: C, C+, F, B°",
    code: 'chords: note("<[c4,e4,g4] [c4,e4,g#4] [c4,f4,a4] [b3,d4,f4]>")',
    bars: 4,
    key: {
      tonic: "C",
      mode: "major",
    },
    chords: [
      {
        bar: 0,
        beat: 1,
        symbol: "C",
      },
      {
        bar: 1,
        beat: 1,
        symbol: "Caug",
      },
      {
        bar: 2,
        beat: 1,
        symbol: "F",
      },
      {
        bar: 3,
        beat: 1,
        symbol: "Bo",
      },
    ],
    romans: [
      {
        bar: 0,
        beat: 1,
        rn: "I",
      },
      {
        bar: 1,
        beat: 1,
        rn: "I+",
      },
      {
        bar: 2,
        beat: 1,
        rn: "IV",
      },
      {
        bar: 3,
        beat: 1,
        rn: "viio",
      },
    ],
    expect: {
      voices: {
        S1: "[C4,E4,G4]:1 | [C4,E4,G#4]:1 | [C4,F4,A4]:1 | [B3,D4,F4]:1",
      },
      chordTexts: ["C", "C+", "F", "B°"],
      romanTexts: ["I", "I+", "IV", "vii°"],
      abc: ['"Bo"', '"_vii°"'],
    },
  },
  {
    name: "136 U05.L05 inversions: I V6 vi IV, the bass walking down",
    code: 'chords: n("<[0,2,4] [-1,1,4] [-2,0,2] [-4,-2,0]>").scale("C3:major")',
    bars: 4,
    key: {
      tonic: "C",
      mode: "major",
    },
    staff: "bass",
    chords: [
      {
        bar: 0,
        beat: 1,
        symbol: "C",
      },
      {
        bar: 1,
        beat: 1,
        symbol: "G/B",
      },
      {
        bar: 2,
        beat: 1,
        symbol: "Am",
      },
      {
        bar: 3,
        beat: 1,
        symbol: "F",
      },
    ],
    romans: [
      {
        bar: 0,
        beat: 1,
        rn: "I",
      },
      {
        bar: 1,
        beat: 1,
        rn: "V6",
      },
      {
        bar: 2,
        beat: 1,
        rn: "vi",
      },
      {
        bar: 3,
        beat: 1,
        rn: "IV",
      },
    ],
    expect: {
      voices: {
        S1: "[C3,E3,G3]:1 | [B2,D3,G3]:1 | [A2,C3,E3]:1 | [F2,A2,C3]:1",
      },
      staves: ["S1:bass"],
      chordTexts: ["C", "G/B", "Am", "F"],
      romanTexts: ["I", "V6", "vi", "IV"],
      abc: ['"G/B"', '"_V6"'],
    },
  },
  {
    name: "137 one triad in three positions in G: I, I6, I64",
    code: 'n("[0,2,4] [2,4,7] [4,7,9] [7,9,11]").scale("G3:major")',
    bars: 1,
    key: {
      tonic: "G",
      mode: "major",
    },
    chords: [
      {
        bar: 0,
        beat: 1,
        symbol: "G",
      },
      {
        bar: 0,
        beat: 2,
        symbol: "G/B",
      },
      {
        bar: 0,
        beat: 3,
        symbol: "G/D",
      },
      {
        bar: 0,
        beat: 4,
        symbol: "G",
      },
    ],
    romans: [
      {
        bar: 0,
        beat: 1,
        rn: "I",
      },
      {
        bar: 0,
        beat: 2,
        rn: "I6",
      },
      {
        bar: 0,
        beat: 3,
        rn: "I64",
      },
      {
        bar: 0,
        beat: 4,
        rn: "I",
      },
    ],
    expect: {
      voices: {
        S1: "[G3,B3,D4]:4 [B3,D4,G4]:4 [D4,G4,B4]:4 [G4,B4,D5]:4",
      },
      chordTexts: ["G", "G/B", "G/D", "G"],
      romanTexts: ["I", "I6", "I64", "I"],
    },
  },
  {
    name: "138 triads of D major: D, G, A and C sharp diminished",
    code: 'n("<[0,2,4] [3,5,7] [4,6,8] [6,8,10]>").scale("D4:major")',
    bars: 4,
    key: {
      tonic: "D",
      mode: "major",
    },
    chords: [
      {
        bar: 0,
        beat: 1,
        symbol: "D",
      },
      {
        bar: 1,
        beat: 1,
        symbol: "G",
      },
      {
        bar: 2,
        beat: 1,
        symbol: "A",
      },
      {
        bar: 3,
        beat: 1,
        symbol: "C#o",
      },
    ],
    romans: [
      {
        bar: 0,
        beat: 1,
        rn: "I",
      },
      {
        bar: 1,
        beat: 1,
        rn: "IV",
      },
      {
        bar: 2,
        beat: 1,
        rn: "V",
      },
      {
        bar: 3,
        beat: 1,
        rn: "viio",
      },
    ],
    expect: {
      voices: {
        S1: "[D4,F#4,A4]:1 | [G4,B4,D5]:1 | [A4,C#5,E5]:1 | [C#5,E5,G5]:1",
      },
      chordTexts: ["D", "G", "A", "C♯°"],
      romanTexts: ["I", "IV", "V", "vii°"],
    },
  },
  {
    name: "139 B flat major triads in the bass clef: I ii V I",
    code: 'n("<[0,2,4] [1,3,5] [4,6,8] [0,2,4]>").scale("Bb2:major")',
    bars: 4,
    key: {
      tonic: "Bb",
      mode: "major",
    },
    staff: "bass",
    chords: [
      {
        bar: 0,
        beat: 1,
        symbol: "Bb",
      },
      {
        bar: 1,
        beat: 1,
        symbol: "Cm",
      },
      {
        bar: 2,
        beat: 1,
        symbol: "F",
      },
      {
        bar: 3,
        beat: 1,
        symbol: "Bb",
      },
    ],
    romans: [
      {
        bar: 0,
        beat: 1,
        rn: "I",
      },
      {
        bar: 1,
        beat: 1,
        rn: "ii",
      },
      {
        bar: 2,
        beat: 1,
        rn: "V",
      },
      {
        bar: 3,
        beat: 1,
        rn: "I",
      },
    ],
    expect: {
      voices: {
        S1: "[Bb2,D3,F3]:1 | [C3,Eb3,G3]:1 | [F3,A3,C4]:1 | [Bb2,D3,F3]:1",
      },
      staves: ["S1:bass"],
      chordTexts: ["B♭", "Cm", "F", "B♭"],
      romanTexts: ["I", "ii", "V", "I"],
    },
  },
  {
    name: "140 E major: four sharps held by the signature in stacked chords",
    code: 'note("[e4,g#4,b4] [a4,c#5,e5] [b3,d#4,f#4] [e4,g#4,b4]")',
    bars: 1,
    key: {
      tonic: "E",
      mode: "major",
    },
    chords: [
      {
        bar: 0,
        beat: 1,
        symbol: "E",
      },
      {
        bar: 0,
        beat: 2,
        symbol: "A",
      },
      {
        bar: 0,
        beat: 3,
        symbol: "B",
      },
      {
        bar: 0,
        beat: 4,
        symbol: "E",
      },
    ],
    expect: {
      voices: {
        S1: "[E4,G#4,B4]:4 [A4,C#5,E5]:4 [B3,D#4,F#4]:4 [E4,G#4,B4]:4",
      },
      chordTexts: ["E", "A", "B", "E"],
    },
  },
  {
    name: "141 A flat major in the bass clef: four flats, a second inversion",
    code: 'note("<[ab2,c3,eb3] [ab2,db3,f3] [bb2,eb3,g3] [ab2,c3,eb3]>")',
    bars: 4,
    key: {
      tonic: "Ab",
      mode: "major",
    },
    staff: "bass",
    chords: [
      {
        bar: 0,
        beat: 1,
        symbol: "Ab",
      },
      {
        bar: 1,
        beat: 1,
        symbol: "Db/Ab",
      },
      {
        bar: 2,
        beat: 1,
        symbol: "Eb/Bb",
      },
      {
        bar: 3,
        beat: 1,
        symbol: "Ab",
      },
    ],
    romans: [
      {
        bar: 0,
        beat: 1,
        rn: "I",
      },
      {
        bar: 1,
        beat: 1,
        rn: "IV64",
      },
      {
        bar: 2,
        beat: 1,
        rn: "V64",
      },
      {
        bar: 3,
        beat: 1,
        rn: "I",
      },
    ],
    expect: {
      voices: {
        S1: "[Ab2,C3,Eb3]:1 | [Ab2,Db3,F3]:1 | [Bb2,Eb3,G3]:1 | [Ab2,C3,Eb3]:1",
      },
      staves: ["S1:bass"],
      chordTexts: ["A♭", "D♭/A♭", "E♭/B♭", "A♭"],
      romanTexts: ["I", "IV64", "V64", "I"],
      abc: ['"_IV64"', '"Db/Ab"'],
    },
  },
  {
    name: "142 seconds in a chord: Cadd9 and a Cmaj7 over G, heads offset",
    code: 'note("[c4,d4,e4,g4]@2 [g3,b3,c4,e4]@2")',
    bars: 1,
    key: {
      tonic: "C",
      mode: "major",
    },
    chords: [
      {
        bar: 0,
        beat: 1,
        symbol: "Cadd9",
      },
      {
        bar: 0,
        beat: 3,
        symbol: "Cmaj7/G",
      },
    ],
    expect: {
      voices: {
        S1: "[C4,D4,E4,G4]:2 [G3,B3,C4,E4]:2",
      },
      chordTexts: ["Cadd9", "Cmaj7/G"],
    },
  },
  {
    name: "143 U06.L10 neo-soul sevenths: Cmaj7 Am7 Dm7 G7 stacked in thirds, bass clef",
    code: 'chords: n("[0,2,4,6]").add(n("<0 5 1 4>")).scale("C3:major")',
    bars: 4,
    key: {
      tonic: "C",
      mode: "major",
    },
    staff: "bass",
    chords: [
      {
        bar: 0,
        beat: 1,
        symbol: "Cmaj7",
      },
      {
        bar: 1,
        beat: 1,
        symbol: "Am7",
      },
      {
        bar: 2,
        beat: 1,
        symbol: "Dm7",
      },
      {
        bar: 3,
        beat: 1,
        symbol: "G7",
      },
    ],
    romans: [
      {
        bar: 0,
        beat: 1,
        rn: "Imaj7",
      },
      {
        bar: 1,
        beat: 1,
        rn: "vi7",
      },
      {
        bar: 2,
        beat: 1,
        rn: "ii7",
      },
      {
        bar: 3,
        beat: 1,
        rn: "V7",
      },
    ],
    expect: {
      voices: {
        S1: "[C3,E3,G3,B3]:1 | [A3,C4,E4,G4]:1 | [D3,F3,A3,C4]:1 | [G3,B3,D4,F4]:1",
      },
      staves: ["S1:bass"],
      chordTexts: ["Cmaj7", "Am7", "Dm7", "G7"],
      romanTexts: ["Imaj7", "vi7", "ii7", "V7"],
    },
  },
  {
    name: "144 V7 in its inversions resolving: V65 V43 V42 I6, seconds on the staff",
    code: 'note("[b3,d4,f4,g4] [d4,f4,g4,b4] [f4,g4,b4,d5] [e4,g4,c5]")',
    bars: 1,
    key: {
      tonic: "C",
      mode: "major",
    },
    chords: [
      {
        bar: 0,
        beat: 1,
        symbol: "G7/B",
      },
      {
        bar: 0,
        beat: 2,
        symbol: "G7/D",
      },
      {
        bar: 0,
        beat: 3,
        symbol: "G7/F",
      },
      {
        bar: 0,
        beat: 4,
        symbol: "C/E",
      },
    ],
    romans: [
      {
        bar: 0,
        beat: 1,
        rn: "V65",
      },
      {
        bar: 0,
        beat: 2,
        rn: "V43",
      },
      {
        bar: 0,
        beat: 3,
        rn: "V42",
      },
      {
        bar: 0,
        beat: 4,
        rn: "I6",
      },
    ],
    expect: {
      voices: {
        S1: "[B3,D4,F4,G4]:4 [D4,F4,G4,B4]:4 [F4,G4,B4,D5]:4 [E4,G4,C5]:4",
      },
      chordTexts: ["G7/B", "G7/D", "G7/F", "C/E"],
      romanTexts: ["V65", "V43", "V42", "I6"],
    },
  },
  {
    name: "145 A minor: i iv V i, the raised 7th G sharp as an accidental",
    code: 'note("<[a3,c4,e4] [d4,f4,a4] [e4,g#4,b4] [a3,c4,e4]>")',
    bars: 4,
    key: {
      tonic: "A",
      mode: "minor",
    },
    chords: [
      {
        bar: 0,
        beat: 1,
        symbol: "Am",
      },
      {
        bar: 1,
        beat: 1,
        symbol: "Dm",
      },
      {
        bar: 2,
        beat: 1,
        symbol: "E",
      },
      {
        bar: 3,
        beat: 1,
        symbol: "Am",
      },
    ],
    romans: [
      {
        bar: 0,
        beat: 1,
        rn: "i",
      },
      {
        bar: 1,
        beat: 1,
        rn: "iv",
      },
      {
        bar: 2,
        beat: 1,
        rn: "V",
      },
      {
        bar: 3,
        beat: 1,
        rn: "i",
      },
    ],
    expect: {
      voices: {
        S1: "[A3,C4,E4]:1 | [D4,F4,A4]:1 | [E4,G#4,B4]:1 | [A3,C4,E4]:1",
      },
      chordTexts: ["Am", "Dm", "E", "Am"],
      romanTexts: ["i", "iv", "V", "i"],
    },
  },
  {
    name: "146 C minor: three flats, B natural in the V chord",
    code: 'note("[c4,eb4,g4] [f4,ab4,c5] [g4,b4,d5] [c4,eb4,g4]")',
    bars: 1,
    key: {
      tonic: "C",
      mode: "minor",
    },
    chords: [
      {
        bar: 0,
        beat: 1,
        symbol: "Cm",
      },
      {
        bar: 0,
        beat: 2,
        symbol: "Fm",
      },
      {
        bar: 0,
        beat: 3,
        symbol: "G",
      },
      {
        bar: 0,
        beat: 4,
        symbol: "Cm",
      },
    ],
    romans: [
      {
        bar: 0,
        beat: 1,
        rn: "i",
      },
      {
        bar: 0,
        beat: 2,
        rn: "iv",
      },
      {
        bar: 0,
        beat: 3,
        rn: "V",
      },
      {
        bar: 0,
        beat: 4,
        rn: "i",
      },
    ],
    expect: {
      voices: {
        S1: "[C4,Eb4,G4]:4 [F4,Ab4,C5]:4 [G4,B4,D5]:4 [C4,Eb4,G4]:4",
      },
      chordTexts: ["Cm", "Fm", "G", "Cm"],
      romanTexts: ["i", "iv", "V", "i"],
    },
  },
  {
    name: "147 U05.L06 grand staff: the bass walking the roots, the four-chord loop above",
    code: 'bass: n("<[0 ~ 0 4] [4 ~ 4 1] [5 ~ 5 2] [3 ~ 3 0]>").scale("C2:major")\nchords: n("<[0,2,4] [4,6,8] [5,7,9] [3,5,7]>").scale("C3:major")',
    bars: 4,
    key: {
      tonic: "C",
      mode: "major",
    },
    staff: "grand",
    split: "track",
    trackClefs: {
      bass: "bass",
      chords: "treble",
    },
    chords: [
      {
        bar: 0,
        beat: 1,
        symbol: "C",
      },
      {
        bar: 1,
        beat: 1,
        symbol: "G",
      },
      {
        bar: 2,
        beat: 1,
        symbol: "Am",
      },
      {
        bar: 3,
        beat: 1,
        symbol: "F",
      },
    ],
    expect: {
      voices: {
        RH: "[C3,E3,G3]:1 | [G3,B3,D4]:1 | [A3,C4,E4]:1 | [F3,A3,C4]:1",
        LH: "C2:4 r:4 C2:4 G2:4 | G2:4 r:4 G2:4 D2:4 | A2:4 r:4 A2:4 E2:4 | F2:4 r:4 F2:4 C2:4",
      },
      staves: ["RH:treble", "LH:bass"],
      chordTexts: ["C", "G", "Am", "F"],
    },
  },
  {
    name: "148 grand staff split by register: one chord across both staves",
    code: 'note("[c3,g3,e4,c5] [b2,g3,d4,g4] [a2,e3,c4,a4] [f2,c3,a3,f4]")',
    bars: 1,
    key: {
      tonic: "C",
      mode: "major",
    },
    staff: "grand",
    chords: [
      {
        bar: 0,
        beat: 1,
        symbol: "C",
      },
      {
        bar: 0,
        beat: 2,
        symbol: "G/B",
      },
      {
        bar: 0,
        beat: 3,
        symbol: "Am",
      },
      {
        bar: 0,
        beat: 4,
        symbol: "F",
      },
    ],
    expect: {
      voices: {
        RH: "[E4,C5]:4 [D4,G4]:4 [C4,A4]:4 F4:4",
        LH: "[C3,G3]:4 [B2,G3]:4 [A2,E3]:4 [F2,C3,A3]:4",
      },
      staves: ["RH:treble", "LH:bass"],
      chordTexts: ["C", "G/B", "Am", "F"],
    },
  },
  {
    name: "149 U06.L11 slash chords over a walking bass: C G/B Am Am/G F C/E Dm G",
    code: 'chords: chord("<C G Am Am F C Dm G>").voicing()\nbass: note("<c3 b2 a2 g2 f2 e2 d2 g2>")',
    bars: 8,
    key: {
      tonic: "C",
      mode: "major",
    },
    staff: "grand",
    split: "track",
    trackClefs: {
      chords: "treble",
      bass: "bass",
    },
    chordByBar: ["C", "G", "Am", "Am", "F", "C", "Dm", "G"],
    chordTracks: ["chords"],
    chords: [
      {
        bar: 0,
        beat: 1,
        symbol: "C",
      },
      {
        bar: 1,
        beat: 1,
        symbol: "G/B",
      },
      {
        bar: 2,
        beat: 1,
        symbol: "Am",
      },
      {
        bar: 3,
        beat: 1,
        symbol: "Am/G",
      },
      {
        bar: 4,
        beat: 1,
        symbol: "F",
      },
      {
        bar: 5,
        beat: 1,
        symbol: "C/E",
      },
      {
        bar: 6,
        beat: 1,
        symbol: "Dm",
      },
      {
        bar: 7,
        beat: 1,
        symbol: "G",
      },
    ],
    romans: [
      {
        bar: 0,
        beat: 1,
        rn: "I",
      },
      {
        bar: 1,
        beat: 1,
        rn: "V6",
      },
      {
        bar: 2,
        beat: 1,
        rn: "vi",
      },
      {
        bar: 3,
        beat: 1,
        rn: "vi42",
      },
      {
        bar: 4,
        beat: 1,
        rn: "IV",
      },
      {
        bar: 5,
        beat: 1,
        rn: "I6",
      },
      {
        bar: 6,
        beat: 1,
        rn: "ii",
      },
      {
        bar: 7,
        beat: 1,
        rn: "V",
      },
    ],
    expect: {
      voices: {
        RH: "[E3,C4,E4,G4,C5]:1 | [G3,D4,G4,B4]:1 | [A3,C4,E4,A4,C5]:1 | [A3,C4,E4,A4,C5]:1 | [F3,C4,F4,A4,C5]:1 | [E3,C4,E4,G4,C5]:1 | [D3,A3,D4,F4,A4]:1 | [G3,D4,G4,B4]:1",
        LH: "C3:1 | B2:1 | A2:1 | G2:1 | F2:1 | E2:1 | D2:1 | G2:1",
      },
      staves: ["RH:treble", "LH:bass"],
      chordTexts: ["C", "G/B", "Am", "Am/G", "F", "C/E", "Dm", "G"],
      romanTexts: ["I", "V6", "vi", "vi42", "IV", "I6", "ii", "V"],
    },
  },
  {
    name: "150 U07.L09 Amazing Grace lead sheet: 3/4, one-beat pickup, F F B♭ F F F C",
    code: 'chords: n("<~ [0,2,4] [0,2,4] [3,5,7] [0,2,4] [0,2,4] [0,2,4] [4,6,8]>").scale("F3:major")\nmel: n("<[~ ~ -3] [0@2 [2 0]] [2@2 1] [0@2 -2] [-3@2 -3] [0@2 [2 0]] [2@2 1] [4@2 ~]>").scale("F4:major")',
    tracks: ["mel"],
    bars: 8,
    meter: "3/4",
    key: {
      tonic: "F",
      mode: "major",
    },
    staff: "lead",
    pickup: {
      units: [1, 1],
    },
    chords: [
      {
        bar: 1,
        beat: 1,
        symbol: "F",
      },
      {
        bar: 2,
        beat: 1,
        symbol: "F",
      },
      {
        bar: 3,
        beat: 1,
        symbol: "Bb",
      },
      {
        bar: 4,
        beat: 1,
        symbol: "F",
      },
      {
        bar: 5,
        beat: 1,
        symbol: "F",
      },
      {
        bar: 6,
        beat: 1,
        symbol: "F",
      },
      {
        bar: 7,
        beat: 1,
        symbol: "C",
      },
    ],
    expect: {
      voices: {
        S1: "C4:4 | F4:2 A4:8 F4:8 | A4:2 G4:4 | F4:2 D4:4 | C4:2 C4:4 | F4:2 A4:8 F4:8 | A4:2 G4:4 | C5:2",
      },
      chordTexts: ["F", "F", "B♭", "F", "F", "F", "C"],
      barNumbers: [5],
      abc: ["%%barnumbers 0\n%%setbarnb 0\n", '"Bb"!class=oak-e6!F8'],
    },
  },
  {
    name: "151 U07.L09 Amazing Grace with the numeral lens: I I IV I I I V under the tune",
    code: 'chords: n("<~ [0,2,4] [0,2,4] [3,5,7] [0,2,4] [0,2,4] [0,2,4] [4,6,8]>").scale("F3:major")\nmel: n("<[~ ~ -3] [0@2 [2 0]] [2@2 1] [0@2 -2] [-3@2 -3] [0@2 [2 0]] [2@2 1] [4@2 ~]>").scale("F4:major")',
    tracks: ["mel"],
    bars: 8,
    meter: "3/4",
    key: {
      tonic: "F",
      mode: "major",
    },
    staff: "lead",
    pickup: {
      units: [1, 1],
    },
    chords: [
      {
        bar: 1,
        beat: 1,
        symbol: "F",
      },
      {
        bar: 2,
        beat: 1,
        symbol: "F",
      },
      {
        bar: 3,
        beat: 1,
        symbol: "Bb",
      },
      {
        bar: 4,
        beat: 1,
        symbol: "F",
      },
      {
        bar: 5,
        beat: 1,
        symbol: "F",
      },
      {
        bar: 6,
        beat: 1,
        symbol: "F",
      },
      {
        bar: 7,
        beat: 1,
        symbol: "C",
      },
    ],
    romans: [
      {
        bar: 1,
        beat: 1,
        rn: "I",
      },
      {
        bar: 2,
        beat: 1,
        rn: "I",
      },
      {
        bar: 3,
        beat: 1,
        rn: "IV",
      },
      {
        bar: 4,
        beat: 1,
        rn: "I",
      },
      {
        bar: 5,
        beat: 1,
        rn: "I",
      },
      {
        bar: 6,
        beat: 1,
        rn: "I",
      },
      {
        bar: 7,
        beat: 1,
        rn: "V",
      },
    ],
    expect: {
      voices: {
        S1: "C4:4 | F4:2 A4:8 F4:8 | A4:2 G4:4 | F4:2 D4:4 | C4:2 C4:4 | F4:2 A4:8 F4:8 | A4:2 G4:4 | C5:2",
      },
      chordTexts: ["F", "F", "B♭", "F", "F", "F", "C"],
      romanTexts: ["I", "I", "IV", "I", "I", "I", "V"],
      barNumbers: [5],
    },
  },
  {
    name: "152 U07.L09 Amazing Grace, page 2 of a narrow lead sheet: bars 5–7, numbered from 5, last bar short",
    code: 'chords: n("<~ [0,2,4] [0,2,4] [3,5,7] [0,2,4] [0,2,4] [0,2,4] [4,6,8]>").scale("F3:major")\nmel: n("<[~ ~ -3] [0@2 [2 0]] [2@2 1] [0@2 -2] [-3@2 -3] [0@2 [2 0]] [2@2 1] [4@2 ~]>").scale("F4:major")',
    tracks: ["mel"],
    bars: 3,
    startBar: 5,
    meter: "3/4",
    key: {
      tonic: "F",
      mode: "major",
    },
    staff: "lead",
    pickup: {
      units: [1, 1],
    },
    chords: [
      {
        bar: 1,
        beat: 1,
        symbol: "F",
      },
      {
        bar: 2,
        beat: 1,
        symbol: "F",
      },
      {
        bar: 3,
        beat: 1,
        symbol: "Bb",
      },
      {
        bar: 4,
        beat: 1,
        symbol: "F",
      },
      {
        bar: 5,
        beat: 1,
        symbol: "F",
      },
      {
        bar: 6,
        beat: 1,
        symbol: "F",
      },
      {
        bar: 7,
        beat: 1,
        symbol: "C",
      },
    ],
    abcOptions: {
      barsPerLine: 2,
    },
    expect: {
      voices: {
        S1: "F4:2 A4:8 F4:8 | A4:2 G4:4 | C5:2",
      },
      chordTexts: ["F", "F", "C"],
      barNumbers: [5, 7],
      abc: ["%%setbarnb 5\n"],
    },
  },
  {
    name: "153 U07.L09 Amazing Grace, page 1 of a narrow lead sheet: the pickup and bars 1–4, not the end",
    code: 'chords: n("<~ [0,2,4] [0,2,4] [3,5,7] [0,2,4] [0,2,4] [0,2,4] [4,6,8]>").scale("F3:major")\nmel: n("<[~ ~ -3] [0@2 [2 0]] [2@2 1] [0@2 -2] [-3@2 -3] [0@2 [2 0]] [2@2 1] [4@2 ~]>").scale("F4:major")',
    tracks: ["mel"],
    bars: 5,
    meter: "3/4",
    key: {
      tonic: "F",
      mode: "major",
    },
    staff: "lead",
    pickup: {
      units: [1, 1],
    },
    endsPiece: false,
    chords: [
      {
        bar: 1,
        beat: 1,
        symbol: "F",
      },
      {
        bar: 2,
        beat: 1,
        symbol: "F",
      },
      {
        bar: 3,
        beat: 1,
        symbol: "Bb",
      },
      {
        bar: 4,
        beat: 1,
        symbol: "F",
      },
      {
        bar: 5,
        beat: 1,
        symbol: "F",
      },
      {
        bar: 6,
        beat: 1,
        symbol: "F",
      },
      {
        bar: 7,
        beat: 1,
        symbol: "C",
      },
    ],
    abcOptions: {
      barsPerLine: 2,
    },
    expect: {
      voices: {
        S1: "C4:4 | F4:2 A4:8 F4:8 | A4:2 G4:4 | F4:2 D4:4 | C4:2 C4:4",
      },
      chordTexts: ["F", "F", "B♭", "F"],
      barNumbers: [3],
      abc: ['"F"!class=oak-e8!C8 !class=oak-e9!C4 |]'],
    },
  },
  {
    name: "154 U07.L08 Auld Lang Syne lead sheet: 4/4, one-beat pickup, C G C F",
    code: 'chords: n("<~ [0,2,4] [4,6,8] [0,2,4] [3,5,7]>").scale("C3:major")\nmel: n("<[~ ~ ~ -3] [0 0 0 2] [1 0 1 2] [0 0 2 4] [5@4]>").scale("C4:major")',
    tracks: ["mel"],
    bars: 5,
    key: {
      tonic: "C",
      mode: "major",
    },
    staff: "lead",
    pickup: {
      units: [1, 1],
    },
    chords: [
      {
        bar: 1,
        beat: 1,
        symbol: "C",
      },
      {
        bar: 2,
        beat: 1,
        symbol: "G",
      },
      {
        bar: 3,
        beat: 1,
        symbol: "C",
      },
      {
        bar: 4,
        beat: 1,
        symbol: "F",
      },
    ],
    expect: {
      voices: {
        S1: "G3:4 | C4:4 C4:4 C4:4 E4:4 | D4:4 C4:4 D4:4 E4:4 | C4:4 C4:4 E4:4 G4:4 | A4:1",
      },
      chordTexts: ["C", "G", "C", "F"],
    },
  },
  {
    name: "155 U07.L08 a two-beat pickup climbing 3 4 into 5, the last bar shortened by two beats",
    code: 'mel: n("<[~ ~ 2 3] [4 ~ 2 ~] [1 ~ 0 ~] [1 2 ~ ~]>").scale("C4:major")',
    bars: 4,
    key: {
      tonic: "C",
      mode: "major",
    },
    staff: "lead",
    pickup: {
      units: [2, 1],
    },
    chords: [
      {
        bar: 1,
        beat: 1,
        symbol: "C",
      },
      {
        bar: 2,
        beat: 1,
        symbol: "G",
      },
      {
        bar: 2,
        beat: 3,
        symbol: "C",
      },
      {
        bar: 3,
        beat: 1,
        symbol: "G",
      },
    ],
    expect: {
      voices: {
        S1: "E4:4 F4:4 | G4:4 r:4 E4:4 r:4 | D4:4 r:4 C4:4 r:4 | D4:4 E4:4",
      },
      chordTexts: ["C", "G", "C", "G"],
    },
  },
  {
    name: "156 3/4 pickup of two eighths with two chords in a bar",
    code: 'mel: n("<[~ ~ [3 4]] [5 4 2] [3@2 1] [0 ~ ~]>").scale("G4:major")',
    bars: 4,
    meter: "3/4",
    key: {
      tonic: "G",
      mode: "major",
    },
    staff: "lead",
    pickup: {
      units: [1, 1],
    },
    chords: [
      {
        bar: 1,
        beat: 1,
        symbol: "G",
      },
      {
        bar: 2,
        beat: 1,
        symbol: "C",
      },
      {
        bar: 2,
        beat: 3,
        symbol: "D",
      },
      {
        bar: 3,
        beat: 1,
        symbol: "G",
      },
    ],
    expect: {
      voices: {
        S1: "C5:8 D5:8 | E5:4 D5:4 B4:4 | C5:2 A4:4 | G4:4 r:4",
      },
      chordTexts: ["G", "C", "D", "G"],
    },
  },
  {
    name: "157 lead sheet with slash, seventh and half-diminished symbols",
    code: 'mel: n("<[4 2 0 2] [5 3 1 3] [6 4 1 4] [7 ~ ~ ~]>").scale("C5:major")',
    bars: 4,
    key: {
      tonic: "C",
      mode: "major",
    },
    staff: "lead",
    chords: [
      {
        bar: 0,
        beat: 1,
        symbol: "C/E",
      },
      {
        bar: 0,
        beat: 3,
        symbol: "Cmaj7",
      },
      {
        bar: 1,
        beat: 1,
        symbol: "Dm7",
      },
      {
        bar: 1,
        beat: 3,
        symbol: "F/A",
      },
      {
        bar: 2,
        beat: 1,
        symbol: "Bm7b5",
      },
      {
        bar: 2,
        beat: 3,
        symbol: "G7",
      },
      {
        bar: 3,
        beat: 1,
        symbol: "C",
      },
    ],
    expect: {
      voices: {
        S1: "G5:4 E5:4 C5:4 E5:4 | A5:4 F5:4 D5:4 F5:4 | B5:4 G5:4 D5:4 G5:4 | C6:4 r:4 r:2",
      },
      chordTexts: ["C/E", "Cmaj7", "Dm7", "F/A", "Bm7♭5", "G7", "C"],
    },
  },
  {
    name: "158 U06.L08 harmonic rhythm: one chord a bar, then two (roots first, so .add keeps their rhythm)",
    code: 'chords: n("<0 4 5 3 [0 4] [5 3] [1 4] 0>").add(n("[0,2,4]")).scale("C3:major")',
    bars: 8,
    key: {
      tonic: "C",
      mode: "major",
    },
    staff: "bass",
    chords: [
      {
        bar: 0,
        beat: 1,
        symbol: "C",
      },
      {
        bar: 1,
        beat: 1,
        symbol: "G",
      },
      {
        bar: 2,
        beat: 1,
        symbol: "Am",
      },
      {
        bar: 3,
        beat: 1,
        symbol: "F",
      },
      {
        bar: 4,
        beat: 1,
        symbol: "C",
      },
      {
        bar: 4,
        beat: 3,
        symbol: "G",
      },
      {
        bar: 5,
        beat: 1,
        symbol: "Am",
      },
      {
        bar: 5,
        beat: 3,
        symbol: "F",
      },
      {
        bar: 6,
        beat: 1,
        symbol: "Dm",
      },
      {
        bar: 6,
        beat: 3,
        symbol: "G",
      },
      {
        bar: 7,
        beat: 1,
        symbol: "C",
      },
    ],
    romans: [
      {
        bar: 0,
        beat: 1,
        rn: "I",
      },
      {
        bar: 1,
        beat: 1,
        rn: "V",
      },
      {
        bar: 2,
        beat: 1,
        rn: "vi",
      },
      {
        bar: 3,
        beat: 1,
        rn: "IV",
      },
      {
        bar: 4,
        beat: 1,
        rn: "I",
      },
      {
        bar: 4,
        beat: 3,
        rn: "V",
      },
      {
        bar: 5,
        beat: 1,
        rn: "vi",
      },
      {
        bar: 5,
        beat: 3,
        rn: "IV",
      },
      {
        bar: 6,
        beat: 1,
        rn: "ii",
      },
      {
        bar: 6,
        beat: 3,
        rn: "V",
      },
      {
        bar: 7,
        beat: 1,
        rn: "I",
      },
    ],
    expect: {
      voices: {
        S1: "[C3,E3,G3]:1 | [G3,B3,D4]:1 | [A3,C4,E4]:1 | [F3,A3,C4]:1 | [C3,E3,G3]:2 [G3,B3,D4]:2 | [A3,C4,E4]:2 [F3,A3,C4]:2 | [D3,F3,A3]:2 [G3,B3,D4]:2 | [C3,E3,G3]:1",
      },
      staves: ["S1:bass"],
      chordTexts: ["C", "G", "Am", "F", "C", "G", "Am", "F", "Dm", "G", "C"],
      romanTexts: ["I", "V", "vi", "IV", "I", "V", "vi", "IV", "ii", "V", "I"],
    },
  },
  {
    name: "159 U06.L07 doo-wop: triplet arpeggios, a label on each bar's first triplet",
    code: 'chords: n("[0,2,4]").add(n("<0 5 3 4>")).arp("[0 1 2]*4").scale("C3:major")',
    bars: 4,
    key: {
      tonic: "C",
      mode: "major",
    },
    staff: "bass",
    chords: [
      {
        bar: 0,
        beat: 1,
        symbol: "C",
      },
      {
        bar: 1,
        beat: 1,
        symbol: "Am",
      },
      {
        bar: 2,
        beat: 1,
        symbol: "F",
      },
      {
        bar: 3,
        beat: 1,
        symbol: "G",
      },
    ],
    romans: [
      {
        bar: 0,
        beat: 1,
        rn: "I",
      },
      {
        bar: 1,
        beat: 1,
        rn: "vi",
      },
      {
        bar: 2,
        beat: 1,
        rn: "IV",
      },
      {
        bar: 3,
        beat: 1,
        rn: "V",
      },
    ],
    expect: {
      voices: {
        S1: "(3:2 C3:8 E3:8 G3:8) (3:2 C3:8 E3:8 G3:8) (3:2 C3:8 E3:8 G3:8) (3:2 C3:8 E3:8 G3:8) | (3:2 A3:8 C4:8 E4:8) (3:2 A3:8 C4:8 E4:8) (3:2 A3:8 C4:8 E4:8) (3:2 A3:8 C4:8 E4:8) | (3:2 F3:8 A3:8 C4:8) (3:2 F3:8 A3:8 C4:8) (3:2 F3:8 A3:8 C4:8) (3:2 F3:8 A3:8 C4:8) | (3:2 G3:8 B3:8 D4:8) (3:2 G3:8 B3:8 D4:8) (3:2 G3:8 B3:8 D4:8) (3:2 G3:8 B3:8 D4:8)",
      },
      staves: ["S1:bass"],
      chordTexts: ["C", "Am", "F", "G"],
      romanTexts: ["I", "vi", "IV", "V"],
    },
  },
  {
    name: "160 U05.L04 arpeggios: the four-chord loop broken 1 3 5 3, the symbol over each bar",
    code: 'chords: n("<[0,2,4] [4,6,8] [5,7,9] [3,5,7]>").arp("0 1 2 1").scale("C3:major")',
    bars: 4,
    key: {
      tonic: "C",
      mode: "major",
    },
    staff: "bass",
    chords: [
      {
        bar: 0,
        beat: 1,
        symbol: "C",
      },
      {
        bar: 1,
        beat: 1,
        symbol: "G",
      },
      {
        bar: 2,
        beat: 1,
        symbol: "Am",
      },
      {
        bar: 3,
        beat: 1,
        symbol: "F",
      },
    ],
    expect: {
      voices: {
        S1: "C3:4 E3:4 G3:4 E3:4 | G3:4 B3:4 D4:4 B3:4 | A3:4 C4:4 E4:4 C4:4 | F3:4 A3:4 C4:4 A3:4",
      },
      staves: ["S1:bass"],
      chordTexts: ["C", "G", "Am", "F"],
    },
  },
  {
    name: "161 U06.L12 off-beat stabs: the bar's symbol stands on the opening rest",
    code: 'chords: n("[0,2,4]").add(n("<0 4 5 3>")).scale("C4:major").struct("~ x ~ [~ x]")',
    bars: 4,
    key: {
      tonic: "C",
      mode: "major",
    },
    chords: [
      {
        bar: 0,
        beat: 1,
        symbol: "C",
      },
      {
        bar: 1,
        beat: 1,
        symbol: "G",
      },
      {
        bar: 2,
        beat: 1,
        symbol: "Am",
      },
      {
        bar: 3,
        beat: 1,
        symbol: "F",
      },
    ],
    romans: [
      {
        bar: 0,
        beat: 1,
        rn: "I",
      },
      {
        bar: 1,
        beat: 1,
        rn: "V",
      },
      {
        bar: 2,
        beat: 1,
        rn: "vi",
      },
      {
        bar: 3,
        beat: 1,
        rn: "IV",
      },
    ],
    expect: {
      voices: {
        S1: "r:4 [C4,E4,G4]:4 r:4 r:8 [C4,E4,G4]:8 | r:4 [G4,B4,D5]:4 r:4 r:8 [G4,B4,D5]:8 | r:4 [A4,C5,E5]:4 r:4 r:8 [A4,C5,E5]:8 | r:4 [F4,A4,C5]:4 r:4 r:8 [F4,A4,C5]:8",
      },
      chordTexts: ["C", "G", "Am", "F"],
      romanTexts: ["I", "V", "vi", "IV"],
    },
  },
  {
    name: "162 numerals with figures, applied chords and glyphs: V65/V, vii°7, ii ø7, ♭VII",
    code: 'note("<[f#3,a3,c4,d4] [g3,b3,d4] [b3,d4,f4,ab4] [c4,e4,g4]>")',
    bars: 4,
    key: {
      tonic: "C",
      mode: "major",
    },
    chords: [
      {
        bar: 0,
        beat: 1,
        symbol: "D7/F#",
      },
      {
        bar: 1,
        beat: 1,
        symbol: "G",
      },
      {
        bar: 2,
        beat: 1,
        symbol: "Bo7",
      },
      {
        bar: 3,
        beat: 1,
        symbol: "C",
      },
    ],
    romans: [
      {
        bar: 0,
        beat: 1,
        rn: "V65/V",
      },
      {
        bar: 1,
        beat: 1,
        rn: "V",
      },
      {
        bar: 2,
        beat: 1,
        rn: "viio7",
      },
      {
        bar: 3,
        beat: 1,
        rn: "I",
      },
    ],
    expect: {
      voices: {
        S1: "[F#3,A3,C4,D4]:1 | [G3,B3,D4]:1 | [B3,D4,F4,Ab4]:1 | [C4,E4,G4]:1",
      },
      chordTexts: ["D7/F♯", "G", "B°7", "C"],
      romanTexts: ["V65/V", "V", "vii°7", "I"],
      abc: ['"_V65/V"', '"_vii°7"'],
    },
  },
  {
    name: "163 ♭VII and iiø7 in C: numeral glyphs",
    code: 'note("<[d4,f4,ab4,c5] [g3,b3,d4,f4] [bb3,d4,f4] [c4,e4,g4]>")',
    bars: 4,
    key: {
      tonic: "C",
      mode: "major",
    },
    chords: [
      {
        bar: 0,
        beat: 1,
        symbol: "Dm7b5",
      },
      {
        bar: 1,
        beat: 1,
        symbol: "G7",
      },
      {
        bar: 2,
        beat: 1,
        symbol: "Bb",
      },
      {
        bar: 3,
        beat: 1,
        symbol: "C",
      },
    ],
    romans: [
      {
        bar: 0,
        beat: 1,
        rn: "iih7",
      },
      {
        bar: 1,
        beat: 1,
        rn: "V7",
      },
      {
        bar: 2,
        beat: 1,
        rn: "bVII",
      },
      {
        bar: 3,
        beat: 1,
        rn: "I",
      },
    ],
    expect: {
      voices: {
        S1: "[D4,F4,Ab4,C5]:1 | [G3,B3,D4,F4]:1 | [Bb3,D4,F4]:1 | [C4,E4,G4]:1",
      },
      chordTexts: ["Dm7♭5", "G7", "B♭", "C"],
      romanTexts: ["iiø7", "V7", "♭VII", "I"],
      abc: ['"_iiø7"', '"_♭VII"'],
    },
  },
  {
    name: "164 a label inside a triplet is drawn at the note sounding there (warns), the triplet stays whole",
    code: 'note("[c4 d4 e4]@2 f4@2")',
    bars: 1,
    key: {
      tonic: "C",
      mode: "major",
    },
    chords: [
      {
        bar: 0,
        beat: 1,
        symbol: "C",
      },
      {
        bar: 0,
        beat: 2,
        symbol: "Dm",
      },
      {
        bar: 0,
        beat: 3,
        symbol: "F",
      },
    ],
    expect: {
      voices: {
        S1: "(3:2 C4:4 D4:4 E4:4) F4:2",
      },
      chordTexts: ["C", "Dm", "F"],
      warnings: ["abcjs-limit"],
    },
  },
  {
    name: "165 a numeral inside a bar-wide quintuplet does not break it into a snapped figure",
    code: 'note("c4 d4 e4 f4 g4")',
    bars: 1,
    key: {
      tonic: "C",
      mode: "major",
    },
    romans: [
      {
        bar: 0,
        beat: 1,
        rn: "I",
      },
      {
        bar: 0,
        beat: 2,
        rn: "ii",
      },
    ],
    expect: {
      voices: {
        S1: "(5:4 C4:4 D4:4 E4:4 F4:4 G4:4)",
      },
      romanTexts: ["I", "ii"],
      warnings: ["abcjs-limit"],
    },
  },
  {
    name: "166 chord symbols spell the chord: C sharp major with E sharp, D augmented with A sharp",
    code: 'note("[61,65,68]@2 [62,66,70]@2")',
    bars: 1,
    key: {
      tonic: "C",
      mode: "major",
    },
    chords: [
      {
        bar: 0,
        beat: 1,
        symbol: "C#",
      },
      {
        bar: 0,
        beat: 3,
        symbol: "Daug",
      },
    ],
    expect: {
      voices: {
        S1: "[C#4,E#4,G#4]:2 [D4,F#4,A#4]:2",
      },
      chordTexts: ["C♯", "D+"],
    },
  },
  {
    name: "167 a cluster with seconds and accidentals in the bass clef: F sharp, G sharp, A, B",
    code: 'note("[f#2,g#2,a2,b2] [e2,f#2,g2,b2]")',
    bars: 1,
    key: {
      tonic: "E",
      mode: "minor",
    },
    staff: "bass",
    expect: {
      voices: {
        S1: "[F#2,G#2,A2,B2]:2 [E2,F#2,G2,B2]:2",
      },
      staves: ["S1:bass"],
    },
  },
  {
    name: "168 a key change on beat 3: the G major signature written inside the bar",
    code: 'note("<[c4 d4 e4 f4] [g4 a4 b4 c5 d5 e5 f#5 g5]>")',
    bars: 2,
    key: {
      tonic: "C",
      mode: "major",
    },
    keyChanges: [
      {
        bar: 1,
        beat: 3,
        key: {
          tonic: "G",
          mode: "major",
        },
      },
    ],
    expect: {
      voices: {
        S1: "C4:4 D4:4 E4:4 F4:4 | G4:8 A4:8 B4:8 C5:8 D5:8 E5:8 F#5:8 G5:8",
      },
      abc: ["!class=oak-e7!c2 [K:G] !class=oak-e8!d2"],
    },
  },
  {
    name: "169 a key change inside a bar restates a letter altered before it (F sharp, then F in F major)",
    code: 'note("<[c4 f#4 g4 f4] [g4 f#4 f4 bb4]>")',
    bars: 2,
    key: {
      tonic: "C",
      mode: "major",
    },
    keyChanges: [
      {
        bar: 1,
        beat: 3,
        key: {
          tonic: "F",
          mode: "major",
        },
      },
    ],
    expect: {
      voices: {
        S1: "C4:4 F#4:4 G4:4 F4:4 | G4:4 F#4:4 F4:4 Bb4:4",
      },
      abc: ["!class=oak-e5!^F4 [K:F] !class=oak-e6!=F4 !class=oak-e7!B4 |]"],
    },
  },
  {
    name: "170 a key change inside a bar splits a held note and moves both staves of a grand staff",
    code: 'mel: note("<[e4 f4 g4@2] [a4@2 f#4 g4]>")\nbass: note("<c3 [c3@3 d3]>")',
    bars: 2,
    key: {
      tonic: "C",
      mode: "major",
    },
    staff: "grand",
    split: "track",
    keyChanges: [
      {
        bar: 1,
        beat: 3,
        key: {
          tonic: "G",
          mode: "major",
        },
      },
    ],
    expect: {
      voices: {
        RH: "E4:4 F4:4 G4:2 | A4:2 F#4:4 G4:4",
        LH: "C3:1 | C3:2~ C3:4 D3:4",
      },
      staves: ["RH:treble", "LH:bass"],
      abc: ["!class=oak-e3!A8 [K:G] !class=oak-e4!F4", "!class=oak-e7!C,8- [K:G] !class=oak-e7!C,4"],
    },
  },
  {
    name: "171 two tracks in two keys on one staff: the majority's signature, the other key's notes spelled in it",
    code: 'mel: n("0 1 2 3 4 3 2 1").scale("Db4:major")\nharm: n("[2 ~ ~ ~] [2 ~ ~ ~]").scale("D4:major")',
    bars: 1,
    staff: "treble",
    key: {
      tonic: "Db",
      mode: "major",
    },
    trackKeys: {
      harm: {
        key: {
          tonic: "D",
          mode: "major",
        },
      },
    },
    expect: {
      voices: {
        S1: "[Db4,F#4]:8 Eb4:8 F4:8 Gb4:8 [F#4,Ab4]:8 Gb4:8 F4:8 Eb4:8",
      },
      abc: ["K:Db\n", "[D^F]2", "[^FA]2"],
    },
  },
  {
    name: "172 two tracks in two keys, the other key in the majority: the staff takes its signature",
    code: 'mel: n("0 3 4 0").scale("C5:major")\nharm: n("[0,2] [6,8] [4,6] [0,2]").scale("G3:major")',
    bars: 1,
    staff: "treble",
    key: {
      tonic: "C",
      mode: "major",
    },
    trackKeys: {
      harm: {
        key: {
          tonic: "G",
          mode: "major",
        },
      },
    },
    expect: {
      voices: {
        S1: "[G3,B3,C5]:4 [F#4,A4,F5]:4 [D4,F#4,G5]:4 [G3,B3,C5]:4",
      },
      abc: ["K:G\n", "[FA=f]4"],
    },
  },
  {
    name: "173 a drum count-in before the pickup is not engraved; bar 0 is short on both staves",
    code: 'drums: s("<[hh hh hh ~] [bd hh sd hh]!3>")\nmel: n("<[~ ~ ~ 4] [7 ~ 6 ~] [5 4 2 ~] [0@4]>").scale("C4:major")',
    bars: 4,
    key: {
      tonic: "C",
      mode: "major",
    },
    pickup: {
      units: [1, 1],
    },
    expect: {
      voices: {
        S1: "G4:4 | C5:4 r:4 B4:4 r:4 | A4:4 G4:4 E4:4 r:4 | C4:1",
        DR: "r:4 | r:4 hh:4 sd:4 hh:4 | r:4 hh:4 sd:4 hh:4 | r:4 hh:4 sd:4 hh:4",
        DRv2: " | bd:4 r:4 r:2 | bd:4 r:4 r:2 | bd:4 r:4 r:2",
      },
      staves: ["S1:treble", "DR:perc"],
    },
  },
  {
    name: "174 pickup on a grand staff: the bass rests through bar 0, both hands start short",
    code: 'mel: n("<[~ ~ 4 5] [7@2 4@2] [5 4 2 1] [0@4]>").scale("C4:major")\nbass: n("<~ [0,4] [3,5] [0,4]>").scale("C3:major")',
    bars: 4,
    key: {
      tonic: "C",
      mode: "major",
    },
    staff: "grand",
    split: "track",
    pickup: {
      units: [2, 1],
    },
    chords: [
      {
        bar: 1,
        beat: 1,
        symbol: "C",
      },
      {
        bar: 2,
        beat: 1,
        symbol: "F",
      },
      {
        bar: 3,
        beat: 1,
        symbol: "C",
      },
    ],
    romans: [
      {
        bar: 1,
        beat: 1,
        rn: "I",
      },
      {
        bar: 2,
        beat: 1,
        rn: "IV",
      },
      {
        bar: 3,
        beat: 1,
        rn: "I",
      },
    ],
    expect: {
      voices: {
        RH: "G4:4 A4:4 | C5:2 G4:2 | A4:4 G4:4 E4:4 D4:4 | C4:1",
        LH: "r:2 | [C3,G3]:1 | [F3,A3]:1 | [C3,G3]:1",
      },
      staves: ["RH:treble", "LH:bass"],
      chordTexts: ["C", "F", "C"],
      romanTexts: ["I", "IV", "I"],
    },
  },
  {
    name: "175 6/8 with a one-eighth pickup",
    code: 'mel: n("<[~ ~ ~ ~ ~ 4] [7 ~ 6 5 ~ 4] [2 ~ ~ 0 ~ ~]>").scale("D4:major")',
    bars: 3,
    meter: "6/8",
    key: {
      tonic: "D",
      mode: "major",
    },
    staff: "lead",
    pickup: {
      units: [1, 3],
    },
    chords: [
      {
        bar: 1,
        beat: 1,
        symbol: "D",
      },
      {
        bar: 2,
        beat: 1,
        symbol: "A",
      },
      {
        bar: 2,
        beat: 2,
        symbol: "D",
      },
    ],
    expect: {
      voices: {
        S1: "A4:8 | D5:8 r:8 C#5:8 B4:8 r:8 A4:8 | F#4:8 r:8 r:8 D4:8 r:8",
      },
      chordTexts: ["D", "A", "D"],
    },
  },
  {
    name: "176 U07.L03 chord tones on the strong beats: a lead sheet over I V vi IV",
    code: 'mel: n("<[4 3 2 3] [4 ~ 1 2] [2 1 0 1] [0 ~ ~ ~]>").scale("C4:major")',
    bars: 4,
    key: {
      tonic: "C",
      mode: "major",
    },
    staff: "lead",
    chords: [
      {
        bar: 0,
        beat: 1,
        symbol: "C",
      },
      {
        bar: 1,
        beat: 1,
        symbol: "G",
      },
      {
        bar: 2,
        beat: 1,
        symbol: "Am",
      },
      {
        bar: 3,
        beat: 1,
        symbol: "F",
      },
    ],
    expect: {
      voices: {
        S1: "G4:4 F4:4 E4:4 F4:4 | G4:4 r:4 D4:4 E4:4 | E4:4 D4:4 C4:4 D4:4 | C4:4 r:4 r:2",
      },
      chordTexts: ["C", "G", "Am", "F"],
    },
  },
  {
    name: "177 U07.L02 a motif in sequence over I V vi IV (scaleTranspose)",
    code: 'mel: n("0 2 4 2").scale("C4:major").scaleTranspose("<0 4 5 3>")',
    bars: 4,
    key: {
      tonic: "C",
      mode: "major",
    },
    staff: "lead",
    chords: [
      {
        bar: 0,
        beat: 1,
        symbol: "C",
      },
      {
        bar: 1,
        beat: 1,
        symbol: "G",
      },
      {
        bar: 2,
        beat: 1,
        symbol: "Am",
      },
      {
        bar: 3,
        beat: 1,
        symbol: "F",
      },
    ],
    expect: {
      voices: {
        S1: "C4:4 E4:4 G4:4 E4:4 | G4:4 B4:4 D5:4 B4:4 | A4:4 C5:4 E5:4 C5:4 | F4:4 A4:4 C5:4 A4:4",
      },
      chordTexts: ["C", "G", "Am", "F"],
    },
  },
  {
    name: "178 U06.L04 cadences: I IV I V | I IV V I on the grand staff, numerals under the bass",
    code: 'chords: n("<0 3 0 4 0 3 4 0>").add(n("[0,2,4]")).scale("C3:major")\nmel: n("<[2 ~ 4 ~] [5 ~ 3 ~] [4 ~ 2 ~] [1 ~ ~ ~] [2 ~ 4 ~] [5 ~ 3 ~] [1 ~ 4 ~] [0 ~ ~ ~]>").scale("C4:major")',
    bars: 8,
    key: {
      tonic: "C",
      mode: "major",
    },
    staff: "grand",
    split: "track",
    trackClefs: {
      chords: "bass",
      mel: "treble",
    },
    chords: [
      {
        bar: 0,
        beat: 1,
        symbol: "C",
      },
      {
        bar: 1,
        beat: 1,
        symbol: "F",
      },
      {
        bar: 2,
        beat: 1,
        symbol: "C",
      },
      {
        bar: 3,
        beat: 1,
        symbol: "G",
      },
      {
        bar: 4,
        beat: 1,
        symbol: "C",
      },
      {
        bar: 5,
        beat: 1,
        symbol: "F",
      },
      {
        bar: 6,
        beat: 1,
        symbol: "G",
      },
      {
        bar: 7,
        beat: 1,
        symbol: "C",
      },
    ],
    romans: [
      {
        bar: 0,
        beat: 1,
        rn: "I",
      },
      {
        bar: 1,
        beat: 1,
        rn: "IV",
      },
      {
        bar: 2,
        beat: 1,
        rn: "I",
      },
      {
        bar: 3,
        beat: 1,
        rn: "V",
      },
      {
        bar: 4,
        beat: 1,
        rn: "I",
      },
      {
        bar: 5,
        beat: 1,
        rn: "IV",
      },
      {
        bar: 6,
        beat: 1,
        rn: "V",
      },
      {
        bar: 7,
        beat: 1,
        rn: "I",
      },
    ],
    expect: {
      voices: {
        RH: "E4:4 r:4 G4:4 r:4 | A4:4 r:4 F4:4 r:4 | G4:4 r:4 E4:4 r:4 | D4:4 r:4 r:2 | E4:4 r:4 G4:4 r:4 | A4:4 r:4 F4:4 r:4 | D4:4 r:4 G4:4 r:4 | C4:4 r:4 r:2",
        LH: "[C3,E3,G3]:1 | [F3,A3,C4]:1 | [C3,E3,G3]:1 | [G3,B3,D4]:1 | [C3,E3,G3]:1 | [F3,A3,C4]:1 | [G3,B3,D4]:1 | [C3,E3,G3]:1",
      },
      staves: ["RH:treble", "LH:bass"],
      chordTexts: ["C", "F", "C", "G", "C", "F", "G", "C"],
      romanTexts: ["I", "IV", "I", "V", "I", "IV", "V", "I"],
    },
  },
  {
    name: "179 U06.L02 numerals in G: I vi ii V, the F sharp in V",
    code: 'chords: n("<0 5 1 4>").add(n("[0,2,4]")).scale("G3:major")',
    bars: 4,
    key: {
      tonic: "G",
      mode: "major",
    },
    staff: "bass",
    chords: [
      {
        bar: 0,
        beat: 1,
        symbol: "G",
      },
      {
        bar: 1,
        beat: 1,
        symbol: "Em",
      },
      {
        bar: 2,
        beat: 1,
        symbol: "Am",
      },
      {
        bar: 3,
        beat: 1,
        symbol: "D",
      },
    ],
    romans: [
      {
        bar: 0,
        beat: 1,
        rn: "I",
      },
      {
        bar: 1,
        beat: 1,
        rn: "vi",
      },
      {
        bar: 2,
        beat: 1,
        rn: "ii",
      },
      {
        bar: 3,
        beat: 1,
        rn: "V",
      },
    ],
    expect: {
      voices: {
        S1: "[G3,B3,D4]:1 | [E4,G4,B4]:1 | [A3,C4,E4]:1 | [D4,F#4,A4]:1",
      },
      staves: ["S1:bass"],
      chordTexts: ["G", "Em", "Am", "D"],
      romanTexts: ["I", "vi", "ii", "V"],
    },
  },
  {
    name: "180 E flat major sevenths: Ebmaj7 Cm7 Fm7 Bb7, flats in the symbols",
    code: 'chords: n("<0 5 1 4>").add(n("[0,2,4,6]")).scale("Eb3:major")',
    bars: 4,
    key: {
      tonic: "Eb",
      mode: "major",
    },
    staff: "bass",
    chords: [
      {
        bar: 0,
        beat: 1,
        symbol: "Ebmaj7",
      },
      {
        bar: 1,
        beat: 1,
        symbol: "Cm7",
      },
      {
        bar: 2,
        beat: 1,
        symbol: "Fm7",
      },
      {
        bar: 3,
        beat: 1,
        symbol: "Bb7",
      },
    ],
    romans: [
      {
        bar: 0,
        beat: 1,
        rn: "Imaj7",
      },
      {
        bar: 1,
        beat: 1,
        rn: "vi7",
      },
      {
        bar: 2,
        beat: 1,
        rn: "ii7",
      },
      {
        bar: 3,
        beat: 1,
        rn: "V7",
      },
    ],
    expect: {
      voices: {
        S1: "[Eb3,G3,Bb3,D4]:1 | [C4,Eb4,G4,Bb4]:1 | [F3,Ab3,C4,Eb4]:1 | [Bb3,D4,F4,Ab4]:1",
      },
      staves: ["S1:bass"],
      chordTexts: ["E♭maj7", "Cm7", "Fm7", "B♭7"],
      romanTexts: ["Imaj7", "vi7", "ii7", "V7"],
    },
  },
  {
    name: "181 U07.L06 question and answer: two phrases, half cadence then full",
    code: 'mel: n("<[0 2 4 5] [5 ~ 3 ~] [2 4 2 0] [1 ~ ~ ~] [0 2 4 5] [5 ~ 3 ~] [4 3 1 ~] [0 ~ ~ ~]>").scale("C4:major")',
    bars: 8,
    key: {
      tonic: "C",
      mode: "major",
    },
    staff: "lead",
    chords: [
      {
        bar: 0,
        beat: 1,
        symbol: "C",
      },
      {
        bar: 1,
        beat: 1,
        symbol: "F",
      },
      {
        bar: 2,
        beat: 1,
        symbol: "C",
      },
      {
        bar: 3,
        beat: 1,
        symbol: "G",
      },
      {
        bar: 4,
        beat: 1,
        symbol: "C",
      },
      {
        bar: 5,
        beat: 1,
        symbol: "F",
      },
      {
        bar: 6,
        beat: 1,
        symbol: "G",
      },
      {
        bar: 7,
        beat: 1,
        symbol: "C",
      },
    ],
    expect: {
      voices: {
        S1: "C4:4 E4:4 G4:4 A4:4 | A4:4 r:4 F4:4 r:4 | E4:4 G4:4 E4:4 C4:4 | D4:4 r:4 r:2 | C4:4 E4:4 G4:4 A4:4 | A4:4 r:4 F4:4 r:4 | G4:4 F4:4 D4:4 r:4 | C4:4 r:4 r:2",
      },
      chordTexts: ["C", "F", "C", "G", "C", "F", "G", "C"],
      barNumbers: [5],
    },
  },
  // --- Wave 5 (corpus-w5.ts) ----------------------------------------------------------------------
  ...CORPUS_W5,
];
