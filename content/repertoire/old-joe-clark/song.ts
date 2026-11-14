// Old Joe Clark (trad), the fiddle tune in A Mixolydian (A major with its 7th lowered: G natural), 4/4, with a
// one-beat pickup on 5: two eight-bar strains, the tune (A) and the chorus (B). The strain climbs sol la te la (5 6
// ♭7 6), so te is the top of the tune; the chorus hammers home (1) and ends te to do from below (G3 to A3).
// Oak's setting doubles the note values of its source (16 bars of 4/4 for 16 bars of 2/4): eighths become quarters.
// Harmony (Oak's, the old-time accompaniment, one or two chords a bar): A strain I I I I I I I–V I; B strain
// I I I V I I I–♭VII I. The V is major, as old-time players play it; the tune has no 7th over it, so G natural and G♯ never
// sound together.
import { noteSong } from "../tunes.ts";

export const setting =
  "Note values doubled (the source is in 2/4 with eighths; Oak's setting is 4/4 with quarters), so its sixteenths are eighths and its dotted eighth a dotted quarter. Harmony: Oak's, I with ♭VII and a major V.";

export default noteSong({
  id: "song.old-joe-clark",
  bpm: 120,
  melody: [
    // Pickup: 5
    "[~@3 e4]",
    // A: 5 6 ♭7 6 6 | 5 4 3 | 5 6 ♭7 6 | 5 . 5 | 5 6 ♭7 6 | 5 4 3 | 1 3 2 2 | 1
    "[e4 f#4 g4 [f#4 f#4]]",
    "[e4 d4 c#4@2]",
    "[e4 f#4 g4 f#4]",
    "[e4@2 ~ e4]",
    "[e4 f#4 g4 f#4]",
    "[e4 d4 c#4@2]",
    "[a3 c#4 b3 b3]",
    "a3",
    // B: 1 . 1 1 | 5 4 3 | 1 . 1 1 3 | 2 | 1 . 1 1 | 5 4 3 | 1 3 2 ♭7, | 1
    "[a3@3 a3 a3@4]",
    "[e4 d4 c#4@2]",
    "[a3@3 a3 a3@2 c#4@2]",
    "b3",
    "[a3@3 a3 a3@4]",
    "[e4 d4 c#4@2]",
    "[a3 c#4 b3 g3]",
    "[a3@2 ~@2]",
  ],
  harmony: ["A", "A", "A", "A", "A", "A", ["A", "E"], "A", "A", "A", "A", "E", "A", "A", ["A", "G"], "A"],
  phrases: [
    [1, 4],
    [5, 8],
    [9, 12],
    [13, 16],
  ],
  setting,
});
