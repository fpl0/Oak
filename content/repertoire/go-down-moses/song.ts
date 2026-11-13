// Go Down Moses (spiritual), the verse: two lines on the same tune, in A minor with a one-beat pickup.
//   5 | ♭3 ♭3 2 2 | ♭3 ♭3 1 . | 5 5 ♯7 ♯7 | 1 . . 5 |   ("When Israel was in Egypt's land, Let my people go")
//   ♭3 ♭3 2 2 | ♭3 ♭3 1 . | 5 5 ♯7 ♯7 | 1 . . . |     ("Oppressed so hard they could not stand, Let my people go")
// The pickup and "let my" are the 5 below home; "peo-ple" climbs to the raised 7 (G♯, as an accidental) and "go"
// lands on 1. The rhythm is quarters and halves except "peo-ple", an eighth and a quarter on beat 3 (the sources
// have an eighth and a dotted quarter; the quarter is followed by an eighth rest). The refrain ("Go down, Moses …")
// is not set: the two transcriptions the author checked agree on the verse note for note and differ in the refrain's
// middle bars, so the refrain waits for the verifier and the printed 1872 edition.
// Harmony, one triad a bar (Oak's): i i V i | i i V i, with the major V (E, harmonic minor) under the raised 7.
import { noteSong } from "../tunes.ts";

export const setting =
  'Plain rhythm: "peo-ple" is an eighth and a quarter (then an eighth rest) where the sources have an eighth and a dotted quarter. The verse only; the refrain is not set.';
const LINE = ["[c5 c5 b4 b4]", "[c5 c5 a4@2]", "[e4@2 e4@2 g#4 g#4@2 ~]"];
export default noteSong({
  id: "song.go-down-moses",
  bpm: 76,
  melody: [
    // Pickup: 5 (below home)
    "[~ ~ ~ e4]",
    // Line 1: ♭3 ♭3 2 2 | ♭3 ♭3 1 | 5 5 ♯7 ♯7 | 1 (5)
    ...LINE,
    "[a4@2 ~ e4]",
    // Line 2: the same, ending on 1
    ...LINE,
    "a4",
  ],
  harmony: ["Am", "Am", "E", "Am", "Am", "Am", "E", "Am"],
  phrases: [
    [1, 4],
    [5, 8],
  ],
  setting,
});
