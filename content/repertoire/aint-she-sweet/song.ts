// Ain't She Sweet? (M. Ager, words J. Yellen, 1927), the 32-bar chorus, no pickup: four sections of eight bars,
// A A B A. The print is in E-flat; Oak's teaching key is C (the registry's), so everything here is a minor third
// lower than the print. Each A opens on a two-note sigh down a half step and on (6, ♯5, then 5: A, G♯, G), the
// G♯ the third of an E chord, the major III; the A climbs to the high 1 and walks down the dominant chain E7 A7 D7
// G7 to home, two chords a bar in most of its bars. The bridge sits on F7 (IV7) for two bars at a time, the tune
// on one repeated high 1. The second A ends on four quarter notes, the low 1 and three high 1s, into the bridge.
// Harmony (one or two chords a bar, from the transcription below): A: I III | V7 | I III | V7 | I V7/vi | V7/ii |
// V7/V V7 | I V7; second A ends I V7/IV; B: IV7 IV7 I I V7/IV | IV7 IV7 I V7; last A as the first, ending on I.
import { standardSong } from "../standards.ts";
import type { BarHarmony } from "../tunes.ts";

export const setting =
  "The tune and its rhythm follow J. Chambers's abc transcription (in E-flat, cut time, here as 4/4 with the quarter as the beat), moved down a minor third to C; the repeat of the first A is written out with its two endings. Harmony as that transcription has it: its major III (G in E-flat, E in C) stays a triad.";

const A = [
  "[a4 g#4]",
  "[g4@4 ~ a4@2 g4]",
  "[a4 a4 g#4 g#4]",
  "[g4@4 ~ a4@2 g4]",
  "[c5 c5 b4 b4]",
  "[a4@2 a4 a4@2 g4 f4@2]",
  "[e4 d4]",
];
const A_HARMONY: BarHarmony[] = [["C", "E"], "G7", ["C", "E"], "G7", ["C", "E7"], "A7", ["D7", "G7"]];
const BRIDGE: BarHarmony[] = ["F7", "F7", "C", ["C", "C7"], "F7", "F7", "C", "G7"];
export default standardSong({
  id: "song.aint-she-sweet",
  bpm: 176,
  melody: [
    // A1: 6 ♯5 | 5 . 6 5 | 6 6 ♯5 ♯5 | 5 . 6 5 | 1' 1' 7 7 | 6 6 6~ 5 4 | 3 2 | 1
    ...A,
    "[c4 ~]",
    // A2: as A1; bar 16 climbs 1 1' 1' 1' into the bridge
    ...A,
    "[c4 c5 c5 c5]",
    // B: 1' held five beats, 1' 1' 1' | 1' 5 (held three beats), 1' 1' 1' | the same | 1' 5 (held four beats)
    "[c5@5 c5 c5 c5]@2",
    "[c5@2 g4@3 c5 c5 c5]@2",
    "[c5@5 c5 c5 c5]@2",
    "[c5@2 g4@4 ~@2]@2",
    // A3: as A1
    ...A,
    "[c4 ~]",
  ],
  harmony: [...A_HARMONY, ["C", "G7"], ...A_HARMONY, ["C", "C7"], ...BRIDGE, ...A_HARMONY, "C"],
  sections: [
    { label: "A", bars: [1, 8] },
    { label: "A", bars: [9, 16] },
    { label: "B", bars: [17, 24] },
    { label: "A", bars: [25, 32] },
  ],
  setting,
});
