// Simple Gifts (J. Brackett, 1848), the A and B strains, in F, with a pickup of two eighths. Only bar 9 has
// a dotted note in the usual printing (5 . 3 2, a dotted quarter and an eighth): Oak plays it 5 (half) 3 2
// (quarters). Harmony, one triad a bar: I I V V | I I V I | I I I V | I I V I.
import { folkSong } from "../folk.ts";

export const setting = "Bar 9's dotted quarter and eighth become two quarters; everything else as printed.";
export default folkSong({
  id: "song.simple-gifts",
  bpm: 96,
  melody: [
    // Pickup: 5 5 (below home)
    "[~ ~ ~ [-3 -3]]",
    // Phrase 1: 1 1 2 3 1 3 4 | 5 5 4 3 2 1 | 2 2 2 1 | 2 3 2 7 5 5
    "[0 [0 1] [2 0] [2 3]]",
    "[4 [4 3] 2 [1 0]]",
    "[1 1 1 0]",
    "[[1 2] [1 -1] -3 -3]",
    // Phrase 2: as phrase 1, then 2 2 3 3 2 | 1 1 2 1
    "[0 [0 1] [2 0] [2 3]]",
    "[4 [4 3] 2 [1 0]]",
    "[1 1 2 [2 1]]",
    "[0 [0 1] 0@2]",
    // Phrase 3: 5 3 2 | 3 4 3 2 1 1 2 | 3 3 4 5 4 3 | 2 2 3 2 5
    "[4@2 2 1]",
    "[[2 3] [2 1] 0 [0 1]]",
    "[2 [2 3] 4 [3 2]]",
    "[1 [1 2] 1 -3]",
    // Phrase 4: 1 7 1 2 3 1 3 4 | 5 5 4 3 3 2 | 2 2 3 3 2 | 1 1 2 1
    "[[0 -1] [0 1] [2 0] [2 3]]",
    "[4 [4 3] 2 [2 1]]",
    "[1 1 2 [2 1]]",
    "[0 [0 1] 0@2]",
  ],
  harmony: ["I", "I", "V", "V", "I", "I", "V", "I", "I", "I", "I", "V", "I", "I", "V", "I"],
  phrases: [
    [1, 4],
    [5, 8],
    [9, 12],
    [13, 16],
  ],
  setting,
});
