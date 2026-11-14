// Bye Bye Blackbird (R. Henderson, words M. Dixon, 1926), the 32-bar chorus in F, no pickup: four sections of eight
// bars. Oak reads the form as A A B A, and the form map is graded against that reading alone (CF.md). Why: the
// second section is the first one moved up a step (the same rhythm, the same falling line, the same "bye bye
// blackbird" cadence of four long notes, now ending on 1 instead of 7), and the last section starts exactly as the
// first; only the third section (from bar 17) is new: a leap to the high 5 over F7, then a line that starts on the
// low 6 over the minor ii and walks down to the 7 below home. The registry once called it ABAC; the fourth section is plainly the first again, so that reading
// was wrong. A learner who hears the second section as new would write ABCA, a defensible reading that this key
// does not accept: the setting note says so.
// Harmony (one or two chords a bar, from the transcription below with its ninths and slash chords dropped): A: I vi7 |
// ii7 iii7 | ii7 V7 | Imaj7 | iii | ♭iii°7 | ii7 | V7; A2 sits on ii (Gm, Gm7) and V7; B: I7 (V7/IV) | IV7 | iii7 |
// V7/ii | ii7 ii7 | ♭II7 | V7; the last A: I vi7 | ii7 V7 | iii7 | V7/ii | ii7 | V7 | I | I.
import { standardSong } from "../standards.ts";
import type { BarHarmony } from "../tunes.ts";

export const setting =
  "The tune follows I. Hayden's abc transcription (in F, 4/4), which writes it in quarter, half and whole notes; its ties are kept. Harmony as that transcription has it, in Oak's palette: C7♭9 and D7♭9 are C7 and D7, Fmaj7 is F^7 and A♭dim is A♭o7; its slash chords in bars 9–10 (Gm7 over F♯, F and E) are Gm and Gm7 then C7; the alternatives it prints in brackets are left out; and the turnaround of its last bar (Gm7 C7 under a rest) is the home chord, because the chorus ends there. The form is read A A B A (the second section is the first moved up a step); ABCA is not accepted.";

// biome-ignore format: eight bars to a line
const HARMONY: BarHarmony[] = [
  ["F", "Dm7"], ["Gm7", "Am7"], ["Gm7", "C7"], "F^7", "Am", "Abo7", "Gm7", "C7",
  "Gm", ["Gm7", "C7"], "Gm", "C7", "Gm7", "C7", "F^7", ["Gm7", "C7"],
  "F7", "Bb7", "Am7", "D7", "Gm7", "Gm7", "Db7", "C7",
  ["F", "Dm7"], ["Gm7", "C7"], "Am7", "D7", "Gm7", "C7", "F", "F",
];
export default standardSong({
  id: "song.bye-bye-blackbird",
  bpm: 160,
  melody: [
    // A1: 3 3 3 3 | 4 3 3 | 3 2 2 | 2 1 1 | 1 | 2 | 1 7, (held six beats)
    "[a4 a4 a4 a4]",
    "[bb4 a4 a4@2]",
    "[a4 g4 g4@2]",
    "[g4 f4 f4@2]",
    "f4",
    "g4",
    "[f4@2 e4@6]@2",
    // A2: the same a step up: 4 4 4 4 | 5 4 4 | 4 3 3 | 3 2 2 | 2 | 3 | 2 1 (held six beats)
    "[bb4 bb4 bb4 bb4]",
    "[c5 bb4 bb4@2]",
    "[bb4 a4 a4@2]",
    "[a4 g4 g4@2]",
    "g4",
    "a4",
    "[g4@2 f4@6]@2",
    // B: 1 5 5 5 | 5 4 3 2 | 2 | ♯1 | 6, 4 4 4 | 4 3 2 1 | 1 | 7,
    "[f4 c5 c5 c5]",
    "[c5 bb4 a4 g4]",
    "g4",
    "f#4",
    "[d4 bb4 bb4 bb4]",
    "[bb4 a4 g4 f4]",
    "f4",
    "e4",
    // A3: 3 3 3 3 | 4 3 3 | 3 2 2 | 2 ♯1 ♯1 | 2 4 (held four beats) 7, | 1 | rest
    "[a4 a4 a4 a4]",
    "[bb4 a4 a4@2]",
    "[a4 g4 g4@2]",
    "[g4 f#4 f#4@2]",
    "[g4@2 bb4@4 e4@2]@2",
    "f4",
    "~",
  ],
  harmony: HARMONY,
  sections: [
    { label: "A", bars: [1, 8] },
    { label: "A", bars: [9, 16] },
    { label: "B", bars: [17, 24] },
    { label: "A", bars: [25, 32] },
  ],
  setting,
});
