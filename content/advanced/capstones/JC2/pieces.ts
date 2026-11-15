// JC2 Jazz Blues in F (content/specs/JC2.md; contracts §2.6, §6.6): the starter the first session opens with and the
// pieces the brief's tests grade (content/capstones.ts JC2, content/advanced/capstones/JC2/jc2.test.ts).
//
// Music checked by running it (headless Strudel and the real grader in capstone mode, jc2.test.ts):
// - The jazz blues in F of J4.L02: F7 | B♭7 | F7 | Cm7 F7 | B♭7 | B°7 | F7 | D7 | Gm7 | C7 | F7 D7 | Gm7 C7. Bar 4
//   is a ii–V into bar 5's B♭7, bar 6 a diminished seventh that climbs back to F7, bars 8–10 a dominant and a ii–V
//   into the last line, bars 11–12 a turnaround. Variants a learner may keep: Am7 D7 in bar 8, F7 in bar 2.
// - The walk (J3.L04): beat 1 is the root from the chord pattern (`rootNotes(2)`, every root between C2 and B2),
//   beats 2–4 are written by hand in one labelled line with it (`stack`). Evaluated: a chord tone on beat 3 in all
//   twelve bars, and beat 4 a half step or a whole step from the next bar's root at all twelve bar lines, the
//   loop's included (B→B♭, G→F, D♭→C, A→B♭, C→B, E→F, C♯→D, A♭→G, D♭→C, G♭→F, F♯→G, E→F).
// - The comping: the 3rd and the 7th of each chord (`.dict("guidetones")`) on 1, the "and" of 2 and the "and" of 3,
//   swung, so the second chord of bars 4, 11 and 12 is comped too (J4.L02). The ride swings at 2:1 (J1.L01).
// - The head on the muted trumpet: chorus 1 is J4.L02's head (a tone of the sounding chord on every beat it plays),
//   chorus 2 keeps its first eight bars and answers the last four with a new line, every note on a beat a tone of
//   its chord (bar 9 D B♭ G over Gm7, bar 10 C E over C7, bar 11 F over F7 and D over D7, bar 12 B♭ over Gm7 and E
//   over C7).

const tempo = (bpm: number) => `setcpm(${bpm}/4)`;

/** J1.L01's pocket on the jazz kit: the ride pattern swung, the hi-hat on 2 and 4. */
export const JC2_RIDE = 'drums: s("rd [rd rd] rd [rd rd]").swingBy(1/3, 4).bank("jazzkit").gain(.6)';
export const JC2_HATS = 'hats: s("~ hh ~ hh").bank("jazzkit").gain(.5)';

/** U11's blues in F with the quick change: what JC2.S1 opens with. */
export const U11_BLUES = "<F7 Bb7 F7 F7 Bb7 Bb7 F7 F7 C7 Bb7 F7 C7>";
/** A jazz blues in F (J4.L02), one common chart. */
export const JAZZ_BLUES = "<F7 Bb7 F7 [Cm7 F7] Bb7 Bo7 F7 D7 Gm7 C7 [F7 D7] [Gm7 C7]>";
/** The same with the bar-8 variant (Am7 D7). */
export const JAZZ_BLUES_AM7 = "<F7 Bb7 F7 [Cm7 F7] Bb7 Bo7 F7 [Am7 D7] Gm7 C7 [F7 D7] [Gm7 C7]>";

/**
 * JC2.S1 opens with this (and the brief's `code.starter` is the same): U11's blues swinging in two, every line that
 * plays harmony reading `changes`. The session turns it into the jazz blues, comps it and walks the bass.
 */
export const JC2_TEMPLATE = [
  tempo(132),
  "",
  "// One chord pattern drives the band: change a chord here and the comping and the bass's roots follow.",
  `const changes = "${U11_BLUES}"`,
  "",
  JC2_RIDE,
  JC2_HATS,
  'chords: chord(changes).dict("guidetones").voicing().s("rhodes").gain(.6)',
  'bass: chord(changes).rootNotes(2).struct("x ~ x ~").s("upright")',
].join("\n");

/** The comping rhythm of J4.L02: 1, the "and" of 2 and the "and" of 3, swung. */
const COMP_RHYTHM = '.struct("x ~ ~ x ~ x ~ ~").swingBy(1/3, 4)';
export const COMP = `chords: chord(changes).dict("guidetones").voicing()${COMP_RHYTHM}.s("rhodes").gain(.6)`;

/** Beats 2–4 of the walk, bar by bar, under the jazz blues (the roots on beat 1 come from `changes`). */
export const WALK_UPPER =
  "<[~ a2 c3 b2] [~ a2 ab2 g2] [~ g2 eb2 db2] [~ eb3 f2 a2] [~ ab2 f2 c3] [~ ab2 f2 e2] [~ e2 eb2 c#2] [~ c3 a2 ab2] [~ bb2 f2 db2] [~ bb2 g2 gb2] [~ a2 d2 f#2] [~ bb2 c3 e2]>";
export const walk = (upper = WALK_UPPER, sound = "upright") =>
  `bass: stack(chord(changes).rootNotes(2).struct("x ~ ~ ~"), note("${upper}")).s("${sound}")`;
export const WALK = walk();

/** Chorus 1 of the head: J4.L02's head on the muted trumpet. */
export const HEAD_1 =
  'note("<[f4 a4 c5 eb5] [d5 ~ bb4 ~] [c5 a4 f4 ~] [g4 ~ a4 ~] [bb4 d5 f5 ab5] [f5 ~ d5 ~] [c5 a4 f4 ~] [f#4 ~ a4 ~] [bb4 ~ d5 ~] [e5 ~ c5 ~] [a4 ~ f#4 ~] [g4 ~ e4 ~]>")';
/** Chorus 2: the first eight bars again, the last four answered with a new line. */
export const HEAD_2 =
  'note("<[f4 a4 c5 eb5] [d5 ~ bb4 ~] [c5 a4 f4 ~] [g4 ~ a4 ~] [bb4 d5 f5 ab5] [f5 ~ d5 ~] [c5 a4 f4 ~] [f#4 ~ a4 ~] [d5 ~ bb4 g4] [c5 ~ e5 ~] [f5 ~ d5 ~] [bb4 ~ e5 ~]>")';
export const head = (sound = "mutetpt", h2 = HEAD_2) =>
  `mel: arrange([12, ${HEAD_1}], [12, ${h2}]).swingBy(1/3, 4).s("${sound}")`;

export interface Jc2Parts {
  bpm?: number;
  changes?: string;
  /** The kit lines, replacing the ride and the hi-hat. */
  drums?: string[];
  chords?: string;
  bass?: string;
  /** `null` leaves the head out. */
  mel?: string | null;
}

/** A jazz blues in the brief's shape: tempo, `changes`, the kit, comping, walk, head. */
export function jc2(p: Jc2Parts = {}): string {
  return [
    tempo(p.bpm ?? 132),
    "",
    `const changes = "${p.changes ?? JAZZ_BLUES}"`,
    "",
    ...(p.drums ?? [JC2_RIDE, JC2_HATS]),
    p.chords ?? COMP,
    p.bass ?? WALK,
    ...(p.mel === null ? [] : [p.mel ?? head()]),
  ].join("\n");
}

/** The walk with beat 4 a repeat of beat 3: roots on 1, chord tones on 3, no approach into any bar line. */
const NO_APPROACH =
  "<[~ a2 c3 c3] [~ a2 ab2 ab2] [~ g2 eb2 eb2] [~ eb3 f2 f2] [~ ab2 f2 f2] [~ ab2 f2 f2] [~ e2 eb2 eb2] [~ c3 a2 a2] [~ bb2 f2 f2] [~ bb2 g2 g2] [~ a2 d2 d2] [~ bb2 c3 c3]>";
/**
 * The walk crowded into beat 1: the root from the pattern and beats 2–4 as sixteenths inside the first beat, then
 * three beats of rest. The same notes as the reference, in the same order: not a walk.
 */
const CROWDED_UPPER =
  "<[[~ a2 c3 b2] ~ ~ ~] [[~ a2 ab2 g2] ~ ~ ~] [[~ g2 eb2 db2] ~ ~ ~] [[~ eb3 f2 a2] ~ ~ ~] [[~ ab2 f2 c3] ~ ~ ~] [[~ ab2 f2 e2] ~ ~ ~] [[~ e2 eb2 c#2] ~ ~ ~] [[~ c3 a2 ab2] ~ ~ ~] [[~ bb2 f2 db2] ~ ~ ~] [[~ bb2 g2 gb2] ~ ~ ~] [[~ a2 d2 f#2] ~ ~ ~] [[~ bb2 c3 e2] ~ ~ ~]>";
const CROWDED = `bass: stack(chord(changes).rootNotes(2).struct("[x ~ ~ ~] ~ ~ ~"), note("${CROWDED_UPPER}")).s("upright")`;
/** The walk and the comping written out in note names: no chord pattern anywhere. */
const BY_HAND_CHORDS =
  'chords: note("<[f3,a3,eb4] [bb2,ab3,d4] [f3,a3,eb4] [[c3,bb3,eb4] [f3,a3,eb4]] [bb2,ab3,d4] [b2,d3,f3,ab3] [f3,a3,eb4] [d3,c4,f#4] [g2,f3,bb3] [c3,bb3,e4] [[f3,a3,eb4] [d3,c4,f#4]] [[g2,f3,bb3] [c3,bb3,e4]]>").struct("x ~ ~ x ~ x ~ ~").swingBy(1/3, 4).s("rhodes").gain(.6)';
const BY_HAND_WALK =
  'bass: note("<[f2 a2 c3 b2] [bb2 a2 ab2 g2] [f2 g2 eb2 db2] [c2 eb3 f2 a2] [bb2 ab2 f2 c3] [b2 ab2 f2 e2] [f2 e2 eb2 c#2] [d2 c3 a2 ab2] [g2 bb2 f2 db2] [c2 bb2 g2 gb2] [f2 a2 d2 f#2] [g2 bb2 c3 e2]>").s("upright")';
/** Beats 2–4 for U11's blues (F7 B♭7 F7 F7 | B♭7 B♭7 F7 F7 | C7 B♭7 F7 C7): a walk that suits it. */
const U11_WALK =
  "<[~ a2 c3 b2] [~ a2 ab2 gb2] [~ a2 c3 e2] [~ eb3 c3 a2] [~ d3 f2 a2] [~ ab2 f2 e2] [~ a2 c3 e2] [~ eb3 c3 b1] [~ e2 g2 b2] [~ d3 f2 e2] [~ a2 c3 c#2] [~ e2 g2 e2]>";

/** The pieces the brief's tests grade, by name. */
export const JC2_PIECES = {
  template: JC2_TEMPLATE,
  /** jazz-soul, the reference: Rhodes shells, the walk on the upright, the head on the muted trumpet, at 132. */
  jazzSoul: jc2(),
  /** pop: piano shells, the walk on the electric bass, the head on the piano, at 120. */
  pop: jc2({
    bpm: 120,
    chords: `chords: chord(changes).dict("guidetones").voicing()${COMP_RHYTHM}.s("piano").gain(.5)`,
    bass: walk(WALK_UPPER, "ebass"),
    mel: head("piano"),
  }),
  /** indie: the clean guitar comping, Am7 D7 in bar 8, the head on the acoustic guitar, at 112. */
  indie: jc2({
    bpm: 112,
    changes: JAZZ_BLUES_AM7,
    chords: `chords: chord(changes).dict("guidetones").voicing()${COMP_RHYTHM}.s("cleangtr").gain(.5)`,
    bass: walk(WALK_UPPER, "upright"),
    mel: head("acgtr"),
  }),
  /** funk: rootless `lefthand` voicings anchored at A4 on the Rhodes, the fingerbass walking, the organ head, at 144. */
  funk: jc2({
    bpm: 144,
    chords: `chords: chord(changes).dict("lefthand").anchor("a4").voicing()${COMP_RHYTHM}.s("rhodes").gain(.45)`,
    bass: walk(WALK_UPPER, "fingerbass"),
    mel: head("organ"),
  }),
  /** The head on the vibes at 160, rootless comping on the Rhodes. */
  vibes160: jc2({
    bpm: 160,
    chords: `chords: chord(changes).dict("lefthand").anchor("a4").voicing()${COMP_RHYTHM}.s("rhodes").gain(.5)`,
    mel: head("vibes"),
  }),
  /** The comping on 2 and 4 (the bass alone on beat 1), the head on the vibes, at 104. */
  twoAndFour: jc2({
    bpm: 104,
    chords:
      'chords: chord(changes).dict("guidetones").voicing().struct("~ x ~ x").swingBy(1/3, 4).s("rhodes").gain(.6)',
    mel: head("vibes"),
  }),
  /** WRONG (the right function, no walk): the four notes of each bar crowded into beat 1. */
  crowded: jc2({ bass: CROWDED }),
  /** WRONG: roots on 1 and chord tones on 3, but beat 4 repeats beat 3: no bar line is approached. */
  noApproach: jc2({ bass: walk(NO_APPROACH) }),
  /** WRONG (the starter's bass, four to the bar): the roots repeated, beat 4 never a step from the next root. */
  rootsFour: jc2({ bass: 'bass: chord(changes).rootNotes(2).struct("x*4").s("upright")' }),
  /** WRONG (the right function on the wrong line): the ride and the comping straight, the swing on the bass. */
  swingOnBass: jc2({
    drums: ['drums: s("rd [rd rd] rd [rd rd]").bank("jazzkit").gain(.6)', JC2_HATS],
    chords:
      'chords: chord(changes).dict("guidetones").voicing().struct("x ~ ~ x ~ x ~ ~").s("rhodes").gain(.6)',
    bass: `${WALK}.swingBy(1/3, 4)`,
  }),
  /** WRONG: U11's blues, walked, with the head: not the jazz chart. */
  u11: jc2({ changes: U11_BLUES, bass: walk(U11_WALK) }),
  /** WRONG: one chorus, the head played once (twelve bars). */
  oneChorus: jc2({ mel: `mel: ${HEAD_1}.swingBy(1/3, 4).s("mutetpt")` }),
  /** WRONG: two choruses the same, note for note. */
  sameTwice: jc2({ mel: head("mutetpt", HEAD_1) }),
  /** WRONG: comping and walk written out in note names, no chord pattern anywhere. */
  byHand: jc2({ chords: BY_HAND_CHORDS, bass: BY_HAND_WALK }),
  /** WRONG: the band, no head. */
  noHead: jc2({ mel: null }),
  /** WRONG (the right head, not heard): the head at gain 0. */
  silentHead: jc2({ mel: `${head()}.gain(0)` }),
} as const;
