// RC2 Clave & Polyrhythm (content/specs/R3.md "RC2 Clave & Polyrhythm"; contracts §2.6, §6.6): the starter the first
// session opens with and the pieces the brief's tests grade (content/capstones.ts RC2, content/advanced/capstones/RC2/
// rc2.test.ts, which grades every piece through the real grader in capstone mode, the way the workspace grades a save).
//
// Music checked by running it (headless Strudel and the real grader, rc2.test.ts):
// - 1 cycle = 1 bar of 4/4, and the clave lives on the two-bar eighth grid (`CLAVE_GRIDS`): son 3-2 is bar A {0, 3/8,
//   3/4} and bar B {1/4, 1/2}. 2-3 is the same five strokes with the bars the other way round; rumba moves the
//   three-side's last stroke from 3/4 to 7/8. `.late(1)` of a 3-2 clave is a 2-3 clave (a two-bar loop moved by one
//   bar); `.late(2)` moves it a whole loop and changes nothing.
// - The tresillo is `(3,8)`: eighths 0, 3 and 6 of the bar, 3+3+2. The bass plays it in every bar, on the root of the
//   bar's chord: I under the clave's three-side, V under its two-side.
// - Three against two in a bar: three even hits (every third of the bar) against two (every half). They meet only on
//   the one. `cb(5,16,10)` is the bossa nova bell, 3+3+4+3+3 over the sixteen sixteenths (a five-over-sixteen spread
//   turned ten steps).
// - The montuno is the R3.L04 figure in thirds over C and G7 (and its first bar's rhythm over F in bar 5), each odd bar
//   on the clave's three-side: it faces the clave (more of its hits meet the clave as written than turned round).
// - A piece is as long as its longest loop: the chord plan runs eight bars before it repeats, so a piece written as
//   `<…>` loops is eight bars long; the clave's two bars repeat four times inside it.
// - Every line here is a drum line except the bass and the montuno, so no Band is added under the piece: the brief's
//   `parts` suggestion names the three roles (app/src/capstone/content.ts reads them).

import type { TestCase } from "@oak/content-kit";

const tempo = (bpm: number) => `setcpm(${bpm}/4)`;

/** The son clave 3-2 on the rimshot (`claveMini("son", "3-2")`). */
export const CLAVE_32 = "<[rim ~ ~ rim ~ ~ rim ~] [~ ~ rim ~ rim ~ ~ ~]>";
/** The same five strokes, the two-side first: 2-3. */
export const CLAVE_23 = "<[~ ~ rim ~ rim ~ ~ ~] [rim ~ ~ rim ~ ~ rim ~]>";
/** Rumba 3-2: the three-side's last stroke on the and of 4. */
export const RUMBA_32 = "<[rim ~ ~ rim ~ ~ ~ rim] [~ ~ rim ~ rim ~ ~ ~]>";
/**
 * The R3.L04 montuno's two bars in C: bar A over C, on the clave's three-side; bar B over G7, on its two-side, its last
 * eighth anticipating the next bar's C (E and G), as the tumbao's beat 4 anticipates the next root.
 */
const MONTUNO_C = "[[c4,e4] ~ ~ [e4,g4] [c4,e4] ~ [e4,g4] ~]";
const MONTUNO_G7 = "[~ [d4,f4] [b3,d4] ~ [d4,f4] [b3,d4] ~ [e4,g4]]";
/** Bar B before the F of bar 5: the last eighth anticipates F (F and A). */
const MONTUNO_G7_F = "[~ [d4,f4] [b3,d4] ~ [d4,f4] [b3,d4] ~ [f4,a4]]";
/** Bar A's rhythm over F (bar 5 of the chord plan). */
const MONTUNO_F = "[[c4,f4] ~ ~ [f4,a4] [c4,f4] ~ [f4,a4] ~]";
/** The chord plan of eight bars, I V I V IV V I V: the montuno, and the bass's roots under it. */
export const MONTUNO = `<${[MONTUNO_C, MONTUNO_G7, MONTUNO_C, MONTUNO_G7_F, MONTUNO_F, MONTUNO_G7, MONTUNO_C, MONTUNO_G7].join(" ")}>`;
export const PLAN_ROOTS = "<c2 g1 c2 g1 f1 g1 c2 g1>";

/** The brief's starter: two bars, the clave and a tresillo bass on the roots of I and V (C under the three-side). */
export const RC2_STARTER = [
  tempo(110),
  "",
  `perc: s("${CLAVE_32}")`,
  'bass: note("<c2 g1>(3,8)").s("ebass").lpf(700)',
].join("\n");

export interface Rc2Parts {
  bpm?: number;
  /** Semitones from C for the bass and the montuno (the key is free). */
  transpose?: number;
  bassSound?: string;
  keysSound?: string | null;
  clave?: string;
  bank?: string | null;
  /** Whole lines that replace the defaults (`null` leaves the line out). */
  perc?: string;
  bass?: string;
  keys?: string | null;
  perc2?: string | null;
  kick?: string | null;
  perc3?: string | null;
  consts?: string[];
}

/**
 * A son groove in the brief's shape, eight bars as written-out loops: the clave (two bars), the bass and the montuno
 * on an eight-bar chord plan (`<…>` with eight entries: I V I V IV V I V), the layers on one bar.
 */
export function rc2(p: Rc2Parts = {}): string {
  const t = p.transpose ? `.transpose(${p.transpose})` : "";
  const bank = p.bank ? `.bank("${p.bank}")` : "";
  return [
    tempo(p.bpm ?? 110),
    "",
    ...(p.consts ? [...p.consts, ""] : []),
    p.perc ?? `perc: s("${p.clave ?? CLAVE_32}")${bank}.gain(.8)`,
    ...(p.kick === null ? [] : [p.kick ?? `kick: s("bd*2")${bank}.gain(.8)`]),
    ...(p.perc2 === null ? [] : [p.perc2 ?? `perc2: s("mt*3")${bank}.gain(.55)`]),
    ...(p.perc3 === null ? [] : [p.perc3 ?? 'perc3: s("cb(5,16,10)").gain(.4)']),
    p.bass ?? `bass: note("${PLAN_ROOTS}(3,8)")${t}.s("${p.bassSound ?? "ebass"}").lpf(700)`,
    ...(p.keys === null
      ? []
      : [p.keys ?? `keys: note("${MONTUNO}")${t}.s("${p.keysSound ?? "piano"}").gain(.6)`]),
  ].join("\n");
}

/** One passing piece per shipped flavour (contracts §5.10 rule 8), and the brief's minimum and a piece beyond it. */
export const RC2_PIECES = {
  /** pop: C at 110, electric bass and piano montuno. */
  pop: rc2(),
  /** funk: D at 104 on the 808, finger bass, the montuno on the clav. */
  funk: rc2({ bpm: 104, transpose: 2, bank: "RolandTR808", bassSound: "fingerbass", keysSound: "clav" }),
  /** jazz-soul: F at 96, upright and Rhodes. */
  jazzSoul: rc2({ bpm: 96, transpose: 5, bassSound: "upright", keysSound: "rhodes" }),
  /** indie: G at 120 on the LinnDrum, electric bass and piano. */
  indie: rc2({ bpm: 120, transpose: 7, bank: "LinnDrum", bassSound: "ebass", keysSound: "piano" }),
  /** Minimal: the starter's two lines written out to eight bars (the bass on the chord plan), the layers, no montuno. */
  minimal: rc2({ keys: null }),
  /**
   * Beyond the brief: sixteen bars in sections. Eight bars of the groove, a two-bar break where the three-against-two
   * rests and the clave, the kick, the bell, the bass and the montuno hold, then six bars of the groove again.
   */
  arranged: rc2({
    bassSound: "upright",
    consts: ['const perc2Vamp = s("mt*3")'],
    perc2: "perc2: arrange([8, perc2Vamp], [2, silence], [6, perc2Vamp]).gain(.55)",
  }),
  /** Another right clave: `.late(2)` moves the two-bar loop by a whole loop, so every stroke lands where it was. */
  claveLateTwo: rc2({ perc: `perc: s("${CLAVE_32}").late(2).gain(.8)` }),
  /** Another right bell: the five-over-sixteen spread in another rotation, written with `.euclidRot()`. */
  bellRotated: rc2({ perc3: 'perc3: s("cb").euclidRot(5, 16, 3).gain(.4)' }),
} as const;

/** The known-wrong pieces, each failing ONE required rule while the others hold (the pop piece changed in one place). */
export const RC2_WRONG = {
  /** WRONG: the clave in bars 1–2 only of eight. */
  claveTwoBars: rc2({ clave: "<[rim ~ ~ rim ~ ~ rim ~] [~ ~ rim ~ rim ~ ~ ~] ~ ~ ~ ~ ~ ~>" }),
  /** WRONG (the same strokes, the other order): the clave 2-3. */
  claveTwoThree: rc2({ clave: CLAVE_23 }),
  /** WRONG (the right function, the wrong result): the 3-2 clave `.late(1)`, which is 2-3. */
  claveLateOne: rc2({ perc: `perc: s("${CLAVE_32}").late(1).gain(.8)` }),
  /** WRONG: the rumba clave 3-2. */
  rumba: rc2({ clave: RUMBA_32 }),
  /** WRONG: the clave with an extra stroke on beat 1 of its two-side. */
  claveExtra: rc2({ clave: "<[rim ~ ~ rim ~ ~ rim ~] [rim ~ rim ~ rim ~ ~ ~]>" }),
  /** WRONG: the tresillo in bars 1–4 only; bars 5–8 hold one note a bar. */
  tresilloHalf: rc2({
    bass: 'bass: note("<c2(3,8) g1(3,8) c2(3,8) g1(3,8) f1 g1 c2 g1>").s("ebass").lpf(700)',
  }),
  /** WRONG: three and two in alternating bars, never together. */
  polyAlternating: rc2({ perc2: 'perc2: s("<mt*3 ~>").gain(.55)', kick: 'kick: s("<~ bd*2>").gain(.8)' }),
  /** WRONG (the right line, not heard): the three at `.gain(0)`. */
  polySilent: rc2({ perc2: 'perc2: s("mt*3").gain(0)' }),
  /** WRONG (the right call, the wrong grid): `cb(5,8)`, five over eight. */
  bellOnEight: rc2({ perc3: 'perc3: s("cb(5,8)").gain(.4)' }),
  /** WRONG: no bell at all; the bass's `(3,8)` still meets "written with (k,n)". */
  noBell: rc2({ perc3: null }),
  /**
   * WRONG: a tumbao in place of the tresillo (the and of 2, and beat 4 on the next chord's root): the brief keeps the
   * tresillo in every bar. The bell is unrotated here, so `(k,n)` is still written.
   */
  tumbao: rc2({
    perc3: 'perc3: s("cb(5,16)").gain(.4)',
    bass: 'bass: note("<[~ ~ ~ g2 ~ ~ g1 ~] [~ ~ ~ d2 ~ ~ c2 ~] [~ ~ ~ g2 ~ ~ g1 ~] [~ ~ ~ d2 ~ ~ f1 ~] [~ ~ ~ c2 ~ ~ g1 ~] [~ ~ ~ d2 ~ ~ c2 ~] [~ ~ ~ g2 ~ ~ g1 ~] [~ ~ ~ d2 ~ ~ c2 ~]>").s("ebass").lpf(700)',
  }),
} as const;

const fail = (name: string, code: string): TestCase => ({
  name,
  response: { code },
  expect: "fail",
  feedback: ["rubric.unmet"],
});
const pass = (name: string, code: string): TestCase => ({ name, response: { code }, expect: "pass" });

/** The brief's tests (content CI grades them in capstone mode); rc2.test.ts grades them rule by rule. */
export function rc2BriefTests(): TestCase[] {
  const P = RC2_PIECES;
  const W = RC2_WRONG;
  return [
    fail("the starter: two bars, no layers yet", RC2_STARTER),
    // One passing piece per shipped flavour (contracts §6.6); a flavour never changes the rubric.
    pass("pop: C at 110, electric bass, piano montuno", P.pop),
    pass("funk: D at 104 on the 808, finger bass, the montuno on the clav", P.funk),
    pass("jazz-soul: F at 96, upright and Rhodes", P.jazzSoul),
    pass("indie: G at 120 on the LinnDrum, electric bass and piano", P.indie),
    pass("minimal: the clave and the tresillo bass for eight bars, the three layers, no montuno", P.minimal),
    pass("beyond the brief: sixteen bars with a two-bar break where the three-against-two rests", P.arranged),
    pass("the clave moved a whole loop (`.late(2)`): every stroke where it was", P.claveLateTwo),
    pass("the bell in another rotation, with `.euclidRot()`", P.bellRotated),
    // Known-wrong pieces, one per required rule (the others hold).
    fail("weak: the clave in bars 1–2 only", W.claveTwoBars),
    fail("weak: the clave 2-3 (the same strokes, the other order)", W.claveTwoThree),
    fail("weak: the 3-2 clave moved one bar (`.late(1)`), which is 2-3", W.claveLateOne),
    fail("weak: the rumba clave", W.rumba),
    fail("weak: an extra stroke on the clave's two-side", W.claveExtra),
    fail("weak: the tresillo in bars 1–4 only", W.tresilloHalf),
    fail("weak: a tumbao in place of the tresillo", W.tumbao),
    fail("weak: three and two in alternating bars, never together", W.polyAlternating),
    fail("weak: the three at gain 0 (not heard)", W.polySilent),
    fail("weak: the bell five over eight", W.bellOnEight),
    fail("weak: no bell; the bass's (3,8) is the only Euclidean rhythm", W.noBell),
  ];
}
