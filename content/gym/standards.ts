// Ladder level L8 (contracts §2.9, §6.6 CF-T, §6.12; content/specs/CF.md "The ladder: L7 and L8"; wave6.md §5.4): a
// full arrangement of a public-domain standard, the level CF-T opens. As at L5 and L6 nobody authors an item and no
// generator invents one: an item is cut from a repertoire standard's answer key (content/repertoire/<slug>/song.ts)
// and graded by the grader's standard-ladder entry points (`gradeFormMap`, `gradeStandardLadder`, @oak/grader
// `grade/standard-ladder.ts`).
//
// One item is the whole chorus (32 bars) in four stages that open in order:
//   form     the form map: where each section starts and what it is called, by shape (pass 1); no code;
//   bass     the bass, one section at a time (0.90);
//   changes  the chords at seventh depth, one section at a time, a wrong quality earning nothing for its bar (0.85);
//   melody   the tune, one section at a time (0.90).
// The code stages are checked a section at a time, as CF-T checks them (CF.md: feedback after eight bars, and a
// 15-minute learner can stop on a passed section); a stage has passed when each of its sections has.
//
// An item exists only for a standard whose entry is complete: a `song.ts` with bass, chords and melody layers, a
// chord chart, `sections` that cover the tune and `phrases` that cut it at the same bars. Whether the learner may
// pick it is `standardLadderStatus`: "Being checked" while no human has verified the answer key (§2.8), unless the
// caller allows unverified keys (dev). Everything is pure and deterministic from (song, realism, seed); the hidden
// reference, the sections and the form map's key stay on the server.
import type { KeySpec, LessonId, MeterId, PickupSpec, SongDef, SwingSpec } from "@oak/content-kit";
import { type RepertoireEntry, songById } from "../repertoire/index.ts";
import { isVerified, type SongRealism } from "./songs.ts";

export type StandardStage = "form" | "bass" | "changes" | "melody";
export type StandardCodeStage = Exclude<StandardStage, "form">;
/** The stages in the order they open (the grader's `STANDARD_LADDER_STAGES`). */
export const STANDARD_STAGES: readonly StandardStage[] = ["form", "bass", "changes", "melody"];
/** Pass marks (the grader's `STANDARD_LADDER_PASS`; contracts §6.6 CF-T). */
export const STANDARD_PASS: Readonly<Record<StandardStage, number>> = {
  form: 1,
  bass: 0.9,
  changes: 0.85,
  melody: 0.9,
};
/** The three standards CF-T offers (`CF_T_SONG_IDS` of @oak/api): the L8 pool of the core. */
export const STANDARD_SONG_IDS = [
  "song.five-foot-two",
  "song.aint-she-sweet",
  "song.bye-bye-blackbird",
] as const;

/**
 * One gradable submission. A code stage is the grader's `StandardLadderItem` (`gradeStandardLadder({ item, song,
 * code, ctx })`): `phrase` is the 1-based section it checks. The form stage has no phrase: its answer is a form
 * map (`gradeFormMap(answer, song)`).
 */
export interface StandardCheck {
  /** `lad.8.<slug>`: one exercise ID for the whole item (the grader adds the stage). */
  itemId: string;
  level: 8;
  stage: StandardStage;
  /** Code stages: the section checked (a 1-based index into the answer key's `phrases`). */
  phrase?: number;
}

/** What the learner is told (CF.md "What is given"): tempo, meter, key, feel, pickup and length; never the form. */
export interface StandardGiven {
  bpm: number;
  meter: MeterId;
  key: KeySpec;
  pickup: PickupSpec | null;
  /** The length of the chorus, bars numbered as the lead sheet numbers them. */
  bars: number;
  feel: "Straight" | "Swing 8ths";
  /**
   * Given from the changes stage on: one chord a bar, with the bars that hold two marked. Hidden before it (the
   * bass is taken down without a chart).
   */
  harmonicRhythm: { chordsPerBar: 1; twoChordBars: number[] };
}

/** The form-map task as the widget needs it (`form` answer, `input: "map"`): nothing of the answer is in it. */
export interface StandardFormTask {
  bars: number;
  vocabulary: "letters";
  boundaries: "asked";
  pass: number;
}

export interface StandardPerformance {
  realism: SongRealism;
  seed: number;
  /** The track the learner transcribes at each code stage. */
  target: Record<StandardCodeStage, string>;
  /** Realism-driven swing never applies: the swing is the song's own. */
  swung: false;
  /** The song's own declared swing, played from R0. */
  songSwing: SwingSpec | null;
  /** R4: the tune on a vocal-like lead. */
  vocalLead: "tenor" | "choir" | null;
}

export interface StandardLadderPlan {
  songId: string;
  title: string;
  year: number | "trad";
  level: 8;
  realism: SongRealism;
  seed: number;
  song: SongDef;
  /** The hidden reference (server side only): the whole rendition. */
  reference: string;
  given: StandardGiven;
  formTask: StandardFormTask;
  /** Server side only: the form map's answer (labels, first bars, letters by first appearance: "AABA"). */
  formKey: { labels: string[]; bars: number[]; letters: string };
  /** Server side only until the form map has passed or been revealed: the song's sections, 1-based bars inclusive. */
  sections: { label: string; bars: [number, number] }[];
  stages: StandardStage[];
  /** Every submission, in the order they open: the form map, then each stage section by section. */
  checks: StandardCheck[];
  performance: StandardPerformance;
}

// --- completeness and status -------------------------------------------------------------------------

const slugOf = (id: string): string => id.replace(/^song\./, "");
/** Letters by first appearance: A A B A for any labels of that shape (content-kit `formLetters`). */
function lettersOf(labels: readonly string[]): string {
  const seen: string[] = [];
  return labels
    .map((l) => {
      if (!seen.includes(l)) seen.push(l);
      return String.fromCharCode(65 + seen.indexOf(l));
    })
    .join("");
}

/**
 * Why a standard cannot be cut into an L8 item (empty when it can): the repertoire lists it for L8; it has the
 * three layers and a chord chart; its sections run from bar 1 to the last bar without a gap; and its phrases cut
 * the tune at the same bars, so a check names one section.
 */
export function standardLadderGaps(song: SongDef): string[] {
  const gaps: string[] = [];
  const entry = songById.get(song.id);
  if (!entry) gaps.push("no repertoire entry");
  else if (entry.ladder !== 8)
    gaps.push(`the repertoire lists it for ${entry.ladder ? `L${entry.ladder}` : "no ladder level"}`);
  const key = song.answerKey;
  for (const l of ["bass", "chords", "melody"] as const) if (!key.layers[l]) gaps.push(`no ${l} layer`);
  if (!key.chords || key.chords.length === 0) gaps.push("no chord chart");
  const sections = key.sections ?? [];
  if (sections.length === 0) gaps.push("no sections (the form map has no answer)");
  else {
    let next = 1;
    for (const s of sections) {
      if (s.bars[0] !== next) {
        gaps.push(`the sections leave a gap or overlap at bar ${next}`);
        break;
      }
      next = s.bars[1] + 1;
    }
    if (next - 1 !== key.bars && !gaps.some((g) => g.startsWith("the sections leave")))
      gaps.push(`the sections end at bar ${next - 1}, the tune at bar ${key.bars}`);
  }
  const phrases = key.phrases ?? [];
  if (phrases.length === 0) gaps.push("no phrases");
  else if (
    sections.length > 0 &&
    (phrases.length !== sections.length ||
      phrases.some((p, i) => p[0] !== sections[i]?.bars[0] || p[1] !== sections[i]?.bars[1]))
  )
    gaps.push("the phrases do not cut the tune at its sections");
  return gaps;
}

export interface StandardLadderStatus {
  status: "open" | "locked";
  /** Learner-facing reason while locked: "Being checked", "Opens with …". */
  lockedReason: string | null;
}
/**
 * Whether the learner may pick the standard: locked before its `availableFrom` lesson (none of the three has
 * one) and while its answer key is unverified (§2.8). A standard that cannot be cut is not offered at all
 * (`standardLadderGaps`). Whether L8 itself is open to the learner (CF-T released, two L6 passes) is the server's.
 */
export function standardLadderStatus(
  song: SongDef,
  opts: { completed: ReadonlySet<string>; allowUnverified?: boolean },
): StandardLadderStatus {
  const entry: RepertoireEntry | undefined = songById.get(song.id);
  const from = (song.availableFrom ?? entry?.availableFrom) as LessonId | undefined;
  if (from && !opts.completed.has(from)) return { status: "locked", lockedReason: `Opens with ${from}` };
  if (!opts.allowUnverified && !isVerified(song, entry))
    return { status: "locked", lockedReason: "Being checked" };
  return { status: "open", lockedReason: null };
}

/**
 * The standards that can be cut into L8 items, in repertoire order, the one CF-T used left out (`skip`): after
 * CF-T the gym serves another standard (wave6.md §5.4).
 */
export function standardLadderPool(
  songs: readonly SongDef[],
  opts: { skip?: string | null } = {},
): SongDef[] {
  const order = new Map([...songById.keys()].map((id, i) => [id, i] as const));
  return songs
    .filter((s) => s.id !== opts.skip && standardLadderGaps(s).length === 0)
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

// --- the item --------------------------------------------------------------------------------------------

/** Bars that hold two chords in the answer key's chart. */
function twoChordBars(song: SongDef): number[] {
  const count = new Map<number, number>();
  for (const c of song.answerKey.chords ?? []) count.set(c.bar, (count.get(c.bar) ?? 0) + 1);
  return [...count.entries()]
    .filter(([, n]) => n > 1)
    .map(([b]) => b)
    .sort((a, b) => a - b);
}

/**
 * Cuts the L8 item of a standard: `null` when its entry is not complete (`standardLadderGaps`). Realism changes
 * the performance only (R4 puts the tune on `tenor` or `choir`); the song keeps its key, its swing and its
 * answer at every level, and the tolerances never move. Deterministic in (song, realism, seed).
 */
export function buildStandardLadderItem(
  song: SongDef,
  opts: { realism?: SongRealism; seed?: number } = {},
): StandardLadderPlan | null {
  if (standardLadderGaps(song).length > 0) return null;
  const realism = opts.realism ?? 0;
  const seed = Math.abs(Math.trunc(opts.seed ?? 0));
  const slug = slugOf(song.id);
  const itemId = `lad.8.${slug}`;
  const sections = (song.answerKey.sections ?? []).map((s) => ({
    label: s.label,
    bars: [s.bars[0], s.bars[1]] as [number, number],
  }));
  const labels = sections.map((s) => s.label);
  const code: StandardCodeStage[] = ["bass", "changes", "melody"];
  const checks: StandardCheck[] = [
    { itemId, level: 8, stage: "form" },
    ...code.flatMap((stage) =>
      sections.map((_, i): StandardCheck => ({ itemId, level: 8, stage, phrase: i + 1 })),
    ),
  ];
  return {
    songId: song.id,
    title: song.title,
    year: song.year,
    level: 8,
    realism,
    seed,
    song,
    reference: song.answerKey.code,
    given: {
      bpm: song.bpm,
      meter: song.meter,
      key: song.key,
      pickup: song.pickup ?? null,
      bars: song.answerKey.bars,
      feel: song.swing ? "Swing 8ths" : "Straight",
      harmonicRhythm: { chordsPerBar: 1, twoChordBars: twoChordBars(song) },
    },
    formTask: {
      bars: song.answerKey.bars,
      vocabulary: "letters",
      boundaries: "asked",
      pass: STANDARD_PASS.form,
    },
    formKey: { labels, bars: sections.map((s) => s.bars[0]), letters: lettersOf(labels) },
    sections,
    stages: [...STANDARD_STAGES],
    checks,
    performance: {
      realism,
      seed,
      target: { bass: "bass", changes: "chords", melody: "mel" },
      swung: false,
      songSwing: song.swing ?? null,
      vocalLead: realism >= 4 ? (seed % 2 === 0 ? "tenor" : "choir") : null,
    },
  };
}

/** A check's key: `<itemId>.form`, `<itemId>.bass.2` (the grader names the exercise `<itemId>.<stage>`). */
export const standardCheckKey = (c: StandardCheck): string =>
  c.phrase === undefined ? `${c.itemId}.${c.stage}` : `${c.itemId}.${c.stage}.${c.phrase}`;
/** The checks of one stage, in order. */
export const stageChecks = (plan: StandardLadderPlan, stage: StandardStage): StandardCheck[] =>
  plan.checks.filter((c) => c.stage === stage);
/**
 * The stage that is open: the first whose checks are not all recorded (passed or revealed), in order; `null`
 * once all four are. A revealed stage opens the next (contracts §6.6: a revealed check is named, never a pass).
 */
export function openStandardStage(
  plan: StandardLadderPlan,
  recorded: ReadonlySet<string>,
): StandardStage | null {
  return (
    plan.stages.find((stage) => !stageChecks(plan, stage).every((c) => recorded.has(standardCheckKey(c)))) ??
    null
  );
}
/** The next check to work: the first unrecorded check of the open stage (`null` when the item is done). */
export function nextStandardCheck(
  plan: StandardLadderPlan,
  recorded: ReadonlySet<string>,
): StandardCheck | null {
  return plan.checks.find((c) => !recorded.has(standardCheckKey(c))) ?? null;
}
/** Whether a check may be submitted now: every check of the stages before its own is recorded. */
export function standardCheckOpen(
  plan: StandardLadderPlan,
  check: StandardCheck,
  recorded: ReadonlySet<string>,
): boolean {
  const at = plan.stages.indexOf(check.stage);
  return plan.stages
    .slice(0, at)
    .every((stage) => stageChecks(plan, stage).every((c) => recorded.has(standardCheckKey(c))));
}
/** A graded pass of the standard (wave6.md §5.4): every check passed unrevealed. */
export function standardLadderDone(plan: StandardLadderPlan, passed: ReadonlySet<string>): boolean {
  return plan.checks.every((c) => passed.has(standardCheckKey(c)));
}
/** The lead-sheet bars a code check covers. */
export function standardCheckBars(plan: StandardLadderPlan, check: StandardCheck): [number, number] {
  if (check.phrase === undefined) return [1, plan.given.bars];
  return (plan.sections[check.phrase - 1] as { bars: [number, number] }).bars;
}
/**
 * What the learner is given at a stage (CF.md): the form is never given before the map; the chart's slots (one or
 * two to a bar) are given from the changes stage on.
 */
export function standardGivenAt(
  plan: StandardLadderPlan,
  stage: StandardStage,
): Omit<StandardGiven, "harmonicRhythm"> & { harmonicRhythm: StandardGiven["harmonicRhythm"] | null } {
  const showChart = stage === "changes" || stage === "melody";
  return { ...plan.given, harmonicRhythm: showChart ? plan.given.harmonicRhythm : null };
}
