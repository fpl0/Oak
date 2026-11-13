// Wave 5 capstone pieces for the browser specs and the unit tests (not a spec): one passing piece per compose
// capstone (C3 Verse–Chorus Demo, C4 Minor Indie Ballad, C5 12-Bar Shuffle, pop flavour), the steps a learner
// takes on the way, and the near misses each spec shows. Every piece is graded against the brief in
// content/capstones.ts by `w5-pieces.test.ts` with the real headless grader, so the specs never assume a pass the
// grader would not give. Music checked with `bun run theory`: C3 in C major (verse C Am F G, chorus F G C C); C4
// in A minor (i–VI–III–VII Am F C G; the chorus lands E (V, with G♯) → Am); C5 a 12-bar blues in C, dominant
// sevenths C7 F7 G7, bar 12 on G7 (V), the riff with E♭ (♭3) moved with the changes.

// --- C3 ------------------------------------------------------------------------------------------

/** C3.S1: groove and changes for verse and chorus (no melody yet), 32 bars at 80 BPM = 96 s. */
export const C3_GROOVE = `setcpm(80/4)

const chordsVerse = chord("<C Am F G>").voicing()
const chordsChorus = chord("<F G C C>").voicing()
const bassVerse = note("<[c2 ~ c2 ~] [a1 ~ a1 ~] [f1 ~ f1 ~] [g1 ~ g1 ~]>")
const bassChorus = note("<[f1 ~ f1 ~] [g1 ~ g1 ~] [c2 ~ c2 ~] [c2 ~ c2 ~]>")

chords: arrange([8, chordsVerse], [8, chordsChorus], [8, chordsVerse], [8, chordsChorus]).s("piano")
bass: arrange([8, bassVerse], [8, bassChorus], [8, bassVerse], [8, bassChorus]).s("sawtooth")
kick: s("bd ~ bd ~")
snare: s("~ sd ~ sd")
hats: s("hh*8").gain(.4)`;

const C3_MELODIES = `const melVerse = n("<[0 ~ 2 ~] [0 ~ ~ ~] [3 ~ 2 ~] [1 ~ ~ ~]>").scale("C4:major")
const melChorus = n("<[7 9 8 7] [6 7 8 9] [9 8 7 5] [7 ~ 7 ~]>").scale("C4:major")`;

/** The whole demo: V C V C, a chorus higher and busier than the verse, the bass on the kick, 96 seconds. */
export const C3_FULL = C3_GROOVE.replace(
  "\n\nchords: arrange(",
  `\n${C3_MELODIES}\n\nchords: arrange(`,
).replace(
  "\nkick:",
  `\nmel: arrange([8, melVerse], [8, melChorus], [8, melVerse], [8, melChorus]).s("piano")\nkick:`,
);

/** The same piece at 120 BPM: 32 bars are 64 seconds, short of 90. */
export const C3_FAST = C3_FULL.replace("setcpm(80/4)", "setcpm(120/4)");

/** The chorus melody moved down to the verse's register and rhythm: the sections differ only in their chords. */
export const C3_FLAT_CHORUS = C3_FULL.replace(
  'n("<[7 9 8 7] [6 7 8 9] [9 8 7 5] [7 ~ 7 ~]>")',
  'n("<[0 ~ 2 ~] [0 ~ ~ ~] [3 ~ 2 ~] [1 ~ ~ ~]>")',
)
  .replace('chord("<F G C C>")', 'chord("<C Am F G>")')
  .replace(
    'note("<[f1 ~ f1 ~] [g1 ~ g1 ~] [c2 ~ c2 ~] [c2 ~ c2 ~]>")',
    'note("<[c2 ~ c2 ~] [a1 ~ a1 ~] [f1 ~ f1 ~] [g1 ~ g1 ~]>")',
  );

// --- C4 ------------------------------------------------------------------------------------------

/** C4.S1: the Aeolian verse i–VI–III–VII with a melody on ♭3 and ♭6, sections arranged. */
export const C4_VERSE = `setcpm(76/4)

const chordsVerse = chord("<Am F C G>").voicing()
const chordsChorus = chord("<F G C Am>").voicing()
const melVerse = n("<[4 ~ 2 ~] [5 ~ 4 ~] [2 ~ 0 ~] [1 ~ ~ ~]>").scale("A4:minor")
const melChorus = n("<[5 4 5 ~] [6 5 4 ~] [4 ~ 2 ~] [2@2 ~ ~]>").scale("A4:minor")

chords: arrange([4, chordsVerse], [4, chordsChorus], [4, chordsVerse], [4, chordsChorus]).s("piano")
mel: arrange([4, melVerse], [4, melChorus], [4, melVerse], [4, melChorus]).s("piano")
drums: s("bd ~ sd ~, hh*8")`;

/** C4.S2: the chorus lands on the major V (E, with G♯) and then i, the melody home on 1. */
export const C4_FULL = C4_VERSE.replace('chord("<F G C Am>")', 'chord("<F G E Am>")').replace(
  "[4 ~ 2 ~] [2@2 ~ ~]",
  "[4 ~ 1 ~] [0@2 ~ ~]",
);

// --- C5 ------------------------------------------------------------------------------------------

const CHORUS = "C7 F7 C7 C7 F7 F7 C7 C7 G7 F7 C7 G7".split(" ");
const RIFF: Record<string, string> = { C7: "[c4 eb4 f4 g4]", F7: "[f4 ab4 bb4 c5]", G7: "[g4 bb4 c5 d5]" };
const ANSWER: Record<string, string> = { C7: "[g4 f4 eb4 c4]", F7: "[c5 bb4 ab4 f4]", G7: "[d5 c5 bb4 g4]" };
const ROOT: Record<string, string> = { C7: "c2", F7: "f2", G7: "g2" };

function c5(choruses: 1 | 2): string {
  const all = Array.from({ length: choruses }, () => CHORUS).flat();
  const mel = all.map((c, i) => (i < CHORUS.length ? RIFF : ANSWER)[c] ?? RIFF.C7).join(" ");
  return `setcpm(112/4)

const changes = "<${all.join(" ")}>"

hats: s("hh*8").gain(.5).swingBy(1/3, 4)
kick: s("bd ~ sd ~")
chords: chord(changes).voicing().s("piano")
bass: note("<${all.map((c) => ROOT[c] ?? "c2").join(" ")}>").s("sawtooth")
mel: note("<${mel}>").swingBy(1/3, 4).s("piano")`;
}

/** C5.S1: one chorus of dominant sevenths, swung hats, a riff that moves with the changes. */
export const C5_ONE_CHORUS = c5(1);
/** C5.S2: the second chorus answers the riff (call and response); bar 12 turns around on G7. */
export const C5_FULL = c5(2);
/** Straight hats: the shuffle is gone. */
export const C5_STRAIGHT = C5_FULL.replace(
  'hats: s("hh*8").gain(.5).swingBy(1/3, 4)',
  'hats: s("hh*8").gain(.5)',
);
/** Bar 12 on C7 in both choruses: no turnaround. */
export const C5_NO_TURNAROUND = C5_FULL.replace(
  "C7 F7 C7 C7 F7 F7 C7 C7 G7 F7 C7 G7 C7 F7 C7 C7 F7 F7 C7 C7 G7 F7 C7 G7",
  "C7 F7 C7 C7 F7 F7 C7 C7 G7 F7 C7 C7 C7 F7 C7 C7 F7 F7 C7 C7 G7 F7 C7 C7",
);
