// The lesson and checkpoint players for the advanced tracks (Wave 7, docs/design/wave7.md §5.1–§5.3, §11;
// contracts §2.6, §4.3, §7.6). Pure: no React, no worker, `bun test`.
//
// - A track lesson that cannot start yet says which ONE thing holds it, in the server's words (DoD 18): the gate's
//   unmet requirement ("U14 checkpoint passed"), or the lesson before it in its track. J2.L04 waiting for U14.CP is
//   named as such, never as a failure, and the track goes on without it.
// - A track checkpoint (J.CP1, J.CP2, R.CP, A.CP) gates only its track's capstones (§7.6 rule 5; DoD 19): its intro
//   and result say what it holds back and that the next lessons never wait for it.
// - The tracks' lenses inside a lesson: the lesson that teaches a lens counts as completed (wave7.md §4.2, as
//   `harmonyDepth`); everywhere the learner's own switch decides.
// - What the host passes for the Wave 7 answer kinds (§11): two-lane taps, the jazz chord style, grouping and
//   Euclid answers in the step's meter and tempo; and the tutor's words for them.
import {
  type AttemptResponse,
  type CheckpointOutcome,
  type CheckpointStatus,
  type Exercise,
  type SyllabusDef,
  TRACK_CAPSTONE_GATES,
  TRACK_CHECKPOINTS,
  TRACK_GATES,
  TRACK_LENS_IDS,
  type TrackLensId,
  type TrackState,
} from "@oak/api";
import { TRACK_LENS_GATES } from "../lib/lenses.ts";

// --- ids --------------------------------------------------------------------------------------------------

export type TrackKey = "J" | "R" | "A";

/** The track of a track lesson, checkpoint or capstone session (`J1.L03`, `J.CP1`, `JC1.S2`, `A1.L05`), else `null`. */
export function trackOfId(id: string): TrackKey | null {
  const m = /^([JRA])(?:\d\.L\d\d|\.CP\d?|C\d\.S\d)$/.exec(id);
  return m ? (m[1] as TrackKey) : null;
}

/** A lesson of an advanced track (A1.L01–L04, the side lessons, are track A's too). */
export function isTrackLesson(id: string): boolean {
  return /^[JRA]\d\.L\d\d$/.test(id);
}

const unitOf = (lessonId: string) => lessonId.split(".")[0] ?? "";

/**
 * Whether a gate's `opens` text ("J1, J2.L01–L03, J3", "A1.L05–L07", "J2.L04", "R1–R3") names the lesson: a whole
 * unit, a range of units, a range of lessons, or the lesson itself.
 */
export function opensLesson(opens: string, lessonId: string): boolean {
  const unit = unitOf(lessonId);
  const n = Number(lessonId.slice(-2));
  for (const raw of opens.split(",")) {
    const tok = raw.trim().replace(/-/g, "–");
    if (tok === unit || tok === lessonId) return true;
    const units = /^([JRA])(\d)–\1?(\d)$/.exec(tok);
    if (units && unit[0] === units[1]) {
      const u = Number(unit.slice(1));
      if (u >= Number(units[2]) && u <= Number(units[3])) return true;
    }
    const lessons = /^([JRA]\d)\.L(\d\d)–(?:L)?(\d\d)$/.exec(tok);
    if (lessons && lessons[1] === unit && n >= Number(lessons[2]) && n <= Number(lessons[3])) return true;
  }
  return false;
}

/** The track gate (contracts §4.3, `TRACK_GATES`) that opens a track lesson. */
export function gateOfLesson(lessonId: string): (typeof TRACK_GATES)[number] | null {
  return TRACK_GATES.find((g) => opensLesson(g.opens, lessonId)) ?? null;
}

// --- a track lesson that is not open yet -------------------------------------------------------------------

export interface LockCopy {
  /** One line, the reason (never a count of what is missing). */
  line: string;
  /** `waiting`: the lesson waits for something outside its track (J2.L04 for U14.CP): not a failure, the track goes on. */
  kind: "gate" | "previous" | "waiting" | "unknown";
}

type Syllabus = Pick<SyllabusDef, "units" | "tracks"> | null | undefined;

/** The lessons of a track in its order (the units of the track, each in its own order). */
export function trackLessons(
  syllabus: Syllabus,
  track: TrackKey,
): { id: string; title: string; optional: boolean; side: boolean }[] {
  const units = syllabus?.tracks.find((t) => t.id === track)?.units ?? [];
  return units.flatMap(
    (u) =>
      syllabus?.units
        .find((x) => x.id === u)
        ?.lessons.map((l) => ({
          id: l.id as string,
          title: l.title,
          optional: l.optional === true && l.side !== true,
          side: l.side === true,
        })) ?? [],
  );
}

/**
 * Why a track lesson is not open yet, in one line (DoD 18): the gate's first unmet requirement in the server's own
 * words (`TrackGateState.requires[].label`), or the lesson before it in its track. A lesson that can be passed over
 * (J2.L04) never holds the lessons after it, and is itself named as waiting, never as failed. `null` for a lesson
 * that is not a track lesson.
 */
export function trackLockCopy(
  lessonId: string,
  o: {
    syllabus: Syllabus;
    tracks: readonly TrackState[] | null | undefined;
    completed: ReadonlySet<string>;
  },
): LockCopy | null {
  const track = trackOfId(lessonId);
  if (!track || !isTrackLesson(lessonId)) return null;
  const lessons = trackLessons(o.syllabus, track);
  const self = lessons.find((l) => l.id === lessonId);
  const title = self?.title ?? lessonId;
  const gate = gateOfLesson(lessonId);
  const state = o.tracks?.find((t) => t.trackId === track);
  const gateState = gate ? state?.gates.find((g) => g.gateId === gate.gateId) : undefined;
  if (gateState && !gateState.open) {
    const unmet = gateState.requires.find((r) => !r.met) ?? gateState.requires[0];
    const label = unmet?.label ?? gate?.requires.join(", ") ?? "";
    if (self?.optional)
      return {
        kind: "waiting",
        line: `${title} is waiting for one thing: ${label}. The track goes on without it, and this lesson opens as soon as that is done.`,
      };
    return { kind: "gate", line: `${title} is waiting for one thing: ${label}.` };
  }
  // The gate is met (or the server did not say): the lesson before it in its track. A lesson that can be passed
  // over (J2.L04) is not "before" anything.
  const i = lessons.findIndex((l) => l.id === lessonId);
  const before = lessons.slice(0, Math.max(0, i)).filter((l) => !l.optional);
  const prev = before.at(-1);
  if (prev && !o.completed.has(prev.id))
    return { kind: "previous", line: `${title} opens after ${prev.id} ${prev.title}.` };
  return { kind: "unknown", line: `${title} opens when the lessons before it in its track are done.` };
}

// --- track checkpoints ---------------------------------------------------------------------------------

export type TrackCheckpoint = (typeof TRACK_CHECKPOINTS)[number];

export function trackCheckpointOf(cpId: string): TrackCheckpoint | null {
  return TRACK_CHECKPOINTS.find((c) => c.cpId === cpId) ?? null;
}

/** "ii–V Ballad", "16th-Note Funk and Clave & Polyrhythm" (`ids`: the capstones named, the checkpoint's by default). */
function capstoneNames(
  cp: TrackCheckpoint,
  titles: ReadonlyMap<string, string>,
  ids: readonly string[] = cp.gates,
): string {
  const names = ids.map((id) => {
    // Capstone titles carry their ID ("JC1 ii–V Ballad"): the name is read without it.
    const t = titles.get(id)?.replace(new RegExp(`^${id}\\s+`), "");
    return t ? `“${t}”` : id;
  });
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** The track checkpoint's intro: what it covers, when it opens, and the one thing it holds back. */
export function trackCheckpointIntro(
  cp: TrackCheckpoint,
  titles: ReadonlyMap<string, string>,
  status: Pick<CheckpointStatus, "status"> | null,
): { covers: string; holds: string; locked: string } {
  const caps = capstoneNames(cp, titles);
  const many = cp.gates.length > 1;
  const after = titles.get(cp.afterLesson);
  return {
    covers: `A short check of ${cp.covers}: about 12 minutes of mixed items, then a small Make. No hints, no rush. Claude goes over it with you afterwards.`,
    holds: `It holds back only the track's ${many ? "capstones" : "capstone"}, ${caps}. The track's lessons never wait for it${
      status?.status === "failed" ? ", and they are open now" : ""
    }.`,
    locked: `Opens a session after ${cp.afterLesson}${after ? ` ${after}` : ""}. Today has your next step.`,
  };
}

/**
 * The result headline of a track checkpoint (contracts §7.6 rule 5): it gates only its track's capstones, so a
 * pass opens them and "not yet" holds back them and nothing else; the next lessons of the track are open either
 * way. Calm in every case; never "failed".
 */
export function trackCheckpointResult(
  o: Pick<CheckpointOutcome, "passed" | "softPass"> & { opened?: readonly string[] },
  cp: TrackCheckpoint,
  titles: ReadonlyMap<string, string>,
): { title: string; body: string } {
  const caps = capstoneNames(cp, titles);
  // A capstone with other conditions (AC2 also waits for J3.L04 and R1.L05, contracts §4.3) is not opened by the
  // checkpoint alone: only what the server reports opened is called open (`opened`: capstone or capstone-session
  // IDs); the rest are said to wait for their other lessons. Without the server's list every gate is taken as met.
  const isOpen = (id: string) =>
    o.opened === undefined || o.opened.some((x) => x === id || x.startsWith(`${id}.S`));
  const open = cp.gates.filter(isOpen);
  const waiting = cp.gates.filter((id) => !isOpen(id));
  const opens =
    open.length === 0 ? "" : `${capstoneNames(cp, titles, open)} ${open.length > 1 ? "are" : "is"} open. `;
  const waits =
    waiting.length === 0
      ? ""
      : `${capstoneNames(cp, titles, waiting)} also ${waiting.length > 1 ? "wait" : "waits"} for ${waiting.length > 1 ? "their" : "its"} other lessons. `;
  if (o.passed)
    return {
      title: "Checkpoint passed",
      body: `${opens}${waits}Everything you showed here counts, and the track's next lessons are where they were.`,
    };
  if (o.softPass)
    return {
      title: "On you go",
      body: `${opens}${waits}A few skills are worth another look: they come back in your warm-ups.`,
    };
  return {
    title: "Not yet",
    body: `The track's next lessons are open either way: this checkpoint holds back only ${caps}. Practice plan: two short sets for each skill below go into your next warm-ups. Retake it on another day.`,
  };
}

/** The capstones of `TRACK_CAPSTONE_GATES` a track checkpoint opens. */
export function capstonesGatedBy(cpId: string): string[] {
  return TRACK_CAPSTONE_GATES.filter((g) => (g.requires as readonly string[]).includes(cpId)).map(
    (g) => g.capstoneId,
  );
}

// --- the tracks' lenses inside a lesson ---------------------------------------------------------------------

export type TrackLensFlags = Record<TrackLensId, boolean>;

/**
 * What the tracks' lenses show inside a lesson or checkpoint (wave7.md §4.2): the learner's preference (absent =
 * on) and the lens opened — by a tool, a completed lesson, or the lesson being taken when it is the one that
 * teaches the lens (inside J1.L05 the voicings lens is there for the lesson's own steps).
 */
export function lessonTrackLenses(
  ownerId: string,
  track: { prefs: TrackLensFlags; available: TrackLensFlags },
): TrackLensFlags {
  return Object.fromEntries(
    TRACK_LENS_IDS.map((id) => [
      id,
      track.prefs[id] && (track.available[id] || TRACK_LENS_GATES[id].lesson === ownerId),
    ]),
  ) as TrackLensFlags;
}

// --- the Wave 7 answer kinds --------------------------------------------------------------------------------

/** The style chord symbols are read in (wave7.md §3.3): jazz glyphs once the learner turned them on (J1.L02). */
export function chordStyleFor(unlocked: ReadonlySet<string>): "jazz" | "lead-sheet" {
  return unlocked.has("tb.feature.jazz-glyphs") ? "jazz" : "lead-sheet";
}

type TapLaneLike = { label: string; track: string; key?: string };

/**
 * Two-lane taps (`tap.lanes`, R2.L04): the lanes as the pad draws them, in the exercise's order — F taps the first,
 * J the second (the answers' TapPad; a lane's own `key` is not offered by the pad yet). `null` for a one-lane tap.
 */
export function tapLanesOf(ex: Exercise): [{ label: string }, { label: string }] | null {
  if (ex.kind !== "tap") return null;
  const lanes = (ex as { lanes?: readonly TapLaneLike[] }).lanes;
  if (!lanes || lanes.length < 2) return null;
  return [{ label: (lanes[0] as TapLaneLike).label }, { label: (lanes[1] as TapLaneLike).label }];
}

/**
 * Two-lane taps as the grader reads them (`{ lanes }`, content-kit `TestResponse`): the pad's one list of
 * AudioContext seconds split by the voice each tap came on (0 = F, the first lane), as seconds from bar 1 of the
 * stimulus, rounded to the millisecond.
 */
export function lanesResponse(
  taps: readonly number[],
  voices: readonly (0 | 1)[],
  start: number | null,
): AttemptResponse {
  const at = start ?? 0;
  const lanes: [number[], number[]] = [[], []];
  taps.forEach((t, i) => {
    lanes[voices[i] === 1 ? 1 : 0].push(Math.round((t - at) * 1000) / 1000);
  });
  return { lanes } as unknown as AttemptResponse;
}

/** The tempo in a meter's own counting unit (an eighth in 7/8, a quarter in 4/4) from a tempo counted in another's. */
const UNIT_QUARTERS: Readonly<Record<string, number>> = {
  quarter: 1,
  eighth: 0.5,
  dottedQuarter: 1.5,
  half: 2,
};
export function bpmInUnit(bpm: number, fromUnit: string, toUnit: string): number {
  const from = UNIT_QUARTERS[fromUnit] ?? 1;
  const to = UNIT_QUARTERS[toUnit] ?? 1;
  return Math.round((bpm * from) / to);
}

/** Whether the owner is in the jazz track past J1 (J2–J5, the jazz checkpoints and capstones): the jazz numerals. */
export function jazzNumerals(ownerId: string): boolean {
  return /^J[2-5]\.L\d\d$/.test(ownerId) || /^J\.CP\d$/.test(ownerId) || /^JC\d\.S\d$/.test(ownerId);
}

type VoicingExpect = { shape: string | readonly string[]; symbol: string };

/**
 * The voicing a keyboard or staff step asks for (`keyboard.voicing`, `staff-expect.voicing`), as the answers'
 * `HarmonyEnv.voicing` reads it: the chord(s) and the shape(s) the prompt names. The widget says what was built live
 * only with the VOICINGS lens on, else once checked.
 */
export function voicingAskOf(ex: Exercise): { symbol: string | string[]; shape: string | string[] } | null {
  if (ex.kind === "keyboard") {
    const v = (ex.expect as { voicing?: VoicingExpect }).voicing;
    return v
      ? { symbol: v.symbol, shape: Array.isArray(v.shape) ? [...v.shape] : (v.shape as string) }
      : null;
  }
  if (ex.kind === "staff-write" || ex.kind === "dictation") {
    const e = (ex as { expect?: { e?: string; symbols?: string[]; voicing?: string | string[] } }).expect;
    if (e?.e === "chords" && e.voicing && e.symbols)
      return { symbol: [...e.symbols], shape: Array.isArray(e.voicing) ? [...e.voicing] : e.voicing };
  }
  return null;
}

/** "2+2+3". */
export function groupingText(g: readonly number[]): string {
  return g.join("+");
}

/** "3 hits in 8 steps", "5 hits in 8 steps, rotated by 1". */
export function euclidText(e: readonly number[]): string {
  const [k, n, r] = e;
  if (k === undefined || n === undefined) return "";
  return `${k} ${k === 1 ? "hit" : "hits"} in ${n} steps${r ? `, rotated by ${r}` : ""}`;
}

/**
 * The Wave 7 answers in the tutor's words (only what the learner entered, never the step's `correct`): a grouping
 * as its groups, a Euclidean rhythm as its numbers, two-lane taps as how many taps each lane got.
 */
export function wave7TutorText(ex: Exercise, response: AttemptResponse): string | null {
  const r = response as { answer?: { grouping?: number[]; euclid?: number[] }; lanes?: number[][] };
  if (r.answer?.grouping && r.answer.grouping.length > 0)
    return `the bar grouped ${groupingText(r.answer.grouping)}`;
  if (r.answer?.euclid && r.answer.euclid.length >= 2) return euclidText(r.answer.euclid);
  if (Array.isArray(r.lanes)) {
    const lanes = tapLanesOf(ex);
    return r.lanes
      .map(
        (l, i) => `${lanes?.[i]?.label ?? `lane ${i + 1}`}: ${l.length} ${l.length === 1 ? "tap" : "taps"}`,
      )
      .join("; ");
  }
  return null;
}
