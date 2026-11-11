/** The golden corpus for the spike: [name, Strudel code, bars]. The first 10 are the ones S4 requires. */
export const REQUIRED: [string, string, number][] = [
  ["01 four quarters", 'note("c4 d4 e4 f4")', 1],
  ["02 eighth pair in a beat", 'note("c4 [d4 e4] f4 g4")', 1],
  ["03 dotted half + quarter", 'note("c4@3 d4")', 1],
  ["04 alternation over 2 bars", 'note("<c4 e4> g4")', 2],
  ["05 rests", 'note("c4 ~ d4 ~")', 1],
  ["06 triplet in half a bar", 'note("c4*3 e4")', 1],
  ["07 D major by key", 'n("0 2 4 6").scale("D4:major")', 1],
  ["08 chord stack", 'note("[c4,e4,g4] [f4,a4,c5]")', 1],
  ["09 syncopated tie", 'note("~ c4@1.5 d4@1.5")', 1],
  ["10 F# major scale", 'n("0 1 2 3 4 5 6 7").scale("F#4:major")', 1],
];

export const EXTRA: [string, string, number][] = [
  ["11 cross-bar tie + bar-scoped accidentals", 'note("f#4@5 f#4 f4 f#4").slow(2)', 2],
  ["12 eighth triplets by beat", 'note("[c4 d4 e4] f4 [g4 a4 b4] c5")', 1],
  ["13 quintuplet in a beat", 'note("[c4 d4 e4 f4 g4] a4 b4 c5")', 1],
  ["14 sextuplet beat -> two 16th triplets", 'note("[c4 d4 e4 f4 g4 a4] c5 ~ c5")', 1],
  ["15 s/f accidentals + default octave", 'note("cs4 ef4 bf3 c")', 1],
  ["16 not notatable: 11 in a bar (approximate)", 'note("c4*11")', 1],
  ["17 nested triplet in a bar-wide triplet -> one 9:8 ratio", 'note("[c4 [d4 d4] e4] f4 g4")', 1],
  ["17b quarter triplet with a split middle", 'note("[c4 [d4 d4] e4] f4")', 1],
  ["18 16ths and a dotted figure", 'note("c4 d4 e4 f4 g4@3 a4 b4@2 c5@2 ~@4").fast(1)', 1],
  ["19 long note across two bars", 'note("c4@7 d4").slow(2)', 2],
  ["20 flat key by scale", 'n("0 1 2 3").scale("Bb3:major")', 1],
];
