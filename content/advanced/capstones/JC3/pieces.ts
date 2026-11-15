// JC3 Rhythm-Changes Contrafact (content/specs/J5.md; contracts §2.6, §6.6): the pieces the brief's tests grade
// (content/capstones.ts JC3), laid out as JC3_TEMPLATE lays a piece out: every track arranged A A B A. W7 gate,
// decision 80: until song.i-got-rhythm has an answer key, `contrafact` reads the brief's stand-in model (the head
// J4.L04 reads), so these tests run in content CI with no host context. content/advanced/capstones/JC3/jc3.test.ts
// grades the same pieces line by line, with the failing ones pinned to the line they break.
//
// Music checked by running it (jc3.test.ts, the real grader in capstone mode):
// - The A section is the starter's (B♭∆7 Gm7 | Cm7 F7 | … | B♭∆7), the bridge D7 G7 C7 F7 two bars each.
// - The reference lands on the 3rd of B♭ and of Gm7, the 3rd of Cm7 and the root of F7, the 3rd of E♭m7 (G♭) in
//   bar 6; the bridge lands on F♯, B, E and A, the 3rds of D7, G7, C7 and F7.

/** The A section of rhythm changes as JC3 simplifies it (J4.L03's second half varies; J.CP2's turnaround is not it). */
export const JC3_CHANGES_A =
  "<[Bb^7 Gm7] [Cm7 F7] [Bb^7 Gm7] [Cm7 F7] [Bb^7 Bb7] [Eb^7 Ebm7] [Bb^7 F7] Bb^7>";
/** The bridge: four dominants round the cycle of fourths, two bars each (III7 VI7 II7 V7 in B♭). */
export const JC3_CHANGES_B = "<D7 D7 G7 G7 C7 C7 F7 F7>";

export interface Jc3Head {
  bpm?: number;
  changesA?: string;
  changesB?: string;
  bassA?: string;
  bassB?: string;
  compA?: string;
  compB?: string;
  melA: string;
  melB: string;
  /** A last A of its own: the head ends differently. */
  melA2?: string;
  sounds?: { chords: string; bass: string; lead: string };
  /** Sections, 8 bars each (A A B A is 32 bars). */
  form?: ("A" | "B")[];
  melTail?: string;
}

/** A head on rhythm changes in B♭, every track arranged section by section. */
export function jc3Head(h: Jc3Head): string {
  const s = h.sounds ?? { chords: "rhodes", bass: "upright", lead: "mutetpt" };
  const form = h.form ?? ["A", "A", "B", "A"];
  const lastA = form.lastIndexOf("A");
  const sec = (role: string) =>
    form.map((x, i) => `[8, ${role}${x}${h.melA2 && role === "mel" && i === lastA ? "2" : ""}]`).join(", ");
  return [
    `setcpm(${h.bpm ?? 160}/4)`,
    "",
    `const changesA = "${h.changesA ?? JC3_CHANGES_A}"`,
    `const changesB = "${h.changesB ?? JC3_CHANGES_B}"`,
    `const bassA = note("${h.bassA ?? "<[bb1 g1] [c2 f1] [bb1 g1] [c2 f1] [bb1 d2] [eb2 eb2] [bb1 f1] [bb1 f1]>"}")`,
    `const bassB = note("${h.bassB ?? "<[d2 a1] [d2 f#1] [g1 d2] [g1 b1] [c2 g1] [c2 e2] [f1 c2] [f1 a1]>"}")`,
    `const chordsA = chord(changesA).dict("lefthand").voicing().struct("${h.compA ?? "[x ~ ~ x]*2"}")`,
    `const chordsB = chord(changesB).dict("lefthand").voicing().struct("${h.compB ?? "x ~ ~ x ~ ~ ~ ~"}")`,
    `const melA = note("${h.melA}")`,
    ...(h.melA2 ? [`const melA2 = note("${h.melA2}")`] : []),
    `const melB = note("${h.melB}")`,
    "",
    'drums: s("rd [rd rd] rd [rd rd]").swingBy(1/3, 4).bank("jazzkit")',
    'hats: s("~ hh ~ hh").bank("jazzkit")',
    `bass: arrange(${sec("bass")}).s("${s.bass}").lpf(900)`,
    `chords: arrange(${sec("chords")}).swingBy(1/3, 4).s("${s.chords}").gain(.6)`,
    `mel: arrange(${sec("mel")}).swingBy(1/3, 4).s("${s.lead}")${h.melTail ?? ""}`,
  ].join("\n");
}

export const JC3_REF_A =
  "<[d5 ~ bb4 d5] [eb5 ~ f5 ~] [d5 ~ bb4 g4] [c5 ~ ~ a4] [bb4 ~ d5 ~] [eb5 ~ gb5 ~] [f5 ~ eb5 ~] [d5 ~ ~ ~]>";
export const JC3_REF_B =
  "<[f#5 ~ ~ ~] [e5 d5 c5 a4] [b4 ~ ~ ~] [a4 g4 f4 d4] [e5 ~ ~ ~] [d5 c5 bb4 g4] [a4 ~ ~ ~] [c5 ~ ~ ~]>";
const BOP_A =
  "<[d5 f5 a5 f5 g5 f5 d5 bb4] [eb5 g5 bb5 g5 a5 g5 f5 eb5] [d5 f5 a5 f5 bb5 a5 g5 f5] [eb5 d5 c5 bb4 a4 c5 eb5 ~] [d5 ~ f5 d5 ab5 ~ f5 d5] [g5 ~ eb5 bb4 gb5 ~ eb5 bb4] [f5 d5 bb4 d5 eb5 c5 a4 ~] [bb4 ~ ~ ~ ~ ~ ~ ~]>";
const BOP_B =
  "<[c5 ~ ~ ~ a4 c5 d5 f#5] [a5 ~ f#5 d5 c5 ~ ~ ~] [f5 ~ ~ ~ d5 f5 g5 b5] [d6 ~ b5 g5 f5 ~ ~ ~] [bb4 ~ ~ ~ g4 bb4 c5 e5] [g5 ~ e5 c5 bb4 ~ ~ ~] [eb5 ~ ~ ~ c5 eb5 f5 a5] [c6 ~ a5 f5 eb5 ~ ~ ~]>";
const RIFF_A =
  "<[bb4 d5 ~ f5] [eb5 ~ c5 ~] [bb4 d5 ~ f5] [g5 ~ f5 ~] [d5 f5 ~ bb5] [g5 ~ gb5 ~] [f5 ~ d5 c5] [bb4 ~ ~ ~]>";
const RIFF_A2 =
  "<[bb4 d5 ~ f5] [eb5 ~ c5 ~] [bb4 d5 ~ f5] [g5 ~ f5 ~] [d5 f5 ~ bb5] [g5 ~ gb5 ~] [f5 ~ eb5 c5] [d5 ~ ~ ~]>";
const RIFF_B =
  "<[f#4 ~ ~ ~] [a4 ~ c5 ~] [b4 ~ ~ ~] [d5 ~ f5 ~] [e5 ~ ~ ~] [g5 ~ bb5 ~] [a5 ~ ~ ~] [eb5 ~ c5 ~]>";
/** J4.L04's head (its `HEAD_BARS`), the stand-in model: a tune that copies it into every A is not new. */
export const J4L04_HEAD_A = [
  "[d5@2 bb4 d5]",
  "[eb5@2 a4@2]",
  "[d5@2 bb4 g4]",
  "[c5 [bb4 a4] f4 ~]",
  "[c5 eb5 d5@2]",
  "[g4 bb4 db5@2]",
  "[f4 a4 b4 d5]",
  "[c5@2 a4@2]",
];

export const JC3_PIECES = {
  /** The reference (jazz-soul: rhodes, upright, muted trumpet). */
  reference: jc3Head({ melA: JC3_REF_A, melB: JC3_REF_B }),
  /** An eighth-note line at 200 (indie: jazz guitar on top, guitar comping). */
  bop: jc3Head({
    bpm: 200,
    melA: BOP_A,
    melB: BOP_B,
    sounds: { chords: "jazzgtr", bass: "upright", lead: "jazzgtr" },
  }),
  /** A riff head with its own last A and four-to-the-bar comping in the bridge (pop: piano). */
  riff: jc3Head({
    bpm: 138,
    melA: RIFF_A,
    melA2: RIFF_A2,
    melB: RIFF_B,
    compB: "x x x x",
    sounds: { chords: "piano", bass: "upright", lead: "piano" },
  }),
  /** The reference quoting J4.L04's second bar in each A (funk: rhodes, finger bass, tenor): a quote is fine. */
  quote: jc3Head({
    bpm: 176,
    melA: JC3_REF_A.replace("[eb5 ~ f5 ~] [d5 ~ bb4 g4]", "[eb5@2 a4@2] [d5 ~ g4 bb4]"),
    melB: JC3_REF_B,
    sounds: { chords: "rhodes", bass: "fingerbass", lead: "tenor" },
  }),
  /** Beyond the brief: the eighth-note line over the riff head's A, a different last A, at 220. */
  beyond: jc3Head({
    bpm: 220,
    melA: BOP_A,
    melA2: RIFF_A2,
    melB: JC3_REF_B,
    compB: "x x x x",
    sounds: { chords: "piano", bass: "upright", lead: "vibes" },
  }),
  /** The right changes, the old tune: J4.L04's head in every A. */
  oldHead: jc3Head({ melA: `<${J4L04_HEAD_A.join(" ")}>`, melB: JC3_REF_B }),
  /** The right chords, the wrong length: the bridge one bar a chord. */
  shortBridge: jc3Head({ melA: JC3_REF_A, melB: JC3_REF_B, changesB: "<D7 G7 C7 F7>" }),
  /** The tune written but not heard. */
  muted: jc3Head({ melA: JC3_REF_A, melB: JC3_REF_B, melTail: ".gain(0)" }),
  /** A bridge tune on the roots: right function, wrong notes for the bridge's guide tones. */
  rootsBridge: jc3Head({
    melA: JC3_REF_A,
    melB: "<[d5 ~ ~ ~] [a4 ~ d5 ~] [g4 ~ ~ ~] [d5 ~ g4 ~] [c5 ~ ~ ~] [g4 ~ c5 ~] [f4 ~ ~ ~] [c5 ~ f4 ~]>",
  }),
};
