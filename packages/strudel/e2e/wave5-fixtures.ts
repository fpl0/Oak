// Music the Wave 5 sound specs play (wave5.pw.ts), checked in headless Strudel by wave5-fixtures.test.ts.

/**
 * A full C3 "Verse–Chorus Demo" arrangement as a learner might finish it: verse, chorus, verse, chorus, outro
 * (8 + 8 + 8 + 8 + 4 bars) at 96 BPM, 36 bars = 90 seconds, one `arrange()` per labelled track (STYLE §10). The
 * chorus brings sounds and pitches the verse never plays (open hats, a tambourine, a crash, strings, the crunch
 * guitar doubling the tune an octave down), so its first notes are exactly what a preloader can miss.
 */
export const C3_ARRANGEMENT = [
  "setcpm(96/4)",
  'const kickVerse = s("bd ~ ~ bd ~ ~ bd ~")',
  'const kickChorus = s("bd ~ bd ~ bd ~ bd ~")',
  'const snareVerse = s("~ sd ~ sd")',
  'const snareChorus = s("~ sd ~ [sd sd]")',
  'const hatsVerse = s("hh*8").gain(.45)',
  'const hatsChorus = s("[~ oh]*4").gain(.4)',
  'const percChorus = s("<cr ~ ~ ~>, ~ tb ~ tb").gain(.45)',
  'const bassVerse = n("<[0 ~ 0 4] [5 ~ 5 4] [3 ~ 3 2] [4 ~ 4 6]>").scale("C2:major")',
  'const bassChorus = n("<[3*4] [4*4] [0*4] [5*4]>").scale("C2:major")',
  'const chordsVerse = chord("<C Am F G>").voicing().struct("x ~ x ~")',
  'const chordsChorus = chord("<F G C Am>").voicing().struct("x x x x")',
  'const padChorus = chord("<F G C Am>").voicing()',
  'const melVerse = n("<[4 ~ 2 4] [5 ~ 4 2] [3 ~ 2 0] [1 ~ ~ ~]>").scale("C4:major")',
  'const melChorus = n("<[7 ~ 6 7] [8 ~ 7 5] [7 ~ 4 2] [4 ~ ~ ~]>").scale("C4:major")',
  'const gtrChorus = n("<[7 ~ 6 7] [8 ~ 7 5] [7 ~ 4 2] [4 ~ ~ ~]>").scale("C3:major")',
  "kick: arrange([8, kickVerse], [8, kickChorus], [8, kickVerse], [8, kickChorus], [4, kickVerse])",
  "snare: arrange([8, snareVerse], [8, snareChorus], [8, snareVerse], [8, snareChorus], [4, silence])",
  "hats: arrange([8, hatsVerse], [8, hatsChorus], [8, hatsVerse], [8, hatsChorus], [4, hatsVerse])",
  "perc: arrange([8, silence], [8, percChorus], [8, silence], [8, percChorus], [4, silence])",
  'bass: arrange([8, bassVerse], [8, bassChorus], [8, bassVerse], [8, bassChorus], [4, bassVerse]).s("ebass").lpf(800).gain(.9)',
  'chords: arrange([8, chordsVerse], [8, chordsChorus], [8, chordsVerse], [8, chordsChorus], [4, chordsVerse]).s("rhodes").gain(.5).room(.25)',
  'pad: arrange([8, silence], [8, padChorus], [8, silence], [8, padChorus], [4, silence]).s("strings").gain(.3)',
  'mel: arrange([8, melVerse], [8, melChorus], [8, melVerse], [8, melChorus], [4, silence]).s("piano").gain(.8)',
  'gtr: arrange([8, silence], [8, gtrChorus], [8, silence], [8, gtrChorus], [4, silence]).s("crunch").gain(.35)',
].join("\n");

/** The arrangement's sections in bars, and where the first chorus starts (bar 9 = cycle 8). */
export const C3_SECTIONS = [8, 8, 8, 8, 4] as const;
export const C3_BARS = 36;
export const C3_CHORUS_CYCLE = 8;

/** Sounds the chorus brings that the verse never plays. */
export const C3_CHORUS_ONLY = ["oh", "tb", "cr", "strings", "crunch"] as const;

/** U08.L05's hook bass under the doo-wop loop (I vi IV V): roots on 1 and 3, the 5th above on 4 (content/specs/U08.ts). */
export const U08_BASS_LINE = 'n("<[0 ~ 0 4] [5 ~ 5 9] [3 ~ 3 7] [4 ~ 4 8]>").scale("C2:major")';

/** The four bass tones U08.L05 compares, as the learner writes them. */
export const BASS_TONES = [
  { id: "ebass", code: '.s("ebass")' },
  { id: "fingerbass", code: '.s("fingerbass")' },
  { id: "upright", code: '.s("upright")' },
  { id: "synthbass", code: '.s("sawtooth").lpf(600)' },
] as const;

/** E1 to G3 (contracts: the bass register U08 writes in, the open low E string to the G an octave and a half up). */
export const BASS_NOTES = [28, 33, 36, 40, 45, 50, 55] as const;

/** U11's riff and comping sounds and the blue notes they must keep in tune (E blues: E G A B♭ B D). */
export const BLUES_SOUNDS = ["crunch", "cleangtr", "piano", "organ"] as const;
export const BLUES_NOTES = [40, 43, 45, 46, 52, 55, 57, 58, 64, 67, 70] as const;
/** C7, F7 and G7 as U11.L04 voices them (`[0,2,4,6]` on degrees, close position in the middle register). */
export const DOMINANT_SEVENTHS = [
  [48, 52, 55, 58],
  [53, 57, 60, 63],
  [55, 59, 62, 65],
] as const;
