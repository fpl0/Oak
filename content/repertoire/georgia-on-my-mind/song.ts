// Georgia on My Mind (H. Carmichael, words S. Gorrell, 1930), the 32-bar refrain in F, no pickup: four sections of
// eight bars, A A B A. Each A opens on two long notes a step apart, 3 to 5 and 3 to 2 ("Georgia, Georgia" in the
// song; Oak uses no words), climbs to the 2 above and falls back, then rises 3 5 7 6 and steps down to a held 5
// (first A) or to a held 1 (second and last A). The bridge stays low, four times the figure 6 1 2 3 from the D
// below, over D minor and its A7, and reaches the B natural of G7 on the way back. JC4 (the jazz track) reharmonizes
// it: the long notes of the A sections are where its devices fit.
// Harmony (Oak's chart, two chords a bar in most bars, the second from beat 3):
//   A1  F^7 | Em7 A7 | Dm7 | Bm7♭5 | Am7 D7 | Gm7 C7 | Am7 D7 | Gm7 C7
//   A2  as A1 to bar 14, then F^7 B♭7 | F A7
//   B   Dm7 A7 | Dm7 A7 | Dm7 A7 | C7 G7 | Dm7 A7 | Dm7 E7 | A7 D7 | Gm7 C7
//   A3  as A2 to bar 30, then F^7 | Gm7 C7 (the turnaround back to the top)
import { standardSong } from "../standards.ts";

export const setting =
  "The tune, its rhythm and the chords follow I. Hayden's lead sheet (in F, 4/4), not the 1930 print, which the author did not see; Hayden's chords are a jazz reading that the verifier compares with the print chord by chord. Oak's chart has two chords a bar at most, the second from beat 3: where Hayden changes on beat 2 (bars 2, 10, 16 and 26) Oak changes on beat 3, and where he adds a passing chord or a slash bass (Dm7 to C in the bass in bars 3, 11 and 27, B♭ in bar 18, B7 in bar 22, E♭7 on the last eighth of bar 12) Oak keeps the bar's main chords. Hayden's Bm7 (bars 4, 12 and 28) is played Bm7♭5: the tune sounds F natural over it, the chord's fifth. His B♭/C (bar 20) is played C7 and his F6 (bar 16) F.";

// The A section's first four bars, which every A shares: 3 5 | 3 2 | – 3 2' 3 | 2, 1 2 (degrees in F, 1-based).
const A_HEAD = ["[a4 c5@3]", "[a4 g4@3]", "[~ a4 d5 a4]", "[g4@6 f4 g4]"];

export default standardSong({
  id: "song.georgia-on-my-mind",
  bpm: 72,
  melody: [
    // A1: the head, then 3 5 7 6 | 4 6 3 2 | 5 (four beats) | a fill of four eighths on 6 and ♯2 into the second A
    ...A_HEAD,
    "[a4 c5 e5 d5]",
    "[bb4 d5 a4 g4]",
    "c5",
    "[d5 d5 d5 d5 g#4@4]",
    // A2: the head, then 3 5 7 6 | 4 6, 3 3 | 1 held five beats, 1 again, a rest
    ...A_HEAD,
    "[a4 c5 e5 d5]",
    "[bb4 d4 a4 a4]",
    "[f4@5 f4 ~@2]@2",
    // B: 6, 1 2 3 | 1 6, 1 | 6, 1 2 3 | 5 3 ♯4 | 6, 1 2 3 | 5 6 7 . 6 | 5 3 5 3 | 3 ♯2
    "[d4 f4 g4 a4]",
    "[f4 d4 f4@2]",
    "[d4 f4 g4 a4]",
    "[c5 a4 b4@2]",
    "[d4 f4 g4 a4]",
    "[c5@2 d5@2 e5@3 d5]",
    "[c5 a4 c5 a4]",
    "[a4 g#4]",
    // A3: as A2, ending on 1 held six beats
    ...A_HEAD,
    "[a4 c5 e5 d5]",
    "[bb4 d4 a4 a4]",
    "[f4@6 ~@2]@2",
  ],
  harmony: [
    ...["F^7", ["Em7", "A7"], "Dm7", "Bm7b5", ["Am7", "D7"], ["Gm7", "C7"], ["Am7", "D7"], ["Gm7", "C7"]],
    ...["F^7", ["Em7", "A7"], "Dm7", "Bm7b5", ["Am7", "D7"], ["Gm7", "C7"], ["F^7", "Bb7"], ["F", "A7"]],
    ...[
      ["Dm7", "A7"],
      ["Dm7", "A7"],
      ["Dm7", "A7"],
      ["C7", "G7"],
      ["Dm7", "A7"],
      ["Dm7", "E7"],
      ["A7", "D7"],
      ["Gm7", "C7"],
    ],
    ...["F^7", ["Em7", "A7"], "Dm7", "Bm7b5", ["Am7", "D7"], ["Gm7", "C7"], "F^7", ["Gm7", "C7"]],
  ] as const,
  sections: [
    { label: "A", bars: [1, 8] },
    { label: "A", bars: [9, 16] },
    { label: "B", bars: [17, 24] },
    { label: "A", bars: [25, 32] },
  ],
  setting,
});
