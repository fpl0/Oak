// Pieces for the Wave 7 capstone tests and specs (not a spec): track-capstone drafts written the way a learner
// writes them, each checked against the real headless grader in wave7.test.ts. Every musical claim in a name is
// what the grader's views read from the piece (keys reached, guide tones, the clave's direction, the swing ratio).

/** JC1: sixteen bars of chained ii–Vs into C major, E♭ major and A minor, a guide-tone line on 3rds and 7ths. */
export const JC1_BALLAD = `setcpm(72/4)

const changes = "<Dm7 G7 C^7 C^7 Fm7 Bb7 Eb^7 Eb^7 Bm7b5 E7 Am7 Am7 Dm7 G7 C^7 C^7>"

chords: chord(changes).dict("guidetones").voicing().s("piano")
bass: chord(changes).rootNotes(2).s("upright")
melody: note("<f5 f5 e5 e5 eb5 d5 d5 d5 d5 d5 c5 c5 c5 b4 b4 b4>").s("vibes")`;

/** JC1, the right function and the wrong result: ii–Vs chained, every one of them into C major. */
export const JC1_ONE_KEY = `setcpm(72/4)

const changes = "<Dm7 G7 C^7 C^7 Dm7 G7 C^7 C^7 Dm7 G7 C^7 C^7 Dm7 G7 C^7 C^7>"

chords: chord(changes).dict("guidetones").voicing().s("piano")
bass: chord(changes).rootNotes(2).s("upright")
melody: note("<f5 f5 e5 e5 f5 f5 e5 e5 c5 b4 b4 b4 c5 b4 b4 b4>").s("vibes")`;

/** JC2: a jazz blues in F, comping and bass both reading \`changes\`, and a head over two choruses. */
export const JC2_HEAD = `setcpm(132/4)

const changes = "<F7 Bb7 F7 [Cm7 F7] Bb7 Bo7 F7 D7 Gm7 C7 F7 C7>"
const head = n("<[0 2 4 2] [3 ~ 1 ~] [0 ~ ~ 4] [2 ~ ~ ~] [3 3 5 3] [4 ~ 3 ~] [2 1 0 ~] [~ ~ 4 5] [6 4 ~ 2] [5 ~ 4 ~] [2 0 ~ ~] [~ ~ ~ ~]>").scale("F4:mixolydian").s("vibes")

hats: s("rd*8").swingBy(1/3, 4).gain(.5)
chords: chord(changes).voicing().struct("~ x ~ x").s("piano")
bass: chord(changes).rootNotes(2).struct("x*4").s("upright")
melody: arrange([12, head], [12, head])`;

/** JC2, one chorus only: the head stops after twelve bars. */
export const JC2_ONE_CHORUS = `setcpm(132/4)

const changes = "<F7 Bb7 F7 [Cm7 F7] Bb7 Bo7 F7 D7 Gm7 C7 F7 C7>"

chords: chord(changes).voicing().struct("~ x ~ x").s("piano")
bass: note("<f2 bb2 f2 c3 bb2 b2 f2 d3 g2 c3 f2 c3>").struct("x*4").s("upright")
melody: arrange([12, n("<[0 2 4 2] [3 ~ 1 ~] [0 ~ ~ 4] [2 ~ ~ ~] [3 3 5 3] [4 ~ 3 ~] [2 1 0 ~] [~ ~ 4 5] [6 4 ~ 2] [5 ~ 4 ~] [2 0 ~ ~] [~ ~ ~ ~]>").scale("F4:mixolydian").s("vibes")], [12, silence])`;

/** JC3: AABA on rhythm changes in B♭ with the bridge D7 G7 C7 F7, two bars each. */
export const JC3_AABA = `setcpm(160/4)

const chordsA = chord("<[Bb^7 Gm7] [Cm7 F7]>").voicing()
const chordsB = chord("<D7 D7 G7 G7 C7 C7 F7 F7>").voicing()

chords: arrange([8, chordsA], [8, chordsA], [8, chordsB], [8, chordsA]).s("piano")`;

/** RC1: the pocket with horn stabs: the one on the kick and the bass, a bass between the 8ths, short stabs. */
export const RC1_POCKET = `setcpm(100/4)

kick: s("bd ~ ~ bd ~ ~ bd ~")
snare: s("~ sd ~ sd")
hats: s("hh*16").velocity("[1 .35 .6 .35]*4")
bass: note("c2 ~ [~ c2] ~ [~ eb2] ~ g2 [~ c3]").s("fingerbass").lpf(800)
horns: note("<[~ ~ [eb4,g4,bb4] ~] [~ [eb4,g4,bb4] ~ ~]>").s("horns").clip(.25)`;

/** RC1, the one missing: the kick and the bass both start after beat 1. */
export const RC1_NO_ONE = `setcpm(100/4)

kick: s("~ bd ~ bd ~ ~ bd ~")
hats: s("hh*16").velocity("[1 .35 .6 .35]*4")
bass: note("~ c2 ~ c2 [~ eb2] ~ g2 ~").s("fingerbass").lpf(800)`;

/** RC2: son clave 3-2 on the rim for eight bars, a tresillo bass, three bells against two kicks, a Euclidean hat. */
export const RC2_CLAVE = `setcpm(110/4)

perc: s("<[rim ~ ~ rim ~ ~ rim ~] [~ ~ rim ~ rim ~ ~ ~]>")
bass: note("<c2 c2 f2 g2 c2 f2 g2 g2>(3,8)").s("ebass").lpf(700)
perc2: s("cb*3").gain(.6)
kick: s("bd*2")
perc3: s("hh(5,16)").gain(.5)`;

/** RC2, the right clave turned round: the same hits, 2-3 (the two-side first). */
export const RC2_CROSSED = `setcpm(110/4)

perc: s("<[~ ~ rim ~ rim ~ ~ ~] [rim ~ ~ rim ~ ~ rim ~]>")
bass: note("c2(3,8)").s("ebass").lpf(700)`;

/** AC2: eight bars of hand-voiced ninth and eleventh chords with a smooth top voice, swung 16th hats, a snare that leans back. */
export const AC2_BALLAD = `setcpm(76/4)

hats: s("hh*16").swingBy(.2, 8).gain(.5)
snare: s("~ sd ~ sd").late(.0063)
chords: note("<[d3,f#3,a3,c#4,e4] [e3,g3,a3,d4] [f#3,a3,c#4,e4] [b2,d3,a3,c#4,d4] [d3,f#3,a3,c#4,e4] [e3,g3,a3,d4] [f#3,a3,c#4,e4] [b2,f#3,a3,c#4,d4]>").s("rhodes")
mel: note("<[e5@3 c#5] [a4@2 b4 d5] [c#5@2 a4 e4] [c#5@3 ~] [e5@2 f#5 e5] [a4@2 b4 d5] [e5@2 c#5 a4] [d5@3 ~]>").s("vibes").gain(.8)`;

/** AC2, the chords from the dictionary: \`voicing()\` picks every note, so the top voice is not the learner's. */
export const AC2_DICTIONARY = `setcpm(76/4)

hats: s("hh*16").swingBy(.2, 8).gain(.5)
snare: s("~ sd ~ sd").late(1/32)
chords: chord("<D^9 Em11 F#m7 Bm9>").voicing().s("rhodes")`;

/**
 * AC2's mix step on two bars (an export-length render, wave7.md §7.3): chords, swung hats, a leaning snare and a
 * choir pad at gain .02 (34 dB down; under .01 the grader drops a note as silent): rendered alone it plays, in the
 * mix it is more than 24 dB under the loudest part, so it is not heard.
 */
export const AC2_MIX_TWO_BARS = `setcpm(76/4)

hats: s("hh*16").swingBy(.2, 8).gain(.5)
snare: s("~ sd ~ sd").late(.0063)
chords: note("<[d3,f#3,a3,c#4,e4] [e3,g3,a3,d4]>").s("rhodes")
pad: note("<[f#3,a3] [g3,b3]>").s("choir").gain(.02)`;
