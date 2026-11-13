// Wayfaring Stranger (trad), one verse, in D minor, 4/4, with a pickup of three eighths ("I am a"). Four lines of
// four bars: two on the low tune (5 held on "poor", then down to home), the bridge that climbs to the octave
// ("I'm going there to see my father"), and the low tune again. The tune is natural minor throughout (C natural,
// ♭7) with a C below home at the ends of lines 2 and 4.
// The source holds many notes across beats with ties; Oak keeps every attack where the source has it and cuts each
// held note to the plain value that fits before the next one (usually a half, then an eighth rest).
// Harmony, one chord a bar (Oak's): i and iv, the bridge on i, iv, i.
import { noteSong } from "../tunes.ts";

export const setting =
  "Every attack where the source has it; each tied note becomes the plain value that fits (usually a half), then a rest.";
const LOW_A = "[a4@4 ~ f4 g4 a4]";
const LOW_B = "[f4 d4@2 ~@2 d4 d4 a4]";
export default noteSong({
  id: "song.wayfaring-stranger",
  bpm: 72,
  melody: [
    // Pickup: 1 2 1 ("I am a")
    "[~@5 d4 e4 d4]",
    // Line 1: 5 . ♭3 4 5 | ♭3 1 . 1 1 5 | 4 . 1 ♭3 4 | 5 . 1 1 1
    LOW_A,
    LOW_B,
    "[g4@4 ~ d4 f4 g4]",
    "[a4@4 ~ d4 d4 d4]",
    // Line 2: as line 1, ending 4 ♭3 1 ♭7, | 1 (5 5 ♭7)
    LOW_A,
    LOW_B,
    "[g4@2 ~ f4 d4@2 c4@2]",
    "[d4@4 ~ a4 a4 c5]",
    // Line 3 (the bridge): 1' 5 ♭7 5 | 4 1 5 5 ♭7 | 1' ♭7 5 4 | 5 5 1' ♭7
    "[d5@2 ~ a4 c5@2 a4@2]",
    "[g4 d4@2 ~@2 a4 a4 c5]",
    "[d5@2 ~ c5 a4@2 g4@2]",
    "[a4@4 ~ a4 d5 c5]",
    // Line 4: 5 ♭3 4 5 4 | ♭3 1 1 1 5 | 4 ♭3 1 ♭7, | 1
    "[a4@2 ~ f4 g4@2 a4 g4]",
    "[f4@2 d4@2 ~ d4 d4 a4]",
    "[g4@2 ~ f4 d4@2 c4@2]",
    "[d4@4 ~@4]",
  ],
  harmony: ["Dm", "Dm", "Gm", "Dm", "Dm", "Dm", "Gm", "Dm", "Dm", "Gm", "Dm", "Dm", "Dm", "Dm", "Gm", "Dm"],
  phrases: [
    [1, 4],
    [5, 8],
    [9, 12],
    [13, 16],
  ],
  setting,
});
