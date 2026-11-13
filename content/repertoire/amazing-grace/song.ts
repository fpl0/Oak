// Amazing Grace, the tune New Britain, the first phrase of the verse as U07.L09 reads it: a one-beat pickup
// and seven bars of 3/4 in F (`pickup: { units: [1, 1] }`, one beat). Plain rhythm: the dotted half at the
// end ("me") is a half note and a rest (no dots before U13). Harmony, one triad a bar: I I IV I I I V, the
// chart guitarists play (Oak's choice; the shape-note printings have three voices and no chord symbols).
// U07.L09 reading only, never X1 (contracts §2.8).
import { folkSong } from "../folk.ts";

export const setting =
  "The first phrase of the verse; the final dotted half becomes a half and a rest. Harmony: I I IV I I I V.";
export default folkSong({
  id: "song.amazing-grace",
  bpm: 80,
  melody: [
    // 5 | 1 . 3 1 | 3 . 2 | 1 . 6 | 5 . 5 | 1 . 3 1 | 3 . 2 | 5'
    "[~ ~ -3]",
    "[0@2 [2 0]]",
    "[2@2 1]",
    "[0@2 -2]",
    "[-3@2 -3]",
    "[0@2 [2 0]]",
    "[2@2 1]",
    "[4@2 ~]",
  ],
  harmony: ["I", "I", "IV", "I", "I", "I", "V"],
  phrases: [
    [1, 4],
    [5, 7],
  ],
  setting,
});
