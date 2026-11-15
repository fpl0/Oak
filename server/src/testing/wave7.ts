// Test support (not a test file): Wave 7 content a test needs while the authors are still writing it. A test
// rendition of a 1930 standard for JC4 (Georgia on My Mind, 32 bars AABA in F: the real answer key is
// author:repertoire's and is used once it exists), added only where the real content has none.
import type { SongDef } from "@oak/content-kit";
import type { ContentSource } from "../content/types.ts";

const A = ["F^7", "Dm7", "Gm7", "C7", "F^7", "Dm7", "Gm7", "C7"];
const B = ["Bb^7", "Bb^7", "F^7", "F^7", "G7", "G7", "C7", "C7"];
const A_BASS = [0, 5, 1, 4, 0, 5, 1, 4];
const B_BASS = [3, 3, 0, 0, 1, 1, 4, 4];
const A_TUNE = [
  "[4 ~ 2 4]",
  "[2 ~ 0 ~]",
  "[3 ~ 1 3]",
  "[1 ~ ~ ~]",
  "[4 ~ 2 4]",
  "[2 ~ 0 ~]",
  "[3 ~ 4 1]",
  "[0 ~ ~ ~]",
];
const B_TUNE = [
  "[5 ~ 3 5]",
  "[5 ~ 3 ~]",
  "[4 ~ 2 4]",
  "[4 ~ ~ ~]",
  "[5 ~ 3# 5]",
  "[5 ~ 3# ~]",
  "[4 ~ 1 4]",
  "[4 ~ ~ ~]",
];
const form = <T>(a: readonly T[], b: readonly T[]): T[] => [...a, ...a, ...b, ...a];

/** A 32-bar AABA test rendition in F (A: I vi ii V twice; B: IV IV I I V7/V V7/V V V). */
export function testGeorgia(): SongDef {
  const bpm = 72;
  const chords = `chords: chord("<${form(A, B).join(" ")}>").voicing().s("piano")`;
  const bass = `bass: n("<${form(A_BASS, B_BASS).join(" ")}>").scale("F2:major").s("upright")`;
  const mel = `mel: n("<${form(A_TUNE, B_TUNE).join(" ")}>").scale("F4:major").s("piano")`;
  return {
    id: "song.georgia-on-my-mind" as SongDef["id"],
    title: "Georgia on My Mind (test rendition)",
    year: 1930,
    status: "US-PD",
    provenance: { source: "test fixture", year: 1930 },
    verifiedBy: "test fixture",
    key: { tonic: "F", mode: "major" },
    meter: "4/4",
    bpm,
    form: "AABA",
    answerKey: {
      bars: 32,
      code: [`setcpm(${bpm}/4)`, "", chords, bass, mel].join("\n"),
      layers: { chords, bass, melody: mel },
      phrases: [
        [1, 8],
        [9, 16],
        [17, 24],
        [25, 32],
      ],
      sections: [
        { label: "A", bars: [1, 8] },
        { label: "A", bars: [9, 16] },
        { label: "B", bars: [17, 24] },
        { label: "A", bars: [25, 32] },
      ],
    },
  } as SongDef;
}

/** The content with a standard JC4 can work on (the test rendition only where the real one is not written). */
export function withJc4(real: ContentSource): ContentSource {
  if (real.songs.some((s) => s.id === "song.georgia-on-my-mind" || s.id === "song.body-and-soul"))
    return real;
  return { ...real, songs: [...real.songs, testGeorgia()] };
}
