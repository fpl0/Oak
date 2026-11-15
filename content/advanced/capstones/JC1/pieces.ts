// JC1 ii–V Ballad (content/specs/J2.md "JC1 ii–V Ballad"; contracts §2.6, §6.6): the starter the first session opens
// with and the pieces the brief's tests grade (content/capstones.ts JC1, content/advanced/capstones/JC1/jc1.test.ts).
//
// Music checked by running it (headless Strudel and the real grader in capstone mode, jc1.test.ts):
// - A ii–V is a minor seventh (or m7♭5) and a dominant seventh a 4th above it; it aims at the key a 5th below the V,
//   whether or not the I arrives. Round the cycle (C F B♭ E♭) and down whole steps (D C B♭, then D minor) each
//   reach three keys or more; the starter's eight bars reach two (C and E♭).
// - Every melody here lands on a 3rd or a 7th of the new chord at each change and moves a half step or a whole step
//   (or not at all) from one change to the next: the 7th of each ii falls to the 3rd of its V, which stays as the
//   7th of the I, then falls again. Between the changes the tune is free (pickups, a held 9th, passing notes).
// - `.dict("guidetones")` voices each chord as its 3rd and its 7th; the bass plays the roots from the same
//   `changes`, so a chord's name comes from its symbol (contracts §6.7). Hand shells (`note()` stacks) are read
//   from their notes.
// - Tempo 72 (a ballad; the brief allows 56–92). The ride swings soft on the jazz kit (J1.L01) and the hi-hat
//   closes on 2 and 4. At 72 BPM one bar lasts 3.33 s, so sixteen bars are 53 seconds.

const tempo = (bpm: number) => `setcpm(${bpm}/4)`;

/** The kit of J1.L01, soft: the ride pattern swung, the hi-hat on 2 and 4. */
export const JC1_RIDE = 'drums: s("rd [rd rd] rd [rd rd]").swingBy(1/3, 4).bank("jazzkit").gain(.45)';
export const JC1_HATS = 'hats: s("~ hh ~ hh").bank("jazzkit").gain(.35)';

/** The starter's changes: a ii–V–I into C, then one into E♭. Two keys, eight bars. */
export const JC1_STARTER_CHANGES = "<Dm7 G7 C^7 C^7 Fm7 Bb7 Eb^7 Eb^7>";

/**
 * JC1.S1 opens with this (and the brief's `code.starter` is the same): eight bars that already play, every line
 * read from `changes`, and the drums. The session adds eight bars and a third key.
 */
export const JC1_TEMPLATE = [
  tempo(72),
  "",
  "// Every line below reads `changes`: write sixteen bars there and reach a third key.",
  `const changes = "${JC1_STARTER_CHANGES}"`,
  "",
  JC1_RIDE,
  JC1_HATS,
  'chords: chord(changes).dict("guidetones").voicing().s("rhodes").gain(.6)',
  'bass: chord(changes).rootNotes(2).s("upright")',
  "// Session 2: the melody, on its own line, landing on a 3rd or a 7th at each change.",
].join("\n");

/** Sixteen bars, one chord a bar. */
export const CHANGES = {
  /** Round the cycle of fourths (J2.L01): C, F, B♭, E♭. */
  cycle: "<Dm7 G7 C^7 C^7 Gm7 C7 F^7 F^7 Cm7 F7 Bb^7 Bb^7 Fm7 Bb7 Eb^7 Eb^7>",
  /** Down whole steps, then home in minor (J2.L02): D, C, B♭, D minor. */
  steps: "<Em7 A7 D^7 D^7 Dm7 G7 C^7 C^7 Cm7 F7 Bb^7 Bb^7 Em7b5 A7b9 Dm7 Dm7>",
  /** A chain that never lands: every pair aims at a key, none arrives (D, C, B♭, A♭, G, F, E♭, D♭). */
  chain: "<Em7 A7 Dm7 G7 Cm7 F7 Bbm7 Eb7 Am7 D7 Gm7 C7 Fm7 Bb7 Ebm7 Ab7>",
  /** Four ii–V–Is, all into C: one key. */
  oneKey: "<Dm7 G7 C^7 C^7 Dm7 G7 C^7 C^7 Dm7 G7 C^7 C^7 Dm7 G7 C^7 C^7>",
  /** Two keys only, over sixteen bars: C and F, twice. */
  twoKeys: "<Dm7 G7 C^7 C^7 Gm7 C7 F^7 F^7 Dm7 G7 C^7 C^7 Gm7 C7 F^7 F^7>",
} as const;

/**
 * Melodies, one bar per entry. Each bar starts on the thread note: the 3rd or the 7th of its chord, a step or less
 * from the last one (at a repeated chord the thread is not judged and the bar is free).
 */
export const MELODY = {
  /** Over `cycle`: C B B | B♭ B♭ A | B♭ A A | A♭ A♭ G, decorated with chord tones and a 9th or a 13th. */
  cycle:
    "<[c5@2 a4 f4] [b4@3 d5] [b4@2 g4 e4] [d4 e4 g4 a4] [bb4@2 g4 d4] [bb4@3 g4] [a4@2 c5 e5] [d5 c5 a4 f4] [bb4@2 g4 eb4] [a4@3 c5] [a4@2 f4 d4] [c4 d4 f4 g4] [ab4@2 f4 c4] [ab4@3 f4] [g4@2 bb4 d5] [bb4 g4 eb4@2]>",
  /** The same thread as whole notes: the guide-tone line itself. */
  cycleWhole: "<c5 b4 b4 b4 bb4 bb4 a4 a4 bb4 a4 a4 a4 ab4 ab4 g4 g4>",
  /** The thread decorated: passing eighths between the changes and a 9th held through a bar of the I. */
  cyclePassing:
    "<[c5@2 [b4 a4] g4] [b4@2 [a4 g4] f4] [b4@2 [c5 d5] e5] [d5@4] [bb4@2 [a4 g4] f4] [bb4@2 [a4 g4] e4] [a4@2 [bb4 c5] e5] [g5@4] [bb4@2 [a4 g4] f4] [a4@2 [g4 f4] eb4] [a4@2 [bb4 c5] d5] [c5@4] [ab4@2 [g4 f4] eb4] [ab4@2 [g4 f4] d4] [g4@2 [ab4 bb4] d5] [f5@4]>",
  /** Over `steps`: D C♯ C♯ | C B B | B♭ A A | G G F. */
  steps:
    "<[d5@2 b4 g4] [c#5@3 e5] [c#5@2 a4 f#4] [e4 f#4 a4 b4] [c5@2 a4 f4] [b4@3 d5] [b4@2 g4 e4] [d4 e4 g4 a4] [bb4@2 g4 eb4] [a4@3 c5] [a4@2 f4 d4] [c4 d4 f4 g4] [g4@2 bb4 d5] [g4@3 e4] [f4@2 a4 d5] [c5 a4 f4@2]>",
  /** `steps` as whole notes. */
  stepsWhole: "<d5 c#5 c#5 c#5 c5 b4 b4 b4 bb4 a4 a4 a4 g4 g4 f4 f4>",
  /** Over `chain`, falling a whole step every two bars: G G F F E♭ E♭ D♭ D♭ C C B♭ B♭ A♭ A♭ G♭ G♭, an octave up. */
  chain:
    "<[g5@3 e5] [g5@2 e5 c#5] [f5@3 d5] [f5@2 d5 b4] [eb5@3 c5] [eb5@2 c5 a4] [db5@3 bb4] [db5@2 bb4 g4] [c5@3 a4] [c5@2 a4 f#4] [bb4@3 g4] [bb4@2 g4 e4] [ab4@3 f4] [ab4@2 f4 d4] [gb4@3 eb4] [gb4@2 eb4 c4]>",
  /**
   * Over `oneKey`: C B B and a free bar, four times, each time decorated differently, so the piece is sixteen bars
   * as written and only its keys are wrong.
   */
  oneKey:
    "<[c5@2 a4 f4] [b4@3 d5] [b4@2 g4 e4] [d4 e4 g4 a4] [c5@3 a4] [b4@2 d5 f5] [b4@3 g4] [e5 d5 c5 a4] [c5@2 d5 f5] [b4@3 g4] [b4@2 a4 g4] [e4@4] [c5@2 f4 a4] [b4@2 g4 f4] [b4@2 c5 d5] [c5@4]>",
  /** Over `twoKeys`: F F E, F E E, twice, decorated differently each time. */
  twoKeys:
    "<[f4@2 a4 c5] [f4@3 d4] [e4@2 g4 b4] [d5 c5 b4 g4] [f4@2 bb4 d5] [e4@3 g4] [e4@2 a4 c5] [d5 c5 a4 g4] [f4@3 a4] [f4@2 g4 b4] [e4@3 c5] [b4 a4 g4 e4] [f4@3 d5] [e4@2 c5 bb4] [e4@2 g4 a4] [f4@4]>",
  /** WRONG: a guide tone at every change, but bar 7 jumps a tritone, from B♭ up to E (the 7th of F^7). */
  cycleLeap:
    "<[c5@2 a4 f4] [b4@3 d5] [b4@2 g4 e4] [d4 e4 g4 a4] [bb4@2 g4 d4] [bb4@3 g4] [e5@2 c5 a4] [d5 c5 a4 f4] [bb4@2 g4 eb4] [a4@3 c5] [a4@2 f4 d4] [c4 d4 f4 g4] [ab4@2 f4 c4] [ab4@3 f4] [g4@2 bb4 d5] [bb4 g4 eb4@2]>",
  /** WRONG: the root of every chord at its change. */
  cycleRoots:
    "<[d5@2 a4 f4] [g4@3 d5] [c5@2 g4 e4] [d4 e4 g4 a4] [g4@2 bb4 d5] [c5@3 g4] [f4@2 c5 e5] [d5 c5 a4 f4] [c5@2 g4 eb4] [f4@3 c5] [bb4@2 f4 d4] [c4 d4 f4 g4] [f4@2 ab4 c5] [bb4@3 f4] [eb4@2 bb4 d5] [bb4 g4 eb4@2]>",
} as const;

export interface Jc1Parts {
  bpm?: number;
  changes?: string;
  /** The kit, replacing the ride and the hi-hat. */
  drums?: string[];
  /** The whole `chords:` line. */
  chords?: string;
  /** The whole `bass:` line. */
  bass?: string;
  /** The whole `mel:` line; `null` leaves the melody out. */
  mel?: string | null;
  /** Extra lines at the end (a second voice, a comment). */
  extra?: string[];
}

/** A ballad in the brief's shape: tempo, `changes`, the kit, comping, bass, melody. */
export function jc1(p: Jc1Parts = {}): string {
  return [
    tempo(p.bpm ?? 72),
    "",
    `const changes = "${p.changes ?? CHANGES.cycle}"`,
    "",
    ...(p.drums ?? [JC1_RIDE, JC1_HATS]),
    p.chords ?? 'chords: chord(changes).dict("guidetones").voicing().s("rhodes").gain(.6)',
    p.bass ?? 'bass: chord(changes).rootNotes(2).s("upright")',
    ...(p.mel === null ? [] : [p.mel ?? `mel: note("${MELODY.cycle}").s("vibes")`]),
    ...(p.extra ?? []),
  ].join("\n");
}

/** Hand shells for `steps` (J1.L05): root, 3rd and 7th (the ii of the minor key with its ♭5, the V with its ♭9). */
const STEPS_SHELLS =
  "<[e3,g3,d4] [a2,g3,c#4] [d3,f#3,c#4] [d3,f#3,c#4] [d3,f3,c4] [g2,f3,b3] [c3,e3,b3] [c3,e3,b3] [c3,eb3,bb3] [f2,eb3,a3] [bb2,d3,a3] [bb2,d3,a3] [e3,g3,bb3,d4] [a2,g3,bb3,c#4] [d3,f3,c4] [d3,f3,c4]>";

/** The pieces the brief's tests grade, by name. */
export const JC1_PIECES = {
  template: JC1_TEMPLATE,
  /** jazz-soul: round the cycle on the Rhodes and the upright, the vibes on the thread. */
  jazzSoul: jc1(),
  /** pop: D, C, B♭ and D minor, hand shells on the piano, a bass on the roots, the melody on the piano. */
  pop: jc1({
    bpm: 66,
    changes: CHANGES.steps,
    chords: `chords: note("${STEPS_SHELLS}").s("piano").gain(.55)`,
    bass: 'bass: chord(changes).rootNotes(2).s("fingerbass")',
    mel: `mel: note("${MELODY.steps}").s("piano")`,
  }),
  /** indie: the same changes on the acoustic guitar with room, the thread in whole notes on the clean guitar. */
  indie: jc1({
    bpm: 80,
    changes: CHANGES.steps,
    chords: 'chords: chord(changes).voicing().struct("x ~ x ~ x ~ x ~").s("acgtr").room(.4).gain(.5)',
    bass: 'bass: chord(changes).rootNotes(2).s("upright")',
    mel: `mel: note("${MELODY.stepsWhole}").s("cleangtr")`,
  }),
  /** funk: straight eighths, `lefthand` voicings on the Rhodes pushed, a fingerbass in two, the chain that never lands. */
  funk: jc1({
    bpm: 88,
    changes: CHANGES.chain,
    drums: [
      'drums: s("hh*8").bank("RolandTR808").gain(.35)',
      'kick: s("bd ~ ~ bd ~ ~ bd ~").bank("RolandTR808").gain(.5)',
    ],
    chords:
      'chords: chord(changes).dict("lefthand").voicing().struct("x ~ ~ x ~ ~ x ~").s("rhodes").gain(.55)',
    bass: 'bass: chord(changes).rootNotes(2).struct("x ~ x ~").s("fingerbass")',
    mel: `mel: note("${MELODY.chain}").s("vibes")`,
  }),
  /** Minimal: the thread as whole notes over the starter's sounds, round the cycle, at 56. */
  minimal: jc1({ bpm: 56, mel: `mel: note("${MELODY.cycleWhole}").s("vibes")` }),
  /** Beyond the brief: the thread decorated with passing eighths and held 9ths, swung, over a soft piano pad. */
  decorated: jc1({
    bpm: 92,
    mel: `mel: note("${MELODY.cyclePassing}").swingBy(1/3, 4).s("vibes")`,
    extra: ['pad: chord(changes).voicing().s("piano").gain(.25)'],
  }),
  /** WRONG (the right function, one key): three ii–V–Is and a fourth, all into C. */
  oneKey: jc1({ changes: CHANGES.oneKey, mel: `mel: note("${MELODY.oneKey}").s("vibes")` }),
  /** WRONG: sixteen bars that reach two keys (C and F). */
  twoKeys: jc1({ changes: CHANGES.twoKeys, mel: `mel: note("${MELODY.twoKeys}").s("vibes")` }),
  /** WRONG (the right notes, the wrong motion): a guide tone at bar 7, reached by a tritone. */
  leap: jc1({ mel: `mel: note("${MELODY.cycleLeap}").s("vibes")` }),
  /** WRONG: the tune lands on the root at every change. */
  roots: jc1({ mel: `mel: note("${MELODY.cycleRoots}").s("vibes")` }),
  /** WRONG (the right line, not heard): the guide-tone melody at `.gain(0)`. */
  silentMel: jc1({ mel: `mel: note("${MELODY.cycle}").s("vibes").gain(0)` }),
  /** WRONG (the right changes written, not heard): the comping muted, only the roots left in the bass. */
  mutedChords: jc1({ chords: 'chords: chord(changes).dict("guidetones").voicing().s("rhodes").gain(0)' }),
  /** WRONG: the changes and the band, no melody (the end of session 1). */
  noMelody: jc1({ mel: null }),
  /** WRONG: everything at 100 BPM, no ballad. */
  fast: jc1({ bpm: 100 }),
  /** WRONG: fifteen bars (the last E♭^7 dropped). */
  bars15: jc1({
    changes: CHANGES.cycle.replace(" Eb^7>", ">"),
    mel: `mel: note("${MELODY.cycle.replace(" [bb4 g4 eb4@2]>", ">")}").s("vibes")`,
  }),
  /** WRONG: seventeen bars (a bar of E♭^7 more). */
  bars17: jc1({
    changes: CHANGES.cycle.replace(">", " Eb^7>"),
    mel: `mel: note("${MELODY.cycle.replace(">", " eb4>")}").s("vibes")`,
  }),
} as const;
