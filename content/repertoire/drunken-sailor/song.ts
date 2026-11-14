// Drunken Sailor (trad), the verse in D Dorian (D minor with its 6th raised: B natural), 4/4, no pickup: eight bars,
// a repeated 5 that drops to home and climbs the chord back (twice on i, once a step lower on ♭VII), then the
// climb sol la te do (A B C D) in bar 6, whose B is the Dorian note, and the fall to home. The chorus is not set: it waits for the verifier and the printed source.
// Harmony (Oak's, the shanty's own two chords): i i ♭VII ♭VII i i ♭VII i (Dm Dm C C Dm Dm C Dm).
import { noteSong } from "../tunes.ts";

export const setting =
  "The verse only, in plain rhythm as commonly sung (eighths and quarters, a half note to end). Harmony: i and ♭VII, one chord a bar.";

export default noteSong({
  id: "song.drunken-sailor",
  bpm: 112,
  melody: [
    // 5 5 5 5 5 5 | 5 1 3 5 | 4 4 4 4 4 4 | 4 ♭7, 2 4 | 5 5 5 5 5 5 | 5 6 ♭7 1' | ♭7 5 4 2 | 1 1
    "[a4 [a4 a4] a4 [a4 a4]]",
    "[a4 d4 f4 a4]",
    "[g4 [g4 g4] g4 [g4 g4]]",
    "[g4 c4 e4 g4]",
    "[a4 [a4 a4] a4 [a4 a4]]",
    "[a4 b4 c5 d5]",
    "[c5 a4 g4 e4]",
    "[d4@2 d4@2]",
  ],
  harmony: ["Dm", "Dm", "C", "C", "Dm", "Dm", "C", "Dm"],
  phrases: [
    [1, 4],
    [5, 8],
  ],
  setting,
});
