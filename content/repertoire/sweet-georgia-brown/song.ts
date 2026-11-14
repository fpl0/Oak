// Sweet Georgia Brown (B. Bernie, M. Pinkard and K. Casey, 1925), the 32-bar chorus in F (the registry's teaching
// key), no pickup: four sections of eight bars, A B A C. Its harmony is the longest dominant chain of the 1920s,
// four bars a link: D7 (VI7, V7 of ii) → G7 (II7, V7 of V) → C7 (V7) → F, which U15.L05 names. Over D7 the tune
// climbs D E F♯ (the chord's 1 2 3) on a syncopated figure and falls back from the high D; over G7 it plays the
// same notes with F natural (now the chord's 5 6 ♭7); over C7 the figure a step lower (C D E, its 1 2 3); over F
// it holds the 3. The C section turns to the minor ii (Dm with its own A7) and ends with a turnaround home.
// Harmony (Oak's chart from the transcription below): VI7 ×4 | II7 ×4 | V7 ×4 | Imaj7 Imaj7 (V7 on beat 3) Imaj7
// V7/vi | VI7 ×4 | II7 ×3, II7 V7/vi | ii V7/ii ii V7/ii | I VI7 | II7 V7 | I.
import { standardSong } from "../standards.ts";
import type { BarHarmony } from "../tunes.ts";

export const setting =
  "The tune and its rhythm follow J. Chambers's abc transcription (in G, 4/4), moved down a whole step to F, ties and syncopation kept. Harmony as that transcription has it in bars 1–28 (its G6 is F, its Gmaj7 F^7, its Em Dm); in the last four bars its two voices disagree (G6 E7 | A7 D7 | G6 | B7 in one, G6 E7 | A7 B7 | A7 D7 | G in the other), and Oak plays the turnaround that fits the tune note for note: F | D7 | G7 C7 | F.";

const A_START = ["[d4 e4@2 f#4@4 d4]", "[a4 f#4@2 b4@4 a4]"];
const A2_START = ["[d4 e4@2 f4@4 d4]", "[a4 f4@2 b4@4 g4]"];
// biome-ignore format: eight bars to a line
const HARMONY: BarHarmony[] = [
  "D7", "D7", "D7", "D7", "G7", "G7", "G7", "G7",
  "C7", "C7", "C7", "C7", "F^7", ["F^7", "C7"], "F^7", "A7",
  "D7", "D7", "D7", "D7", "G7", "G7", "G7", ["G7", "A7"],
  "Dm", "A7", "Dm", "A7", "F", "D7", ["G7", "C7"], "F",
];
export default standardSong({
  id: "song.sweet-georgia-brown",
  bpm: 200,
  melody: [
    // A, over D7 (in eighths): D E F♯~ D | A F♯ B~ A | D' A F♯ D~ (held into bar 4)
    ...A_START,
    "[d5@4 a4 f#4@2 d4@7 ~@2]@2",
    // over G7, the same notes with F natural: D E F~ D | A F B~ G | D' B A G~
    ...A2_START,
    "[d5@4 b4 a4@2 g4@7 ~@2]@2",
    // B, over C7: C D E~ C | G E A~ G | C' G E C~ | C D~ C D, then over F the 3 held for five beats, C D~ C D
    "[c4 d4@2 e4@4 c4]",
    "[g4 e4@2 a4@4 g4]",
    "[c5@4 g4 e4@2 c4@3 c4 d4@2 c4 d4@2]@2",
    "[a4@10 c4 d4@2 c4 d4@2]@2",
    "[a4@6 a4@2]",
    "[g4@6 ~@2]",
    // A again; its last note is shorter (A7 enters on beat 3 of bar 24)
    ...A_START,
    "[d5@4 a4 f#4@2 d4@7 ~@2]@2",
    ...A2_START,
    "[d5@4 b4 a4@2 g4@5 ~@4]@2",
    // C, over Dm and A7: 3 3~ | 2 7, 3~ 3 | the same, ending on a rest; then the turnaround C D F~ C | C' C♯' D'~ A |
    // G~ C' A F (held into the last bar)
    "[a4@3 a4@3 ~@2]",
    "[g4 e4@2 a4@3 a4@2]",
    "[a4@3 a4@3 ~@2]",
    "[g4 e4@2 a4@3 ~@2]",
    "[c4 d4@2 f4@2 c4@3]",
    "[c5 c#5@2 d5@2 a4@3]",
    "[g4@4 c5 a4@2 f4@5 ~@4]@2",
  ],
  harmony: HARMONY,
  sections: [
    { label: "A", bars: [1, 8] },
    { label: "B", bars: [9, 16] },
    { label: "A", bars: [17, 24] },
    { label: "C", bars: [25, 32] },
  ],
  // Ladder L6 grades the first 16 bars in 4-bar lines (content/gym/songs.ts); the 8-bar sections are the form.
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
