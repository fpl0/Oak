// Frankie and Johnny (trad), one 12-bar verse, in C, no pickup: three lines of four bars over the blues-shaped
// changes. The opening figure (1 2 3 6 5 3 | 1, "Frankie and Johnny were lovers") comes twice and falls to home;
// the middle line climbs to the octave over IV; the last ("He was her man, but he done her wrong") falls to 2 over
// V and home.
// Plain rhythm: every attack where the source has it except one (bar 10: the sixteenth-note pickup to beat 3 moves
// to the off-beat eighth); dotted and tied values are cut to plain ones, then a rest. The source's verse has eleven
// bars, its last note held; Oak lets bar 11 hold it and bar 12 rest, so the verse is a 12-bar strain.
// Harmony (Oak's, the plain changes with a turnaround): I I I I | IV IV I I | V7 V7 I V7 (C C C C | F F C C |
// G7 G7 C G7); the V7 in bar 12, where the tune rests, turns the strain back to its top.
import { noteSong } from "../tunes.ts";

export const setting =
  "Every attack where the source has it except bar 10, whose sixteenth note moves to the eighth before beat 3; dotted and tied values become plain ones, then a rest; bar 12 rests.";
const LOVERS = "[c4 d4 e4 a4@2 g4 e4@2]";
export default noteSong({
  id: "song.frankie-and-johnny",
  bpm: 112,
  melody: [
    // Line 1: 1 2 3 6 5 3 | 1 1 | 1 2 3 6 5 3 | 1 (1)
    LOVERS,
    "[c4@2 c4@4 ~@2]",
    LOVERS,
    "[c4@4 ~@3 c4]",
    // Line 2: 4 5 6 1' 2' 6 | 1' 1' 6 7 | 1' 1' 1' 7 6 | 5 3 3 3
    "[f4 g4 a4 c5@2 d5 a4@2]",
    "[c5@2 c5@4 a4 b4]",
    "[c5 c5@2 c5 b4@2 a4@2]",
    "[g4 e4 e4 e4]",
    // Line 3: 2 | 3 2 3 3 | 1 | –
    "d4",
    "[~@2 e4 d4 e4 e4@2 ~]",
    "c4",
    "~",
  ],
  harmony: ["C", "C", "C", "C", "F", "F", "C", "C", "G7", "G7", "C", "G7"],
  phrases: [
    [1, 4],
    [5, 8],
    [9, 12],
  ],
  swing: { subdivision: 8, amount: 1 / 3 },
  setting,
});
