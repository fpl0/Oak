// RC1 16th-Note Funk (content/specs/R3.md "RC1 16th-Note Funk"; contracts §2.6, §6.6): the starter the first session
// opens with and the pieces the brief's tests grade (content/capstones.ts RC1, content/advanced/capstones/RC1/
// rc1.test.ts, which grades every piece through the real grader in capstone mode, the way the workspace grades a save).
//
// Music checked by running it (headless Strudel and the real grader, rc1.test.ts):
// - The bar is counted in sixteenths, 1 e and a. The eighth grid is the 1s and the ands (steps 0, 2, 4 … 14); the
//   e and the a (the odd steps) are the places off it. The pocket bass below plays steps 0 3 | 6 | 9 11 | 13 14: four
//   notes on an e or an a, and the one on step 0 with the kick.
// - The hats play every sixteenth at four levels a beat, `[1 .3 .6 .3]`: the beat loud, the and in between, the e and
//   the a quiet (.3, well under the level a ghost note is read at), so each beat has one accent and two ghost notes.
// - The bass and every riff stay on the minor pentatonic of the vamp's home note (1 ♭3 4 5 ♭7; in code `n` is the
//   degree minus one: 0 1 2 3 4, and -1 is the ♭7 below). Over a minor seventh chord every one of them is a chord
//   tone except 4, the 11th, which funk leans on freely.
// - The clav comps on steps 2 4 7 10 12, none of them a place the bass plays: the two interlock. The horns stab the
//   chord on the and of 2 and the last a of the bar, a sixteenth long each.
// - A one-chord vamp has no Band under it: the brief carries its own drums, bass and chords (the clav), so the
//   capstone's `parts` suggestion names the three roles and the workspace adds nothing (app/src/capstone/content.ts).

import type { TestCase } from "@oak/content-kit";

const tempo = (bpm: number) => `setcpm(${bpm}/4)`;

/** The brief's starter (contracts §6.6 RC1 scaffold): the pocket on the eighth grid, the bass's notes editable. */
export const RC1_STARTER = [
  tempo(100),
  "",
  'kick: s("bd ~ ~ bd ~ ~ bd ~")',
  'snare: s("~ sd ~ sd")',
  'hats: s("hh*16").velocity("[1 .35 .6 .35]*4")',
  'bass: note("⟪c2 ~ ~ c2 ~ eb2 ~ g2⟫").s("fingerbass").lpf(800)',
].join("\n");

/** The starter with its markers stripped: what the learner's first save holds. */
export const RC1_STARTER_CODE = RC1_STARTER.replace(/[⟪⟫]/g, "");

/** The pocket bass by degree (`n` is the degree minus one): steps 0 3 | 6 | 9 11 | 13 14 of the sixteen. */
export const POCKET_BASS = "[0 ~ ~ 0] [~ ~ 1 ~] [~ 2 ~ 3] [~ -1 0 ~]";
/** The kick of the pocket: the one, the a of 2, the and of 3. */
export const POCKET_KICK = "[bd ~ ~ ~] [~ ~ ~ bd] [~ ~ bd ~] [~ ~ ~ ~]";
/** The clav's comping places, none shared with the bass. */
export const CLAV_STRUCT = "[~ ~ x ~] [x ~ ~ x] [~ ~ x ~] [x ~ ~ ~]";
/** Two horn stabs a bar: the and of 2 and the a of 4. */
export const HORN_STRUCT = "[~ ~ ~ ~] [~ ~ x ~] [~ ~ ~ ~] [~ ~ ~ x]";

export interface Rc1Parts {
  bpm?: number;
  /** The vamp's chord symbol (any minor seventh). */
  chord?: string;
  /** The scale the bass reads, without its octave: `C:minor:pentatonic` becomes `C2:minor:pentatonic`. */
  tonic?: string;
  mode?: string;
  bank?: string | null;
  bassSound?: string;
  keysSound?: string;
  /** The horns' sound: `horns` once RC1.S2 has started; any unlocked sound before (contracts §6.6 RC1). */
  hornSound?: string;
  /** Whole lines that replace the defaults (`null` leaves a line out). */
  kick?: string;
  snare?: string;
  hats?: string;
  bass?: string;
  keys?: string | null;
  horns?: string | null;
  /** Lines before the tracks (section consts). */
  consts?: string[];
}

/** A one-chord funk vamp in the brief's shape: kick, snare, hats, bass, clav, horns. */
export function rc1(p: Rc1Parts = {}): string {
  const bank = p.bank ? `.bank("${p.bank}")` : "";
  const chord = p.chord ?? "Cm7";
  const tonic = p.tonic ?? "C";
  const mode = p.mode ?? "minor:pentatonic";
  const horn = p.hornSound ?? "horns";
  return [
    tempo(p.bpm ?? 100),
    "",
    ...(p.consts ? [...p.consts, ""] : []),
    p.kick ?? `kick: s("${POCKET_KICK}")${bank}`,
    p.snare ?? `snare: s("~ sd ~ sd")${bank}`,
    p.hats ?? `hats: s("hh*16")${bank}.velocity("[1 .3 .6 .3]*4")`,
    p.bass ??
      `bass: n("${POCKET_BASS}").scale("${tonic}2:${mode}").s("${p.bassSound ?? "fingerbass"}").lpf(800)`,
    ...(p.keys === null
      ? []
      : [
          p.keys ??
            `keys: chord("${chord}").voicing().struct("${CLAV_STRUCT}").s("${p.keysSound ?? "clav"}").clip(.5).gain(.6)`,
        ]),
    ...(p.horns === null
      ? []
      : [p.horns ?? `horns: chord("${chord}").voicing().struct("${HORN_STRUCT}").s("${horn}").gain(.7)`]),
  ].join("\n");
}

/**
 * The flavours' pieces (contracts §5.10 rule 8: funk `fingerbass` and `clav`, jazz-soul `upright` and `rhodes`, pop and
 * indie `ebass` and `piano`), each on its own minor seventh and tempo. `hornSound` is the one sound RC1.S1 does not
 * have: content CI lints a brief's tests at the first session, so the brief's copies stab on a filtered sawtooth (a
 * synth-brass stab; contracts: "any unlocked sound"), and rc1.test.ts grades the same pieces on `horns` at RC1.S2.
 */
export function rc1Pieces(hornSound: string) {
  const synth = hornSound === "horns" ? "" : ".lpf(1800)";
  const hornLine = (chord: string, struct = HORN_STRUCT, tail = "") =>
    `horns: chord("${chord}").voicing().struct("${struct}")${tail}.s("${hornSound}")${synth}.gain(.7)`;
  return {
    /** funk: Cm7 at 100 on the 808, finger bass, clav, horns. */
    funk: rc1({ bank: "RolandTR808", horns: hornLine("Cm7") }),
    /** jazz-soul: Fm7 at 96, upright and Rhodes. */
    jazzSoul: rc1({
      bpm: 96,
      chord: "Fm7",
      tonic: "F",
      bassSound: "upright",
      keysSound: "rhodes",
      horns: hornLine("Fm7"),
    }),
    /** pop: Am7 at 108, electric bass and piano. */
    pop: rc1({
      bpm: 108,
      chord: "Am7",
      tonic: "A",
      bassSound: "ebass",
      keysSound: "piano",
      horns: hornLine("Am7"),
    }),
    /** indie: Em7 at 92 on the LinnDrum, electric bass and piano. */
    indie: rc1({
      bpm: 92,
      chord: "Em7",
      tonic: "E",
      bank: "LinnDrum",
      bassSound: "ebass",
      keysSound: "piano",
      horns: hornLine("Em7"),
    }),
    /** Minimal: the starter's drums, a bass with three notes off the eighths, two stabs a bar; no clav. */
    minimal: [
      tempo(100),
      "",
      'kick: s("bd ~ ~ bd ~ ~ bd ~")',
      'snare: s("~ sd ~ sd")',
      'hats: s("hh*16").velocity("[1 .35 .6 .35]*4")',
      'bass: note("[c2 ~ ~ c2] ~ [~ eb2 ~ g2] [~ ~ bb1 ~]").s("fingerbass").lpf(800)',
      `horns: note("[~ ~ [eb4,g4] ~] ~ [~ ~ [eb4,g4] ~] ~").s("${hornSound}")${synth}`,
    ].join("\n"),
    /**
     * Beyond the brief: sixteen bars in sections (a vamp, a two-bar break where the kick, the bass and the clav drop
     * out under the stabs, the vamp again), and in the second vamp the horn figure comes back an eighth later.
     */
    arranged: rc1({
      consts: [
        `const kickVamp = s("${POCKET_KICK}")`,
        'const kickBreak = s("[bd ~ ~ ~] ~ ~ ~")',
        `const bassVamp = n("${POCKET_BASS}")`,
        'const bassBreak = n("[0 ~ ~ 0] ~ ~ ~")',
        `const keysVamp = chord("Cm7").voicing().struct("${CLAV_STRUCT}")`,
        `const hornsVamp = chord("Cm7").voicing().struct("${HORN_STRUCT}")`,
        `const hornsBreak = chord("Cm7").voicing().struct("${HORN_STRUCT}")`,
        `const hornsVamp2 = chord("Cm7").voicing().struct("${HORN_STRUCT}").late(1/8)`,
      ],
      kick: "kick: arrange([8, kickVamp], [2, kickBreak], [6, kickVamp])",
      snare: 'snare: s("~ sd ~ sd")',
      hats: 'hats: s("hh*16").velocity("[1 .3 .6 .3]*4")',
      bass: 'bass: arrange([8, bassVamp], [2, bassBreak], [6, bassVamp]).scale("C2:minor:pentatonic").s("fingerbass").lpf(800)',
      keys: 'keys: arrange([8, keysVamp], [2, silence], [6, keysVamp]).s("clav").clip(.5).gain(.6)',
      horns: `horns: arrange([8, hornsVamp], [2, hornsBreak], [6, hornsVamp2]).s("${hornSound}")${synth}.gain(.7)`,
    }),
  } as const;
}

/**
 * Beyond the brief for a learner who has Dorian (U14.L03; no legal route guarantees it at RC1): the arranged piece with
 * the bass on C Dorian, the same rhythm, its turn through the raised 6 (A natural, `n` 5) and the ♭7 (B♭, `n` 6).
 */
export const DORIAN_BASS = "[0 ~ ~ 0] [~ ~ 2 ~] [~ 3 ~ 5] [~ 6 0 ~]";
export function rc1Dorian(hornSound: string): string {
  return rc1Pieces(hornSound)
    .arranged.replace(`const bassVamp = n("${POCKET_BASS}")`, `const bassVamp = n("${DORIAN_BASS}")`)
    .replace("C2:minor:pentatonic", "C2:dorian");
}

/** The known-wrong pieces, each failing ONE required rule while the others hold (the funk piece changed in one place). */
export function rc1Wrong(hornSound: string) {
  const synth = hornSound === "horns" ? "" : ".lpf(1800)";
  const horns = (struct = HORN_STRUCT, tail = "") =>
    `horns: chord("Cm7").voicing().struct("${struct}").s("${hornSound}")${synth}${tail}`;
  return {
    /** WRONG (the right function, not heard): the hats' e and a at `.velocity(0)`; nothing is left between the eighths. */
    ghostsSilent: rc1({ hats: 'hats: s("hh*16").velocity("[1 0 .6 0]*4")', horns: horns() }),
    /** WRONG: every hat at .3: quiet throughout, no accent among them. */
    hatsAllQuiet: rc1({ hats: 'hats: s("hh*16").velocity(.3)', horns: horns() }),
    /** WRONG: the ghost notes on the beats and the accents between them. */
    ghostsOnBeats: rc1({ hats: 'hats: s("hh*16").velocity("[.3 1]*8")', horns: horns() }),
    /** WRONG (the right function, the wrong result): the starter's bass `.late(1/8)` is still all on the eighth grid. */
    bassLateEighth: [RC1_STARTER_CODE.replace(".lpf(800)", ".lpf(800).late(1/8)"), horns()].join("\n"),
    /** WRONG: the bass leaves out the one in bar 3 of four. */
    bassMissesOne: rc1({
      bass: `bass: n("<[${POCKET_BASS}] [${POCKET_BASS}] [[~ ~ ~ 0] [~ ~ 1 ~] [~ 2 ~ 3] [~ -1 0 ~]] [${POCKET_BASS}]>").scale("C2:minor:pentatonic").s("fingerbass").lpf(800)`,
      horns: horns(),
    }),
    /** WRONG: in bar 4 the kick moves from the one to the and of 4. */
    kickMissesOne: rc1({
      kick: `kick: s("<[${POCKET_KICK}] [${POCKET_KICK}] [${POCKET_KICK}] [[~ ~ ~ ~] [~ ~ ~ bd] [~ ~ bd ~] [~ ~ bd ~]]>")`,
      horns: horns(),
    }),
    /** WRONG: the horns hold the chord for the whole bar: a pad, not stabs. */
    hornsHeld: rc1({ horns: `horns: chord("Cm7").voicing().s("${hornSound}")${synth}` }),
    /** WRONG (the right line, not heard): the stabs at `.gain(0)`. */
    hornsSilent: rc1({ horns: horns(HORN_STRUCT, ".gain(0)") }),
    /** WRONG: one stab in four bars. */
    hornsSparse: rc1({ horns: horns("<[~ [~ ~ x ~] ~ ~] ~ ~ ~>") }),
  } as const;
}

const fail = (name: string, code: string): TestCase => ({
  name,
  response: { code },
  expect: "fail",
  feedback: ["rubric.unmet"],
});
const pass = (name: string, code: string): TestCase => ({ name, response: { code }, expect: "pass" });

/**
 * The brief's tests (content CI grades them in capstone mode, linted at RC1.S1, so the stabs play on a synth: contracts
 * §6.6 RC1 "any unlocked sound"). rc1.test.ts grades the same pieces on `horns` at RC1.S2, rule by rule.
 */
export function rc1BriefTests(): TestCase[] {
  const P = rc1Pieces("sawtooth");
  const W = rc1Wrong("sawtooth");
  return [
    fail("the starter: the pocket on the eighth grid, no horns yet", RC1_STARTER_CODE),
    // One passing piece per shipped flavour (contracts §6.6); a flavour never changes the rubric.
    pass("funk: Cm7 at 100 on the 808, finger bass, clav, stabs", P.funk),
    pass("jazz-soul: Fm7 at 96, upright and Rhodes", P.jazzSoul),
    pass("pop: Am7 at 108, electric bass and piano", P.pop),
    pass("indie: Em7 at 92 on the LinnDrum, electric bass and piano", P.indie),
    pass("minimal: the starter's drums, three bass notes off the eighths, two stabs a bar", P.minimal),
    pass(
      "beyond the brief: sixteen bars with a break, the horn figure displaced in the last vamp",
      P.arranged,
    ),
    // Known-wrong pieces, one per required rule (the others hold).
    fail("weak: the hats' ghost notes at velocity 0 (not heard)", W.ghostsSilent),
    fail("weak: every hat at .3, no accents", W.hatsAllQuiet),
    fail("weak: the ghost notes on the beats, the accents between them", W.ghostsOnBeats),
    fail("weak: the starter's bass moved an eighth later, still on the eighth grid", W.bassLateEighth),
    fail("weak: the bass leaves out the one in bar 3", W.bassMissesOne),
    fail("weak: the kick moves off the one in bar 4", W.kickMissesOne),
    fail("weak: the horns hold the chord for a whole bar", W.hornsHeld),
    fail("weak: the stabs at gain 0 (not heard)", W.hornsSilent),
    fail("weak: one stab in four bars", W.hornsSparse),
  ];
}
