// Careless Love (trad), the 16-bar verse, in F, no pickup: four lines of four bars, "Love, oh love, oh careless
// love" twice around a middle that climbs to the 6 (D) over the IV chord, with one chromatic passing note on the way
// back (G G♯ A, the ♯2 between 2 and 3). The tune is slow and even (quarters, halves and wholes); its feel is the
// blues ballad's, so Oak declares swing 8ths, as the L6 and X2 givens say ("Swing 8ths").
// Plain rhythm: each dotted half becomes a half and a quarter rest; a whole note tied over the bar line becomes the
// whole note and a bar of rest.
// Harmony, one chord a bar (Oak's, the usual changes): I V7 I I | I I V7 V7 | I I IV IV | I V7 I I (F C7 F F | F F
// C7 C7 | F F Bb Bb | F C7 F F).
import { noteSong } from "../tunes.ts";

export const setting =
  "Each dotted half becomes a half and a quarter rest; a note tied over the bar line ends at it and the next bar rests.";
const LOVE = ["[a4@2 ~ f4]", "[e4 c4 e4 g4]", "f4", "~"];
export default noteSong({
  id: "song.careless-love",
  bpm: 88,
  melody: [
    // Line 1: 3 . 1 | 7, 5, 7, 2 | 1 | –
    ...LOVE,
    // Line 2: 3 . 4 | 5 5 6 5 | 2 | – 3 4
    "[a4@2 ~ bb4]",
    "[c5 c5 d5 c5]",
    "g4",
    "[~@2 a4 bb4]",
    // Line 3: 3 . 4 | 5 5 | 6 4 | 1 2 ♯2
    "[a4@2 ~ bb4]",
    "[c5@2 c5@2]",
    "[d5@2 bb4@2]",
    "[f4@2 g4 g#4]",
    // Line 4: as line 1
    ...LOVE,
  ],
  harmony: ["F", "C7", "F", "F", "F", "F", "C7", "C7", "F", "F", "Bb", "Bb", "F", "C7", "F", "F"],
  phrases: [
    [1, 4],
    [5, 8],
    [9, 12],
    [13, 16],
  ],
  swing: { subdivision: 8, amount: 1 / 3 },
  setting,
});
