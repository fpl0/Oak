// The reference single of the finale spec (content/specs/CF.md, "Tests": pop), graded by finale.test.ts with the
// real grader. author:finale may start CF-A's pop golden test from it.

/**
 * A pop single that meets the brief (CF.md, "Tests": pop): C major, 100 BPM, verse chorus verse chorus bridge
 * chorus and a last chorus a whole step up, 56 bars (134.4 s). V7/vi to vi in the chorus; the minor iv and
 * ♭VI–♭VII in the bridge; the lift as a `…Chorus2` section for the `chord()` track and a key plan after
 * `arrange()` for the tracks in degrees; a 4–3 suspension at the verse's cadence; a bass that lands between
 * the beats.
 */
export const CF_A_REFERENCE_POP = `setcpm(100/4)

const chordsVerse = chord("<C Am F G>").voicing()
const chordsChorus = chord("<F G E7 Am F G C C>").voicing()
const chordsBridge = chord("<Fm Fm C C Ab Bb G G>").voicing()
const chordsChorus2 = chord("<G A F#7 Bm G A D D>").voicing()
const bassVerse = n("<0 5 3 4>").struct("x ~ ~ x ~ x ~ ~")
const bassChorus = n("<3 4 2 5 3 4 0 0>").struct("x ~ ~ x ~ x ~ ~")
const bassBridge = n("<3 3 0 0 5b 6b 4 4>").struct("x ~ x ~")
const melVerse = n("<[4 ~ 4 2] [0 ~ ~ ~] [3 4 5 7] [7@2 6@2]>")
const melChorus = n("<[7 ~ 7 5] [8 ~ 8 ~] [9 8 6 4#] [5 ~ ~ ~] [7 ~ 7 5] [8 ~ 8 9] [7 ~ ~ ~] ~>")
const melBridge = n("<[5b ~ 4 3] [5b ~ 4 ~] [4 ~ 2 0] ~ [7 ~ 5b 4] [8 ~ 6b 3] [8 ~ ~ ~] [6 ~ ~ ~]>")

kick: s("bd ~ bd ~").gain(.8)
snare: s("~ sd ~ sd").gain(.8)
hats: s("hh*8").gain(.4)
chords: arrange([8, chordsVerse], [8, chordsChorus], [8, chordsVerse], [8, chordsChorus], [8, chordsBridge], [8, chordsChorus], [8, chordsChorus2]).s("piano").gain(.5).room(.3)
bass: arrange([8, bassVerse], [8, bassChorus], [8, bassVerse], [8, bassChorus], [8, bassBridge], [8, bassChorus], [8, bassChorus]).scale("<C2:major!48 D2:major!8>").s("ebass").lpf(700)
mel: arrange([8, melVerse], [8, melChorus], [8, melVerse], [8, melChorus], [8, melBridge], [8, melChorus], [8, melChorus]).scale("<C4:major!48 D4:major!8>").s("piano").room(.25)`;
