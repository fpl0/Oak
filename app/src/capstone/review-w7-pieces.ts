// Pieces for the Wave 7 learner review of the eight track capstones (review-w7.test.ts; not a test): for each, two
// honest pieces a learner at that point would write, different from the authored references, and the plausible
// near misses the review tried. Every name says what the piece does; every verdict is checked by the real grader.

const ride = 'drums: s("rd [rd rd] rd [rd rd]").swingBy(1/3, 4).bank("jazzkit").gain(.4)';

/** JC1 honest: F, E♭ and D♭ (down whole steps), ii–V–I–I each, a decorated guide-tone line on the vibes, at 66. */
export const JC1_DOWN_STEPS = `setcpm(66/4)

const changes = "<Gm7 C7 F^7 F^7 Fm7 Bb7 Eb^7 Eb^7 Ebm7 Ab7 Db^7 Db^7 Gm7 C7 F^7 F^7>"

${ride}
chords: chord(changes).voicing().s("rhodes").gain(.5)
bass: chord(changes).rootNotes(2).s("upright")
melody: note("<[f5@3 d5] [e5@2 g5 e5] [e5@3 c5] [a4 c5 e5 g5] [eb5@3 c5] [d5@2 f5 d5] [d5@3 bb4] [g4 bb4 d5 f5] [db5@3 bb4] [c5@2 eb5 c5] [c5@3 ab4] [f4 ab4 c5 eb5] [bb4@3 g4] [bb4@2 c5 bb4] [a4@3 f4] [a4@4]>").s("vibes")`;

/** JC1 honest: minor ii–Vs into A minor, G minor and F minor, guide-tone shells on the piano, the thread in whole notes, at 60. */
export const JC1_MINOR = `setcpm(60/4)

const changes = "<Bm7b5 E7b9 Am7 Am7 Am7b5 D7b9 Gm7 Gm7 Gm7b5 C7b9 Fm7 Fm7 Bm7b5 E7b9 Am7 Am7>"

chords: chord(changes).dict("guidetones").voicing().s("piano").gain(.5)
bass: chord(changes).rootNotes(2).s("upright")
melody: note("<a4 g#4 g4 g4 g4 f#4 f4 f4 f4 e4 eb4 eb4 d4 d4 c4 c4>").s("vibes")`;

/** JC1 honest too: the guide tones arrive an 8th early, tied over each change (an anticipation). */
export const JC1_ANTICIPATED = JC1_DOWN_STEPS.replace(
  /melody: .*$/m,
  'melody: note("<[f5@7 e5] [e5@7 e5] [e5@7 eb5] [eb5@8] [eb5@7 d5] [d5@7 d5] [d5@7 db5] [db5@8] [db5@7 c5] [c5@7 c5] [c5@7 bb4] [bb4@8] [bb4@7 bb4] [bb4@7 a4] [a4@8] [a4@8]>").s("vibes")',
);

/** JC1 near miss: three keys, but no ii–V anywhere (I and IV in C, E♭ and A). */
export const JC1_NO_TWO_FIVE = `setcpm(66/4)

const changes = "<C^7 F^7 C^7 C^7 Eb^7 Ab^7 Eb^7 Eb^7 A^7 D^7 A^7 A^7 C^7 F^7 C^7 C^7>"

${ride}
chords: chord(changes).voicing().s("rhodes").gain(.5)
bass: chord(changes).rootNotes(2).s("upright")
melody: note("<b4 a4 b4 b4 d5 c5 d5 d5 c#5 c#5 c#5 c#5 b4 a4 b4 b4>").s("vibes")`;

/** JC1 near miss: the right line written at gain .03, 24 dB and more under the ride: not heard. */
export const JC1_BURIED = JC1_DOWN_STEPS.replace('.s("vibes")', '.s("vibes").gain(.03)');

/** JC1 near miss: the ii–Vs reach three keys; the tune lands on the 5th of every chord, a chord tone but no guide tone. */
export const JC1_FIFTHS = JC1_DOWN_STEPS.replace(
  /melody: .*$/m,
  'melody: note("<d5 g4 c5 c5 c5 f4 bb4 bb4 bb4 eb4 ab4 ab4 d5 g4 c5 c5>").s("vibes")',
);

/** RC1 honest: D minor at 104, its own kick, the bass on the e and the a, clav and two short stabs a bar. */
export const RC1_D_MINOR = `setcpm(104/4)

kick: s("[bd ~ ~ ~] [~ ~ bd ~] [~ bd ~ ~] [~ ~ ~ ~]")
snare: s("[~ ~ ~ ~] [sd ~ ~ sd] [~ ~ ~ ~] [sd ~ ~ ~]")
hats: s("hh*16").velocity("[.9 .3 .5 .3]*4")
bass: n("[0 ~ ~ 2] [~ 3 ~ ~] [4 ~ ~ 3] [~ 1 ~ ~]").scale("D2:minor:pentatonic").s("fingerbass").lpf(900)
keys: chord("Dm7").voicing().struct("[~ x ~ ~] [~ ~ ~ x] [~ x ~ ~] [~ ~ x ~]").s("clav").clip(.4).gain(.5)
horns: chord("Dm7").voicing().struct("[~ ~ ~ ~] [~ ~ x ~] [~ ~ ~ ~] [~ ~ ~ x]").s("horns").clip(.2).gain(.6)`;

/** RC1 honest: G minor at 112, the hats' ghosts written with gain, stabs as hand-voiced stacks; no clav. */
export const RC1_G_MINOR = `setcpm(112/4)

kick: s("bd ~ ~ bd ~ ~ bd ~, ~ ~ ~ ~ ~ ~ ~ [~ bd]")
snare: s("~ sd ~ sd")
hats: s("hh*16").gain("[.8 .25 .45 .25]*4")
bass: note("[g1 ~ ~ g1] [~ ~ bb1 ~] [~ c2 ~ d2] [~ f1 g1 ~]").s("ebass").lpf(700)
horns: note("[~ ~ ~ ~] [[bb3,d4,f4] ~ ~ ~] [~ ~ ~ ~] [~ ~ [c4,f4,a4] ~]").s("horns").clip(.25).gain(.6)`;

/** RC1 near miss: everything on the beat: kick, bass and stabs on the 8ths, even 8th hats. */
export const RC1_ON_THE_BEAT = `setcpm(104/4)

kick: s("bd ~ bd ~ bd ~ bd ~")
snare: s("~ sd ~ sd")
hats: s("hh*8")
bass: note("d2 d2 f2 g2 a2 g2 f2 d2").s("fingerbass")
horns: chord("Dm7").voicing().struct("x ~ x ~").s("horns").clip(.25)`;

/** RC1 near miss: the pocket right, the horns held as two half-bar pads: no stab. */
export const RC1_LONG_HORNS = RC1_D_MINOR.replace(
  /horns: .*$/m,
  'horns: chord("Dm7").voicing().struct("x x").s("horns").gain(.6)',
);

/** RC1 near miss: the sixteenths on the hats, every one at .3: no accent, so no ghost note stands out. */
export const RC1_FLAT_HATS = RC1_D_MINOR.replace(/hats: .*$/m, 'hats: s("hh*16").velocity(.3)');

const CLAVE_32 = "<[rim ~ ~ rim ~ ~ rim ~] [~ ~ rim ~ rim ~ ~ ~]>";
const CLAVE_23 = "<[~ ~ rim ~ rim ~ ~ ~] [rim ~ ~ rim ~ ~ rim ~]>";

/** RC2 honest: A minor at 100, the tresillo on an i–V plan on the upright, a two-bar piano figure, a bell E(5,16). */
export const RC2_A_MINOR = `setcpm(100/4)

perc: s("${CLAVE_32}").gain(.7)
bass: note("<a1 e1 a1 e1 d2 e1 a1 e1>(3,8)").s("upright")
keys: note("<[a3,c4,e4] [g#3,b3,e4]>").struct("<[x ~ ~ x ~ x ~ ~] [~ ~ x ~ x ~ ~ ~]>").s("piano").gain(.5)
kick: s("bd*2").gain(.7)
perc2: s("lt*3").gain(.5)
perc3: s("cb(5,16)").gain(.35)`;

/** RC2 honest: G at 124 on the 808, the cowbell's three against the kick's two, the bell turned by 2 on the hi-hat. */
export const RC2_G_808 = `setcpm(124/4)

perc: s("${CLAVE_32}").bank("RolandTR808").gain(.7)
kick: s("bd*2").bank("RolandTR808")
perc2: s("[cb cb cb]").gain(.4)
perc3: s("hh(5,16,2)").gain(.4)
bass: note("<g1 d2 g1 d2 c2 d2 g1 d2>(3,8)").s("fingerbass").lpf(600)`;

/** RC2 honest too: the tresillo written out by hand (3 + 3 + 2 eighths), not as `(3,8)`. */
export const RC2_TRESILLO_BY_HAND = RC2_A_MINOR.replace(
  /bass: .*$/m,
  'bass: note("<a1 e1 a1 e1 d2 e1 a1 e1>").struct("x ~ ~ x ~ ~ x ~").s("upright")',
);

/** RC2 near miss: the clave turned round, 2-3. */
export const RC2_TURNED = RC2_A_MINOR.replace(CLAVE_32, CLAVE_23);

/** RC2 near miss: the clave an 8th late, off its grid. */
export const RC2_CLAVE_LATE = RC2_A_MINOR.replace(/perc: .*$/m, `perc: s("${CLAVE_32}").gain(.7).late(1/8)`);

/** RC2 near miss: five even hits a bar on the bell, not five over sixteen steps. */
export const RC2_BELL_EVEN = RC2_A_MINOR.replace(/perc3: .*$/m, 'perc3: s("cb*5").gain(.35)');

/** RC2 near miss: three hits over two bars against the kick's two a bar (3:4, not 3:2). */
export const RC2_THREE_OVER_TWO_BARS = RC2_A_MINOR.replace(
  /perc2: .*$/m,
  'perc2: s("lt*3").gain(.5).slow(2)',
);
