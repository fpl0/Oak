// Oh! Susanna (S. C. Foster, 1848), verse and chorus, in G. Foster's 2/4 bars are paired into twelve bars of
// 4/4. Plain rhythm: the dotted eighth and sixteenth pairs and the sixteenth-note pickups become even eighths
// (so the pickup "I come" is two eighths, one beat), and the held notes that end bars 2, 6 and 10 give a beat
// to the next pickup. Harmony, one triad a bar: I V I I | I V I I | IV V I I.
import { folkSong } from "../folk.ts";

export const setting =
  "Foster's 2/4 paired into 4/4; dotted-eighth and sixteenth figures become even eighths, and the pickups become two eighths.";
const LINE = "[[2 4] [4 5] [4 2] [0 1]]";
export default folkSong({
  id: "song.oh-susanna",
  bpm: 100,
  melody: [
    // Pickup: 1 2
    "[~ ~ ~ [0 1]]",
    // Phrase 1: 3 5 5 6 5 3 1 2 | 3 3 2 1 2 (1 2) | again | 3 3 2 2 1 (1 2)
    LINE,
    "[[2 2] [1 0] 1 [0 1]]",
    LINE,
    "[[2 2] [1 1] 0 [0 1]]",
    // Phrase 2: the same, ending on 1
    LINE,
    "[[2 2] [1 0] 1 [0 1]]",
    LINE,
    "[[2 2] [1 1] 0 ~]",
    // Phrase 3 (chorus): 4 4 6 6 6 | 5 5 3 1 2 (1 2) | the line | 3 3 2 2 1
    "[3 3 [5 5@2 5]@2]",
    "[[4 4] [2 0] 1 [0 1]]",
    LINE,
    "[[2 2] [1 1] 0 ~]",
  ],
  harmony: ["I", "V", "I", "I", "I", "V", "I", "I", "IV", "V", "I", "I"],
  phrases: [
    [1, 4],
    [5, 8],
    [9, 12],
  ],
  setting,
});
