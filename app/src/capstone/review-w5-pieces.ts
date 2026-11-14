// Beginner-written capstone pieces for the Wave 5 learner review (not a test file): three honest pieces and
// three or more plausible near misses for each of C3, C4 and C5, written the way a learner fresh from U09–U11
// would write them (their own const names, unarranged drums, hand-voiced chords, other keys and section lengths),
// not through content's piece builders. `review-w5.test.ts` grades each one exactly as the browser does.

export interface ReviewPiece {
  id: "C3" | "C4" | "C5";
  name: string;
  expect: "pass" | "fail";
  /** For a near miss: the rule ids that must fail (and only those). */
  unmet?: string[];
  code: string;
}

// --- C3 Verse–Chorus Demo -------------------------------------------------------------------------

/** G major, 84 BPM, the drums not arranged at all, the learner's own short const names. 32 bars = 91 s. */
const C3_G = `setcpm(84/4)

const chordsVerse = chord("<G Em C D>").voicing()
const chordsChorus = chord("<C D G G>").voicing()
const bassVerse = note("<g1 e1 c2 d2>").struct("x ~ x ~")
const bassChorus = note("<c2 d2 g1 g1>").struct("x ~ x ~")
const melVerse = n("<[0 ~ 2 ~] [4 ~ 2 ~] [0 ~ 1 ~] [1 ~ ~ ~]>").scale("G3:major")
const melChorus = n("<[7 ~ 8 7] [8 9 8 ~] [7 ~ 4 ~] [7 ~ ~ ~]>").scale("G3:major")

kick: s("bd ~ bd ~")
snare: s("~ sd ~ sd")
hats: s("hh*8").gain(.4)
chords: arrange([8, chordsVerse], [8, chordsChorus], [8, chordsVerse], [8, chordsChorus]).s("piano")
bass: arrange([8, bassVerse], [8, bassChorus], [8, bassVerse], [8, bassChorus]).s("ebass")
mel: arrange([8, melVerse], [8, melChorus], [8, melVerse], [8, melChorus]).s("piano")`;

/**
 * D major, 96 BPM, verse 8 and chorus 12 (40 bars = 100 s). The chorus keeps the verse's chords and tune and
 * contrasts only by its instruments: a pad comes in and the drums get busier.
 */
const C3_D_INSTRUMENTS = `setcpm(96/4)

const kickVerse = s("bd ~ bd ~")
const kickChorus = s("bd bd ~ bd")
const hatsVerse = s("hh*4").gain(.35)
const hatsChorus = s("[hh oh]*4").gain(.5)
const keysVerse = chord("<D Bm G A>").voicing()
const keysChorus = chord("<D Bm G A>").voicing()
const bassVerse = note("<d2 b1 g1 a1>").struct("x ~ x ~")
const bassChorus = note("<d2 b1 g1 a1>").struct("x x ~ x")
const melVerse = n("<[0 2 4 2] [1 ~ 0 ~] [2 ~ 4 ~] [3 ~ ~ ~]>").scale("D4:major")
const melChorus = melVerse
const padChorus = chord("<D Bm G A>").voicing()

kick: arrange([8, kickVerse], [12, kickChorus], [8, kickVerse], [12, kickChorus])
snare: s("~ sd ~ sd")
hats: arrange([8, hatsVerse], [12, hatsChorus], [8, hatsVerse], [12, hatsChorus])
keys: arrange([8, keysVerse], [12, keysChorus], [8, keysVerse], [12, keysChorus]).s("piano")
bass: arrange([8, bassVerse], [12, bassChorus], [8, bassVerse], [12, bassChorus]).s("ebass")
mel: arrange([8, melVerse], [12, melChorus], [8, melVerse], [12, melChorus]).s("piano")
pad: arrange([8, silence], [12, padChorus], [8, silence], [12, padChorus]).s("pad").gain(.5)`;

/** F major, 110 BPM, 12-bar sections (48 bars = 105 s), a funk groove whose kick const the bass shares. */
const C3_F_FUNK = `setcpm(110/4)

const groove = "x ~ ~ x ~ ~ x ~ ~ ~ x ~ ~ ~ ~ ~"
const groove2 = "x ~ x x ~ ~ x ~ x ~ x ~ ~ ~ x ~"
const drumsVerse = s("bd").struct(groove)
const drumsChorus = s("bd").struct(groove2)
const chordsVerse = chord("<F Dm Bb C>").voicing()
const chordsChorus = chord("<Bb C F F>").voicing()
const bassVerse = note("<f1 d2 bb1 c2>").struct(groove)
const bassChorus = note("<bb1 c2 f1 f1>").struct(groove2)
const melVerse = n("<[0 ~ 2 ~] [2 ~ 0 ~] [3 ~ 2 ~] [1 ~ ~ ~]>").scale("F4:major")
const melChorus = n("<[4 5 4 2] [5 6 5 4] [7 ~ 4 ~] [4 ~ ~ ~]>").scale("F4:major")

kick: arrange([12, drumsVerse], [12, drumsChorus], [12, drumsVerse], [12, drumsChorus])
snare: s("~ sd ~ sd")
hats: s("hh*16").gain(.3)
chords: arrange([12, chordsVerse], [12, chordsChorus], [12, chordsVerse], [12, chordsChorus]).s("organ")
bass: arrange([12, bassVerse], [12, bassChorus], [12, bassVerse], [12, bassChorus]).s("ebass")
mel: arrange([12, melVerse], [12, melChorus], [12, melVerse], [12, melChorus]).s("piano")`;

// --- C4 Minor Indie Ballad ------------------------------------------------------------------------

/** 72 BPM, note names, the chorus Dm E Am Am, the tune's last note A over Am. */
const C4_NOTES = `setcpm(72/4)

const chordsVerse = chord("<Am F C G>").voicing()
const chordsChorus = chord("<Dm E Am Am>").voicing()
const bassVerse = note("<a1 f1 c2 g1>")
const bassChorus = note("<d2 e2 a1 a1>")
const melVerse = note("<[a3 ~ c4 ~] [c4 ~ a3 ~] [e4 ~ g4 ~] [d4 ~ ~ ~]>")
const melChorus = note("<[f4 ~ e4 d4] [e4 ~ g#4 ~] [a4 ~ e4 ~] [a3 ~ ~ ~]>")

drums: s("bd ~ sd ~, hh*4")
chords: arrange([8, chordsVerse], [8, chordsChorus], [8, chordsVerse], [8, chordsChorus]).s("piano")
bass: arrange([8, bassVerse], [8, bassChorus], [8, bassVerse], [8, bassChorus]).s("ebass")
mel: arrange([8, melVerse], [8, melChorus], [8, melVerse], [8, melChorus]).s("piano")`;

/** 64 BPM, 4-bar sections, every chord voiced by hand, the chorus tune on the harmonic minor scale (G♯). */
const C4_HARMONIC = `setcpm(64/4)

const chordsVerse = note("<[a2,c3,e3] [f2,a2,c3] [c3,e3,g3] [g2,b2,d3]>")
const chordsChorus = note("<[d3,f3,a3] [c3,e3,g3] [e3,g#3,b3] [a2,c3,e3]>")
const bassVerse = note("<a1 f1 c2 g1>")
const bassChorus = note("<d2 c2 e2 a1>")
const melVerse = n("<[0 2 ~ 2] [5 ~ 4 ~] [2 ~ 4 ~] [1 ~ ~ ~]>").scale("A3:minor")
const melChorus = n("<[7 5 3 ~] [4 2 ~ ~] [6 ~ 4 ~] [7 ~ ~ ~]>").scale("A3:harmonic:minor")

kick: s("bd ~ ~ ~")
snare: s("~ ~ sd ~")
chords: arrange([4, chordsVerse], [4, chordsChorus], [4, chordsVerse], [4, chordsChorus]).s("piano")
bass: arrange([4, bassVerse], [4, bassChorus], [4, bassVerse], [4, bassChorus]).s("upright")
mel: arrange([4, melVerse], [4, melChorus], [4, melVerse], [4, melChorus]).s("piano")`;

/** 88 BPM, verse and chorus once each (16 bars), the chorus F G E Am on acoustic guitar. */
const C4_VC = `setcpm(88/4)

const chordsVerse = chord("<Am F C G>").voicing()
const chordsChorus = chord("<F G E Am>").voicing()
const bassVerse = n("<0 5 2 6>").scale("A1:minor")
const bassChorus = n("<5 6 4 0>").scale("A1:minor")
const melVerse = n("<[4 ~ 2 ~] [5 ~ 4 ~] [2 ~ 0 ~] [1 ~ ~ ~]>").scale("A3:minor")
const melChorus = n("<[5 7 5 ~] [6 ~ 4 ~] [4 ~ 1 ~] [0 ~ ~ ~]>").scale("A3:minor")

drums: s("bd ~ sd ~, hh*8").gain(.8)
chords: arrange([8, chordsVerse], [8, chordsChorus]).s("acgtr")
bass: arrange([8, bassVerse], [8, bassChorus]).s("ebass").lpf(600)
mel: arrange([8, melVerse], [8, melChorus]).s("piano")`;

/** 88 BPM, verse twice then chorus once (V V C, 24 bars), the chorus F G E Am on acoustic guitar. */
export const C4_VVC = `setcpm(88/4)

const chordsVerse = chord("<Am F C G>").voicing()
const chordsChorus = chord("<F G E Am>").voicing()
const bassVerse = n("<0 5 2 6>").scale("A1:minor")
const bassChorus = n("<5 6 4 0>").scale("A1:minor")
const melVerse = n("<[4 ~ 2 ~] [5 ~ 4 ~] [2 ~ 0 ~] [1 ~ ~ ~]>").scale("A3:minor")
const melChorus = n("<[5 7 5 ~] [6 ~ 4 ~] [4 ~ 1 ~] [0 ~ ~ ~]>").scale("A3:minor")

drums: s("bd ~ sd ~, hh*8").gain(.8)
chords: arrange([8, chordsVerse], [8, chordsVerse], [8, chordsChorus]).s("acgtr")
bass: arrange([8, bassVerse], [8, bassVerse], [8, bassChorus]).s("ebass").lpf(600)
mel: arrange([8, melVerse], [8, melVerse], [8, melChorus]).s("piano")`;

// --- C5 12-Bar Shuffle ----------------------------------------------------------------------------

const STANDARD = "C7 C7 C7 C7 F7 F7 C7 C7 G7 F7 C7 G7";
const QUICK = "C7 F7 C7 C7 F7 F7 C7 C7 G7 F7 C7 G7";

const RIFF =
  "[c4 eb4 g4 ~] [c4 eb4 g4 ~] [c4 eb4 g4 ~] [c4 eb4 g4 ~] [f4 ab4 c5 ~] [f4 ab4 c5 ~] [c4 eb4 g4 ~] [c4 eb4 g4 ~] [g4 bb4 d5 ~] [f4 ab4 c5 ~] [c4 eb4 g4 ~] [g4 bb4 d5 ~]";
const ANSWER =
  "[c4 eb4 g4 ~] [g4 eb4 c4 ~] [c4 eb4 g4 ~] [g4 eb4 c4 ~] [f4 ab4 c5 ~] [c5 ab4 f4 ~] [c4 eb4 g4 ~] [g4 eb4 c4 ~] [g4 bb4 d5 ~] [c5 ab4 f4 ~] [c4 eb4 g4 ~] [d5 bb4 g4 ~]";

/** 100 BPM, Strudel's own `.swing(4)` on the hats, the riff arranged as a call and an answer chorus. */
const C5_SWING4 = `setcpm(100/4)

const changes = "<${STANDARD}>"
const riff = note("<${RIFF}>")
const answer = note("<${ANSWER}>")

kick: s("bd ~ bd ~")
snare: s("~ sd ~ sd")
hats: s("hh*8").swing(4).gain(.5)
chords: chord(changes).voicing().s("piano")
bass: note("<c2 c2 c2 c2 f2 f2 c2 c2 g2 f2 c2 g2>").s("ebass")
mel: arrange([12, riff], [12, answer]).s("piano")`;

const STEADY =
  "[0 1 2 3] [0 1 2 3] [0 1 2 3] [0 ~ ~ ~] [0 1 2 3] [0 1 2 3] [0 1 2 3] [0 ~ ~ ~] [0 1 2 3] [0 1 2 3] [0 1 2 3] [4 ~ ~ ~]";
// Half the bars repeat an earlier shape (6 of 12), the others each go their own way. Since d6 a bar of one note
// counts when its rhythm repeats (bars 4 and 12 here), so the restless bars differ in rhythm, not only in notes.
const RESTLESS =
  "[0 1 2 3] [0 1 2 3] [0 1 2 3] [0 ~ ~ ~] [3 ~ 2 1] [3 2 ~ 1] [2 1 ~ 0] [~ 0 ~ 2] [4 ~ 3 ~] [3 ~ ~ 2] [0 1 2 3] [4 ~ ~ ~]";

/** The quick change at 126 BPM: one drums line with a swung ride, the riff on the blues scale in n(). */
const C5_QUICK_RIDE = `setcpm(126/4)

const changes = "<${QUICK}>"
const riff = n("<${STEADY}>").scale("C4:blues")

drums: s("bd ~ sd ~, rd*8").swingBy(1/3, 4)
chords: chord(changes).voicing().s("rhodes")
bass: note("<c2 f2 c2 c2 f2 f2 c2 c2 g2 f2 c2 g2>").s("upright")
mel: arrange([12, riff], [12, riff]).swingBy(1/3, 4).s("rhodes")`;

/** 88 BPM, every seventh voiced by hand as a note stack, the choruses written as one 24-step line. */
const C7 = "[c3,e3,g3,bb3]";
const F7 = "[c3,f3,a3,eb4]";
const G7 = "[d3,f3,g3,b3]";
const HAND = [C7, C7, C7, C7, F7, F7, C7, C7, G7, F7, C7, G7].join(" ");
const C5_HAND = `setcpm(88/4)

kick: s("bd ~ bd ~")
snare: s("~ sd ~ sd")
hats: s("hh*8").swingBy(1/3, 4).gain(.4)
chords: note("<${HAND}>").s("piano")
mel: note("<${RIFF} ${ANSWER}>").swingBy(1/3, 4).s("piano")`;

export const PIECES: ReviewPiece[] = [
  { id: "C3", name: "G major, unarranged drums, short names", expect: "pass", code: C3_G },
  {
    id: "C3",
    name: "D major, the chorus contrasts only by instruments",
    expect: "pass",
    code: C3_D_INSTRUMENTS,
  },
  { id: "C3", name: "F major funk, 12-bar sections", expect: "pass", code: C3_F_FUNK },
  // Wave 5 gate: a C4 longer than the 16-bar motif cap ends at its own last bar (it read "ends on 2" at bar 16).
  { id: "C4", name: "verse, verse, chorus (24 bars) ends on 1 over i", expect: "pass", code: C4_VVC },
  {
    id: "C3",
    name: "near miss: the G major demo at 120 BPM is 64 s",
    expect: "fail",
    unmet: ["duration"],
    code: C3_G.replace("setcpm(84/4)", "setcpm(120/4)"),
  },
  {
    id: "C3",
    name: "near miss: the chorus is only louder",
    expect: "fail",
    unmet: ["contrast"],
    code: `setcpm(84/4)

const chordsVerse = chord("<G Em C D>").voicing()
const bassVerse = note("<g1 e1 c2 d2>").struct("x ~ x ~")
const melVerse = n("<[0 ~ 2 ~] [4 ~ 2 ~] [0 ~ 1 ~] [1 ~ ~ ~]>").scale("G3:major")
const chordsChorus = chord("<G Em C D>").voicing().gain(1.2)
const bassChorus = note("<g1 e1 c2 d2>").struct("x ~ x ~").gain(1.2)
const melChorus = n("<[0 ~ 2 ~] [4 ~ 2 ~] [0 ~ 1 ~] [1 ~ ~ ~]>").scale("G3:major").gain(1.2)

kick: s("bd ~ bd ~")
snare: s("~ sd ~ sd")
hats: s("hh*8").gain(.4)
chords: arrange([8, chordsVerse], [8, chordsChorus], [8, chordsVerse], [8, chordsChorus]).s("piano")
bass: arrange([8, bassVerse], [8, bassChorus], [8, bassVerse], [8, bassChorus]).s("ebass")
mel: arrange([8, melVerse], [8, melChorus], [8, melVerse], [8, melChorus]).s("piano")`,
  },
  {
    id: "C3",
    name: "near miss: the bass on straight eighths under a kick on 1 and 3",
    expect: "fail",
    unmet: ["groove-lock"],
    code: C3_G.replace(
      'note("<g1 e1 c2 d2>").struct("x ~ x ~")',
      'note("<g1 e1 c2 d2>").struct("x*8")',
    ).replace('note("<c2 d2 g1 g1>").struct("x ~ x ~")', 'note("<c2 d2 g1 g1>").struct("x*8")'),
  },
  {
    id: "C3",
    name: "near miss: an intro before the first verse",
    expect: "fail",
    unmet: ["form"],
    code: C3_G.replace(
      'const chordsVerse = chord("<G Em C D>").voicing()',
      'const chordsIntro = chord("<G C>").voicing()\nconst chordsVerse = chord("<G Em C D>").voicing()',
    )
      .replace("chords: arrange([8, chordsVerse]", "chords: arrange([4, chordsIntro], [8, chordsVerse]")
      .replace("bass: arrange([8, bassVerse]", "bass: arrange([4, silence], [8, bassVerse]")
      .replace("mel: arrange([8, melVerse]", "mel: arrange([4, silence], [8, melVerse]"),
  },
  // --- C4
  { id: "C4", name: "note names, chorus Dm E Am Am", expect: "pass", code: C4_NOTES },
  {
    id: "C4",
    name: "4-bar sections, harmonic minor chorus tune, hand-voiced E",
    expect: "pass",
    code: C4_HARMONIC,
  },
  { id: "C4", name: "verse and chorus once each (V C)", expect: "pass", code: C4_VC },
  {
    id: "C4",
    name: "near miss: the chorus lands on Em (no G♯)",
    expect: "fail",
    unmet: ["major-v"],
    code: C4_NOTES.replace('chord("<Dm E Am Am>")', 'chord("<Dm Em Am Am>")').replace(
      "[e4 ~ g#4 ~]",
      "[e4 ~ g4 ~]",
    ),
  },
  {
    id: "C4",
    name: "near miss: the tune ends on C",
    expect: "fail",
    unmet: ["ends-on-1"],
    code: C4_NOTES.replace("[a4 ~ e4 ~] [a3 ~ ~ ~]", "[a4 ~ e4 ~] [c4 ~ ~ ~]"),
  },
  {
    id: "C4",
    name: "near miss: the Andalusian descent in the verse",
    expect: "fail",
    unmet: ["aeolian"],
    code: C4_NOTES.replace('chord("<Am F C G>")', 'chord("<Am G F E>")').replace(
      'note("<a1 f1 c2 g1>")',
      'note("<a1 g1 f1 e1>")',
    ),
  },
  {
    id: "C4",
    name: "near miss: the tune never sings F (no ♭6)",
    expect: "fail",
    unmet: ["minor-colour"],
    code: C4_NOTES.replace("[f4 ~ e4 d4]", "[d4 ~ e4 d4]"),
  },
  // --- C5
  { id: "C5", name: "standard form, Strudel's .swing(4) on the hats", expect: "pass", code: C5_SWING4 },
  { id: "C5", name: "quick change, a swung ride in one drums line", expect: "pass", code: C5_QUICK_RIDE },
  { id: "C5", name: "hand-voiced sevenths, one 24-bar tune line", expect: "pass", code: C5_HAND },
  {
    id: "C5",
    name: "near miss: the swing ignored (straight hats, nothing swung)",
    expect: "fail",
    unmet: ["swing"],
    code: C5_SWING4.replace(".swing(4)", ""),
  },
  {
    id: "C5",
    name: "near miss: plain triads",
    expect: "fail",
    unmet: ["sevenths"],
    code: C5_SWING4.replace(`"<${STANDARD}>"`, '"<C C C C F F C C G F C G>"'),
  },
  {
    id: "C5",
    name: "near miss: bar 12 stays on C7",
    expect: "fail",
    unmet: ["turnaround"],
    code: C5_QUICK_RIDE.replace(`"<${QUICK}>"`, '"<C7 F7 C7 C7 F7 F7 C7 C7 G7 F7 C7 C7>"').replace(
      "c2 g2>",
      "c2 c2>",
    ),
  },
  {
    id: "C5",
    name: "near miss: a riff that changes in half its bars",
    expect: "fail",
    unmet: ["riff"],
    code: C5_QUICK_RIDE.replace(STEADY, RESTLESS),
  },
  {
    id: "C5",
    name: "near miss: one chorus only",
    expect: "fail",
    unmet: ["form"],
    code: C5_SWING4.replace("arrange([12, riff], [12, answer])", "riff"),
  },
];

/**
 * Pieces whose section names read as something the learner did not mean (contracts §6.3 item 2): the grader fails
 * the form rules, and the workspace's naming hint (`sectionNamingHint`) says what to write.
 */
export const NAMING: { name: string; code: string; hint: RegExp }[] = [
  {
    name: "shortened section names (chordsV, chordsC)",
    code: C3_G.replace(/\b(chords|bass|mel)Verse\b/g, "$1V").replace(/\b(chords|bass|mel)Chorus\b/g, "$1C"),
    hint: /`chordsV` as a section called “v”, and the brief asks for a verse\. Spell it out: `chordsVerse`/,
  },
  {
    name: "the section first (verseChords)",
    code: C3_F_FUNK.replace(
      /\b(drums|chords|bass|mel)(Verse|Chorus)\b/g,
      (_, r: string, w: string) => `${w.toLowerCase()}${r[0]?.toUpperCase()}${r.slice(1)}`,
    ),
    hint: /`verseDrums` reads as a section called “drums”\. Put the part first: `drumsVerse`/,
  },
  {
    name: "the verse's tune reused in the chorus (melVerse)",
    code: C3_D_INSTRUMENTS.replace("const melChorus = melVerse\n", "").replace(/melChorus/g, "melVerse"),
    hint: /`mel` plays `melVerse` in section 2, where the other parts play their chorus\. .*`const melChorus = melVerse`/,
  },
  {
    name: "a name with no section in it (tune)",
    code: C3_G.replace(/\bmelVerse\b/g, "tune"),
    hint: /`tune` names no section\. Name each one for its part, then its section: `melVerse`, `melChorus`/,
  },
];
