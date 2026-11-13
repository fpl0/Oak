// Greensleeves (trad), the familiar minor tune: an eight-bar strain sung twice and the refrain ("Greensleeves was
// all my joy") sung twice, in E minor, 3/4, with a one-beat pickup. Its colour is minor's two movable notes: the
// natural ♭6 (C) as a neighbour of 5 in the strain, the raised 6 (C♯) on the refrain's way down from ♭7, and the
// raised 7 (D♯) leading home at every cadence.
// Oak sets it in 3/4 (the source transcription is in 6/4, two of Oak's bars to one of its bars) with every attack
// where the source has it: each dotted quarter and eighth becomes a quarter, an eighth rest and the eighth, and
// each dotted half a half and a quarter rest.
// Harmony, one chord a bar (Oak's, after the usual accompaniment): i III VII v | i VI V V | i III VII v | i V i i,
// the refrain III VII VII v | i VI V V | III VII VII v | i V i i.
import { noteSong } from "../tunes.ts";

export const setting =
  "3/4 with every attack where the source has it: a dotted quarter and eighth become a quarter, an eighth rest and the eighth; a dotted half becomes a half and a quarter rest.";
const UP = ["[g4@2 a4]", "[b4@2 ~ c5 b4@2]", "[a4@2 f#4]", "[d4@2 ~ e4 f#4@2]"];
const GREEN = ["[d5@2 ~]", "[d5@4 c#5 b4]", "[a4@2 f#4]", "[d4@2 ~ e4 f#4@2]"];
export default noteSong({
  id: "song.greensleeves",
  bpm: 108,
  melody: [
    // Pickup: 1
    "[~ ~ e4]",
    // Strain, line 1: ♭3 4 | 5 ♭6 5 | 4 2 | ♭7, 1 2 | ♭3 1 | 1 ♯7, 1 | 2 ♯7, | 5, (1)
    ...UP,
    "[g4@2 e4]",
    "[e4@2 ~ d#4 e4@2]",
    "[f#4@2 d#4]",
    "[b3@2 e4]",
    // Strain, line 2: the same to bar 12, then ♭3 2 1 | ♯7, ♯6, ♯7, | 1 | 5,
    ...UP,
    "[g4@2 ~ f#4 e4@2]",
    "[d#4@2 ~ c#4 d#4@2]",
    "[e4@2 ~]",
    "[b3@2 ~]",
    // Refrain, line 1: ♭7 | ♭7 ♯6 5 | 4 2 | ♭7, 1 2 | ♭3 1 | 1 ♯7, 1 | 2 ♯7, | 5,
    ...GREEN,
    "[g4@2 e4]",
    "[e4@2 ~ d#4 e4@2]",
    "[f#4@2 d#4]",
    "[b3@2 ~]",
    // Refrain, line 2: the same to bar 28, then ♭3 1 | ♯7, ♯6, ♯7, | 1 | 1
    ...GREEN,
    "[g4@2 e4]",
    "[d#4@2 ~ c#4 d#4@2]",
    "[e4@2 ~]",
    "[e4@2 ~]",
  ],
  harmony: [
    ...["Em", "G", "D", "Bm", "Em", "C", "B", "B"],
    ...["Em", "G", "D", "Bm", "Em", "B", "Em", "Em"],
    ...["G", "D", "D", "Bm", "Em", "C", "B", "B"],
    ...["G", "D", "D", "Bm", "Em", "B", "Em", "Em"],
  ],
  phrases: [
    [1, 4],
    [5, 8],
    [9, 12],
    [13, 16],
    [17, 20],
    [21, 24],
    [25, 28],
    [29, 32],
  ],
  setting,
});
