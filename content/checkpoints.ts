// The checkpoint map (contracts §7.6): which skills each checkpoint gates (fact, concept and creative
// nodes, counted in the pass score) and which it only level-sets (perceptual and production nodes, which
// never block). Authored items and generator recipes live in content/core/Uxx/CP/checkpoint.ts
// (`defineCheckpoint`); this file is the registry the syllabus, the gates and content CI read.
import type { BandRef, CheckpointId, CheckpointMeta, LessonId, SkillId, UnitId } from "@oak/content-kit";

const ids = <T extends string>(list: string): T[] => (list === "" ? [] : (list.split(" ") as T[]));
const cp = (
  id: CheckpointId,
  title: string,
  covers: string,
  gated: string,
  levelSetting: string,
): CheckpointMeta => ({
  id,
  title,
  covers: ids<UnitId>(covers),
  gated: ids<SkillId>(gated),
  levelSetting: ids<SkillId>(levelSetting),
});

// biome-ignore format: one checkpoint to a line, as in the map of contracts §7.6
export const checkpointMetas: CheckpointMeta[] = [
  cp("U01.CP", "Rhythm I checkpoint", "U01", "R02 R03 R04 R05 R06 R07 R08 N01", "R01 E01"),
  cp("U02.CP", "Pitch checkpoint", "U02", "P01 P02 P03 P04 P05 P06 N02 D01", "E02 V01"),
  cp("U03.CP", "Major-scale checkpoint", "U03", "S01 S02 S03 S04 N03 M01", "E03 E04 E05 E07 V02 V03 V04"),
  cp("U04.CP", "Interval checkpoint", "U04", "I01 I02 I03 I05", "E06"),
  cp("U05.CP", "Triads checkpoint", "U05", "C01 C02 C03 C04 C05 N04 N05", "E08"),
  cp("U06.CP", "Diatonic checkpoint", "U06", "H01 H02 H03 H04 H05 H06 H15 N06 C10", "E09 V05"),
  cp("U07.CP", "Melody checkpoint", "U07", "M02 M03 M04 M05 M06 M07 M09 M10 N07 F01", "V04"),
  cp("U09.CP", "Bass & form checkpoint", "U08 U09", "B01 B02 B03 B04 F02 F03 F05 F06", ""),
  cp("U10.CP", "Minor checkpoint", "U10", "S05 S06 S07 S08 H07 H08 H09", "E10"),
  cp("U11.CP", "Blues checkpoint", "U11", "S09 S10 S11 C06 H10 F04 R13 M08", ""),
  cp("U13.CP", "Sevenths & rhythm checkpoint", "U12 U13", "C07 C08 I04 R09 R10 R11 R12 N08 N09", "E11 E14"),
  cp("U14.CP", "Modes checkpoint", "U14", "S12 S13 H11", "E10"),
  cp("U17.CP", "Chromatic checkpoint", "U15 U16 U17", "H12 H13 H14", "E12a E12b E13"),
  cp("J.CP1", "Jazz checkpoint 1", "J1 J2", "J01 J02 J04 J05 J06 J07 J08 C09", "V06"),
  cp("J.CP2", "Jazz checkpoint 2", "J2 J3 J4 J5", "J03 J09 J10 J11 J12 J13 J14 B05", ""),
  cp("R.CP", "Rhythm checkpoint", "R1 R2 R3", "R14 R15 R16 R17 R18", "E14"),
  cp("A.CP", "Sound & arrangement checkpoint", "A1 A2", "D02 D03 D04 D05 D06 D07 D08 D09 D10 D11", ""),
];
export default checkpointMetas;

/**
 * Where a checkpoint's range departs from "every lesson of the units it covers" (contracts §2.6):
 * J.CP1 stops at J2.L03, J.CP2 takes J2.L04, and J5.L05 (enrichment) is in no checkpoint.
 */
export const CHECKPOINT_LESSON_EXCEPTIONS: Partial<
  Record<CheckpointId, { only?: Partial<Record<UnitId, LessonId[]>>; without?: LessonId[] }>
> = {
  "J.CP1": { only: { J2: ["J2.L01", "J2.L02", "J2.L03"] } },
  "J.CP2": { only: { J2: ["J2.L04"] }, without: ["J5.L05"] },
};

/**
 * Bracketed skills that an earlier checkpoint already lists (contracts §7.6): a re-test sets the level
 * again, and the first listing is "that checkpoint" for mastery (§7.5).
 */
export const CHECKPOINT_RETESTS: Partial<Record<CheckpointId, SkillId[]>> = {
  "U07.CP": ["V04"],
  "U14.CP": ["E10"],
  "R.CP": ["E14"],
};

/**
 * The Band under each checkpoint's Make (contracts §5.10 rule 6: from U01 every Make has one). A lesson Make
 * names its Band in its step's UI; a checkpoint has no steps, so its Make's Band is registered here. The
 * Make prompts say "over the band"; each Band is in the Make's meter (4/4) and, where the Make counts
 * degrees, the prompt keeps the declared key, so the Band does not follow the learner's `.scale()`.
 */
export const CHECKPOINT_MAKE_BANDS: Partial<Record<CheckpointId, BandRef>> = {
  // A groove: the Band plays the harmony under the learner's drums.
  "U01.CP": { band: "band.two-chord-vamp", tracks: ["bass", "chords"] },
  "U02.CP": { band: "band.two-chord-vamp" },
  // An eight-bar melody that pauses on V in bar 4 and comes home in bar 8.
  "U03.CP": { band: "band.phrase-8bar" },
  "U04.CP": { band: "band.two-chord-vamp" },
  // Chord loops voiced or numbered by the learner: the Band keeps time and leaves the harmony to them.
  "U05.CP": { band: "band.axis-4bar", tracks: ["drums"] },
  "U06.CP": { band: "band.axis-4bar", tracks: ["drums"] },
  // A hook over the four-chord loop: the whole Band states I V vi IV under the learner's tune.
  "U07.CP": { band: "band.axis-4bar" },
};

/** Pass rules (contracts §7.6). The numbers are also in @oak/srs `CHECKPOINT`; content CI compares them. */
export const CHECKPOINT_RULES = {
  items: [12, 18],
  perSkillMin: 2,
  authoredItems: [2, 3],
  pass: 0.85,
  perSkillFloor: 0.7,
  softPass: 0.75,
  softPassFromAttempt: 2,
  anyScoreFromAttempt: 3,
  restartAfterDays: 3,
} as const;
