// Test support (not a test file): Wave 6 content a test needs while the authors are still writing it. Two test
// renditions of 32-bar AABA standards (CF-T needs one, ladder L8 a second) and CF-T's sessions in the shape
// content-kit 5 gives them (the form map and the bass, the changes, the melody, the arrangement), added only where
// the real content has none.
import type { CapstoneDef, PhraseCheck, SongDef } from "@oak/content-kit";
import { STANDARD_LADDER_MATCHERS, STANDARD_LADDER_PASS } from "@oak/grader";
import type { ContentSource } from "../content/types.ts";
import { standardGaps } from "../services/standard-ladder.ts";

const A = ["C^7", "Am7", "Dm7", "G7", "C^7", "Am7", "Dm7", "G7"];
const B = ["F^7", "F^7", "C^7", "C^7", "D7", "D7", "G7", "G7"];
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

/** A 32-bar AABA test standard in C (A: I vi ii V twice; B: IV IV I I V7/V V7/V V V). */
function testStandard(id: string, title: string, year: number, bpm: number): SongDef {
  const chords = `chords: chord("<${form(A, B).join(" ")}>").voicing().s("piano")`;
  const bass = `bass: n("<${form(A_BASS, B_BASS).join(" ")}>").scale("C2:major").s("ebass")`;
  const mel = `mel: n("<${form(A_TUNE, B_TUNE).join(" ")}>").scale("C4:major").s("piano")`;
  return {
    id: id as SongDef["id"],
    title: `${title} (test rendition)`,
    year,
    status: "US-PD",
    provenance: { source: "test fixture", year },
    verifiedBy: "test fixture",
    key: { tonic: "C", mode: "major" },
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

export const TEST_STANDARDS: SongDef[] = [
  testStandard("song.five-foot-two", "Five Foot Two, Eyes of Blue", 1925, 120),
  testStandard("song.aint-she-sweet", "Ain't She Sweet", 1927, 116),
];

const check = (
  id: string,
  phrase: number,
  layer: "bass" | "chords" | "melody",
  after: string[],
): PhraseCheck =>
  ({
    id,
    phrase,
    layer,
    matcher: STANDARD_LADDER_MATCHERS[layer === "chords" ? "changes" : layer],
    pass: STANDARD_LADDER_PASS[layer === "chords" ? "changes" : layer],
    after,
  }) as PhraseCheck;
const four = (stem: string, layer: "bass" | "chords" | "melody", after: string[]) =>
  [1, 2, 3, 4].map((n) => check(`${stem}-${n}`, n, layer, after));

/** CF-T's sessions as content/specs/CF.md has them: one eight-bar section at a time. */
export const CFT_SESSION_EXTRAS = [
  {
    formMap: { id: "form-map", vocabulary: "letters", boundaries: "asked", pass: 1 },
    checks: four("bass", "bass", ["form-map"]),
  },
  { checks: four("changes", "chords", ["bass-1", "bass-2", "bass-3", "bass-4"]) },
  { checks: four("melody", "melody", ["changes-1", "changes-2", "changes-3", "changes-4"]) },
  {
    rubric: [
      {
        id: "form",
        label: "The arrangement keeps the song's sections",
        required: true,
        skills: ["F03"],
        rule: "form",
        pattern: "@song",
      },
    ],
  },
] as const;

/**
 * The content with two CF-T standards that have complete answer keys (the test renditions, where the real ones are
 * missing or not complete yet, listed for L8) and CF-T's checks where its sessions are still bare.
 */
export function withCft(real: ContentSource): ContentSource {
  const complete = (id: string) => {
    const song = real.songs.find((s) => s.id === id);
    return song !== undefined && standardGaps(song).length === 0;
  };
  const add = TEST_STANDARDS.filter((t) => !complete(t.id));
  const songs = [...real.songs.filter((s) => !add.some((t) => t.id === s.id)), ...add];
  const repertoire = [
    ...(real.repertoire ?? []).filter((m) => !add.some((t) => t.id === m.id)),
    ...add.map((t) => ({ id: t.id as string, title: t.title, year: t.year, ladder: 8, form: "AABA" })),
  ];
  const capstones = real.capstones.map((c): CapstoneDef => {
    if (c.id !== "CF-T") return c;
    const bare = !c.sessionDefs.some((s) => (s.checks ?? []).length > 0 || s.formMap !== undefined);
    if (!bare) return c;
    return {
      ...c,
      sessionDefs: c.sessionDefs.map((s, i) => ({ ...s, ...(CFT_SESSION_EXTRAS[i] ?? {}) })),
    } as CapstoneDef;
  });
  return { ...real, songs, repertoire, capstones };
}
