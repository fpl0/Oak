// Shenandoah (trad), one verse, in D. Terry (1921) prints it in E-flat with bars of 4/4 and 3/4 and many
// dotted notes; Oak's setting is ten bars of plain 4/4 with a one-beat pickup: the dotted quarters become
// quarters or halves and each 3/4 bar gets its spare beat on a held note. The degrees are Terry's.
// Harmony, one triad a bar (Oak's): I IV vi I | vi I | I V I I.
import { folkSong } from "../folk.ts";

export const setting =
  "Terry's mixed 4/4 and 3/4 bars made ten bars of plain 4/4: dotted values become plain ones and each 3/4 bar's held note takes the spare beat.";
export default folkSong({
  id: "song.shenandoah",
  bpm: 72,
  melody: [
    // Pickup: 5
    "[~ ~ ~ -3]",
    // Phrase 1: 1 1 1 2 3 4 | 6 5 1' 7
    "[[0 0] 0 [1 2] 3]",
    "[5 4@2 [7 6]]",
    // Phrase 2: 6 5 6 5 | 3 5 (5)
    "[5@2 4 [5 4]]",
    "[2 4@2 4]",
    // Phrase 3: 6 6 6 3 5 3 | 2 1 2
    "[[5 5] 5 [2 4] 2]",
    "[1 0@2 1]",
    // Phrase 4: 3 1 3 6 | 5 | 1 2 3 2 | 2 1
    "[2@2 0 [2 5]]",
    "4",
    "[[0 1] 2@2 1]",
    "[1 0@2 ~]",
  ],
  harmony: ["I", "IV", "vi", "I", "vi", "I", "I", "V", "I", "I"],
  phrases: [
    [1, 2],
    [3, 4],
    [5, 6],
    [7, 10],
  ],
  setting,
});
