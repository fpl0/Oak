// Joshua Fit the Battle (spiritual), refrain and verse, in D minor, no pickup. The refrain opens with the raised 7
// as a lower neighbour (1 ♯7 1 2 ♭3 ♭3 4, D C♯ D E F F G) and hammers 5 on "Jer-i-cho"; the verse sits on 5 and
// climbs to the raised 7 below the octave (C♯) before "the walls come tumbling down" falls home.
// The source's tied and dotted values are cut to plain ones at the same attacks (a rest takes the remainder).
// Harmony (the source's, triads and A7): i and V7, the V7 sometimes from beat 3.
import { noteSong } from "../tunes.ts";

export const setting =
  "Every attack where the source has it; tied and dotted values become the plain value that fits, then a rest.";
const OPEN = "[d4 c#4 d4 e4 f4 f4 g4@2]";
export default noteSong({
  id: "song.joshua-fit-the-battle",
  bpm: 108,
  melody: [
    // Refrain: Josh-ua fit the bat-tle of | Jer-i-cho, | Jer-i-cho, | Jer-i-cho,
    OPEN,
    "[a4 a4@2 a4@2 ~@3]",
    "[g4 g4@2 g4@2 ~@3]",
    "[a4 a4@2 a4@2 ~@3]",
    // Josh-ua fit the bat-tle of | Jer-i-cho, and the | walls come tum-bling | down. (and the)
    OPEN,
    "[a4 a4@2 a4@2 ~ f4 g4]",
    "[a4 g4 f4 e4]",
    "[d4@4 ~@2 d5 d5]",
    // Verse: 5 over 1' and the raised 7 at the end of the line
    "[d5 a4 a4 a4 a4@2 ~ a4]",
    "[a4 a4@2 ~@3 a4 a4]",
    "[a4 a4 a4 a4 a4@2 a4@2]",
    "[a4@4 ~@2 c#5@2]",
    "[d5@2 a4@2 a4 a4@2 ~]",
    "[a4@2 a4@4 a4 a4]",
    "[a4 a4 g4@2 e4@2 d4@2]",
    "d4",
  ],
  harmony: [
    "Dm",
    "Dm",
    "A7",
    "Dm",
    "Dm",
    "Dm",
    "A7",
    "Dm",
    "Dm",
    ["Dm", "A7"],
    "Dm",
    "A7",
    ["Dm", "A7"],
    ["Dm", "A7"],
    ["Dm", "A7"],
    "Dm",
  ],
  phrases: [
    [1, 4],
    [5, 8],
    [9, 12],
    [13, 16],
  ],
  setting,
});
