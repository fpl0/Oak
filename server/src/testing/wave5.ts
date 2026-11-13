// Test support (not a test file): Wave 5 content a test needs while the authors are still writing it. A test
// rendition of a 12-bar blues (X2 and the L6 ladder need one song) and X2's checks in the order contracts §6.6 sets
// (bass ≥ 0.90, then the changes ≥ 0.85, then the melody line by line ≥ 0.85), added only when the real content
// has none.
import type { CapstoneDef, PhraseCheck, SongDef } from "@oak/content-kit";
import { SONG_LADDER_MATCHERS } from "@oak/grader";
import type { ContentSource } from "../content/types.ts";

/**
 * A test rendition of a 12-bar blues in G (I7 IV7 I7 I7 · IV7 IV7 I7 I7 · V7 IV7 I7 V7), used only while the
 * repertoire's St. Louis Blues and Careless Love are not written: X2 and the L6 ladder need a song to work.
 */
export const TEST_BLUES: SongDef = {
  id: "song.st-louis-blues" as SongDef["id"],
  title: "St. Louis Blues (test rendition)",
  year: 1914,
  status: "US-PD",
  provenance: { source: "test fixture", year: 1914 },
  verifiedBy: "test fixture",
  key: { tonic: "G", mode: "major" },
  meter: "4/4",
  bpm: 100,
  form: "12-bar blues strain",
  answerKey: {
    bars: 12,
    code: [
      "setcpm(100/4)",
      "",
      'chords: chord("<G7 G7 G7 G7 C7 C7 G7 G7 D7 C7 G7 D7>").voicing().s("piano")',
      'bass: n("<0 0 0 0 3 3 0 0 4 3 0 4>").scale("G1:major").s("ebass")',
      'mel: n("<[4 ~ 2 ~] [0 ~ ~ ~] [4 ~ 2 ~] [0 ~ ~ ~] [3 ~ 5 ~] [3 ~ ~ ~] [4 ~ 2 ~] [0 ~ ~ ~] [4 ~ 1 ~] [3 ~ 5 ~] [0 ~ ~ ~] [1 ~ ~ ~]>").scale("G4:major").s("piano")',
    ].join("\n"),
    layers: {
      chords: 'chords: chord("<G7 G7 G7 G7 C7 C7 G7 G7 D7 C7 G7 D7>").voicing().s("piano")',
      bass: 'bass: n("<0 0 0 0 3 3 0 0 4 3 0 4>").scale("G1:major").s("ebass")',
      melody:
        'mel: n("<[4 ~ 2 ~] [0 ~ ~ ~] [4 ~ 2 ~] [0 ~ ~ ~] [3 ~ 5 ~] [3 ~ ~ ~] [4 ~ 2 ~] [0 ~ ~ ~] [4 ~ 1 ~] [3 ~ 5 ~] [0 ~ ~ ~] [1 ~ ~ ~]>").scale("G4:major").s("piano")',
    },
    phrases: [
      [1, 4],
      [5, 8],
      [9, 12],
    ],
  },
};
const check = (c: Omit<PhraseCheck, "matcher"> & { matcher?: PhraseCheck["matcher"] }): PhraseCheck =>
  ({
    matcher:
      c.layer === "bass"
        ? SONG_LADDER_MATCHERS.bass
        : c.layer === "chords"
          ? SONG_LADDER_MATCHERS.changes
          : SONG_LADDER_MATCHERS.melody,
    ...c,
  }) as PhraseCheck;
/** X2's order (contracts §6.6) as the capstones author is to write it, for while X2 has no checks yet. */
export const X2_CHECKS: PhraseCheck[][] = [
  [
    check({ id: "bass", phrase: [1, 3], layer: "bass", pass: 0.9 }),
    check({ id: "changes", phrase: [1, 3], layer: "chords", pass: 0.85, after: ["bass"] }),
  ],
  [1, 2, 3].map((n) =>
    check({ id: `melody-${n}`, phrase: n, layer: "melody", pass: 0.85, after: ["changes"] }),
  ),
];

const X2_SONGS = ["song.st-louis-blues", "song.careless-love"];

/** The content with an X2 song (the test rendition, listed for L6) and X2's checks, where the real ones are missing. */
export function withX2(real: ContentSource): ContentSource {
  const songs = real.songs.some((s) => X2_SONGS.includes(s.id)) ? real.songs : [...real.songs, TEST_BLUES];
  const repertoire = (real.repertoire ?? []).some((m) => m.id === TEST_BLUES.id)
    ? (real.repertoire ?? [])
    : [...(real.repertoire ?? []), { id: TEST_BLUES.id, title: TEST_BLUES.title, year: 1914, ladder: 6 }];
  const capstones = real.capstones.map((c): CapstoneDef => {
    if (c.id !== "X2" || c.sessionDefs.some((s) => (s.checks ?? []).length > 0)) return c;
    return { ...c, sessionDefs: c.sessionDefs.map((s, i) => ({ ...s, checks: X2_CHECKS[i] ?? [] })) };
  });
  return { ...real, songs, repertoire, capstones };
}
