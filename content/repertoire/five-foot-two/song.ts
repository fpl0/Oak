// Five Foot Two, Eyes of Blue (Has Anybody Seen My Girl?) (R. Henderson, words S. M. Lewis and J. Young, 1925), the
// 32-bar chorus in C, no pickup: four sections of eight bars, A A B A. The A sections open on three short notes that
// name each chord of the chain (C, then E7 with its G♯, then A7), hold a long 3 over bar 7, and differ only in
// their ends (the second A ends on the low 1 and climbs E D♯ E into the bridge). The bridge walks the same chain
// two bars a chord, E7 A7 D7 G7, on repeated B C B figures. CF-T's plainest song (CF.md): one chord a bar.
// Harmony (Oak's, one chord a bar): I V7/vi V7/ii V7/ii V7/V V7 I V7 | I V7/vi V7/ii V7/ii V7/V V7 I I | V7/vi V7/vi
// V7/ii V7/ii V7/V V7/V V7 V7 | I V7/vi V7/ii V7/ii V7/V V7 I I.
import { standardSong } from "../standards.ts";

export const setting =
  "The tune and its rhythm follow a modern lead sheet (in C, cut time, here as 4/4 with the quarter as the beat), ties and syncopation kept. Harmony: one chord a bar; where that lead sheet has a turnaround (D9 Dm7 G7 in bar 8, Dm7 G7 in bar 14, C Dm7 in bar 15, C B♭° Dm7 G7 at the end) Oak plays the bar's main chord.";

const A_START = ["[e4 g4 e4 ~]", "[e4@2 g#4@2 e4@2 ~ e4]", "[e4 a4 e4 a4]"];
export default standardSong({
  id: "song.five-foot-two",
  bpm: 192,
  melody: [
    // A1: 3 5 3 | 3 ♯5 3 . 3 | 3 6 3 6 | 3 6 3~ 6 | 1' 6 1' 6 | 5 6 | 3 (seven beats)
    ...A_START,
    "[e4@2 a4 e4@3 a4@2]",
    "[c5 a4 c5 a4]",
    "[g4 a4]",
    "[e4@7 ~]@2",
    // A2: the same to bar 11; bar 12 starts on 2'; it ends on the low 1 and climbs 1 3 ♯2 3 into the bridge
    ...A_START,
    "[d5@2 a4 e4@3 a4@2]",
    "[c5 a4 c5 a4]",
    "[g4 a4]",
    "c4",
    "[c4 e4 d#4 e4]",
    // B: 7 1' 7 . 3 | 7 1' 7 | 7 6 7 6~ | 6 | 6 7 6 . 2 | 6 7 6 | 7 2' 7 5 | 4 3 2~ ♯2 (the D♯ leans into the E of the last A)
    "[b4@2 c5@2 b4@2 ~ e4]",
    "[b4 c5 b4 ~]",
    "[b4 a4 b4 a4@5]@2",
    "[a4@2 b4@2 a4@2 ~ d4]",
    "[a4 b4 a4 ~]",
    "[b4 d5 b4 g4]",
    "[f4 e4@2 d4@3 d#4@2]",
    // A3: as A1, bar 26 without the eighth-note pickup; it ends on the high 1 (seven beats)
    "[e4 g4 e4 ~]",
    "[e4 g#4 e4 ~]",
    "[e4 a4 e4 a4]",
    "[e4@2 a4 e4@3 a4@2]",
    "[c5 a4 c5 a4]",
    "[g4 a4]",
    "[c5@7 ~]@2",
  ],
  harmony: [
    ...["C", "E7", "A7", "A7", "D7", "G7", "C", "G7"],
    ...["C", "E7", "A7", "A7", "D7", "G7", "C", "C"],
    ...["E7", "E7", "A7", "A7", "D7", "D7", "G7", "G7"],
    ...["C", "E7", "A7", "A7", "D7", "G7", "C", "C"],
  ],
  sections: [
    { label: "A", bars: [1, 8] },
    { label: "A", bars: [9, 16] },
    { label: "B", bars: [17, 24] },
    { label: "A", bars: [25, 32] },
  ],
  setting,
});
