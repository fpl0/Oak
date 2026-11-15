// St. Louis Blues (W. C. Handy, 1914), the first 12-bar strain (the vocal strain marked "Slowly", after the piano
// introduction), in G, no pickup: three lines of four bars, each a two-bar call and a two-bar held note. Line 1
// circles 3 5 3 1 and answers with the blue third (♯5 below, 6, 1, ♭3, 2); line 2 starts from the 6 below and
// leans on ♭3 again; line 3 starts on the 7 below over D7 and repeats the ♭3 three times before it falls home.
// Handy prints it in 2/4 with sixteenth notes; Oak doubles every value (one 2/4 bar is one 4/4 bar, a sixteenth an
// eighth), so the strain is the twelve bars of 4/4 the course's blues use, and declares swing 8ths, as the L6 and
// X2 givens say ("Swing 8ths").
// Plain rhythm (tunes.ts): every held note is cut to the longest plain value that fits in its bar and a rest fills
// the rest, so each line's long last note is a whole note followed by a bar of rest, and the 1 held from the "and"
// of beat 2 in bar 1 (and the 2 of bars 2, 5 and 6, the 5 below of bar 9) sounds a quarter. The grace note (♯2
// into 3) before bar 1 is left out.
// Harmony, one chord a bar (a reduction of Handy's piano part as one reader gives it; the print has no chord
// symbols): I IV7 I I7 | IV IV7 I I | V7 V7 I I (G C7 G G7 | C C7 G G | D7 D7 G G).
import { noteSong } from "../tunes.ts";

export const setting =
  "Values doubled from Handy's 2/4 (a sixteenth becomes an eighth). Each tied or dotted note is cut to the longest plain value that fits in its bar and a rest fills the rest, so the held 1 of bars 3, 7 and 11 is a whole note and bars 4, 8 and 12 rest. The grace note before bar 1 is left out. The chords are a reduction of the piano part: in bar 10 the print sounds B♭ and then A over D in the bass, which Oak plays as D7.";

export default noteSong({
  id: "song.st-louis-blues",
  bpm: 126,
  melody: [
    // Line 1: 3 5 3 1 | – ♯5, 6, 1 ♭3 2 | 1 | –
    "[b4 d5 b4 g4@2 ~@3]",
    "[~ d#4 e4 g4 bb4 a4@2 ~]",
    "g4",
    "~",
    // Line 2: – 6, 1 2 | – 6, 1 2 ♭3 2 | 1 | –
    "[~ e4 g4 a4@2 ~@3]",
    "[~ e4 g4 a4 bb4 a4@2 ~]",
    "g4",
    "~",
    // Line 3: 7, 2 7, 5, | – ♭3 ♭3 ♭3 2 | 1 | –
    "[f#4 a4 f#4 d4@2 ~@3]",
    "[~@2 bb4 bb4 bb4 a4@2 ~]",
    "g4",
    "~",
  ],
  harmony: ["G", "C7", "G", "G7", "C", "C7", "G", "G", "D7", "D7", "G", "G"],
  phrases: [
    [1, 4],
    [5, 8],
    [9, 12],
  ],
  swing: { subdivision: 8, amount: 1 / 3 },
  setting,
});
