// The learner's voice on the server (docs/design/wave3.md §5.3; contracts §8.2, §8.3, §8.5): Quiet mode
// (today, always, or no usable mic), the vocal range, the singing labels and the sing-tolerance ladder.
//
// The ladder is computed from graded sung notes the server already receives (`steps.attempt` sung responses,
// `drills.trials` sung responses and `sungResolution.notes`), never from Quiet-mode, skipped or calibration
// notes. It tightens one rung when 3 distinct learner days within 21 each have ≥ 8 graded notes with a median
// |cents error| at or under the next rung's bar, only in auto mode, never while a checkpoint is pending, and
// only when a session ends (the change is announced once in that Coda, never mid-session). It never loosens
// by itself: the learner fixes a value, goes back to Auto, or takes the one-tap loosen after a 21-day gap.
// Voice evidence never gates anything: nothing here is read by a gate, an unlock or a rubric.
import type {
  DrillTrialRecord,
  SungResolution,
  VoiceLadder,
  VoiceLadderSet,
  VoiceQuietSet,
  VoiceState,
} from "@oak/api";
import type { Exercise } from "@oak/content-kit";
import { RETURN } from "@oak/srs";
import type { LadderChange, SungNoteRow } from "../db/repos/voice.ts";
import { conflict } from "../errors.ts";
import { addDays, dayIndex } from "../lib/days.ts";
import { LearnerTime, type ServiceContext } from "./context.ts";
import type { GatesService } from "./gates.ts";

export type TolCents = 70 | 50 | 35 | 25;
/** The ladder's rungs, loosest first (contracts §8.2). */
export const LADDER_RUNGS: readonly TolCents[] = [70, 50, 35, 25];
/** The day's median |e| a step needs, by the rung it tightens to. */
export const LADDER_BARS: Readonly<Record<Exclude<TolCents, 70>, number>> = { 50: 35, 35: 25, 25: 20 };
export const LADDER_WINDOW_DAYS = 21;
export const LADDER_DAYS_NEEDED = 3;
export const LADDER_MIN_NOTES = 8;
/**
 * Decision 29: an offered checkpoint holds the ladder while the planner keeps offering it. An offer older than
 * this (in learner days) lapses: the learner has left it (a dropped track), or a break longer than this
 * interrupts it (the next offer holds again).
 */
export const LADDER_OFFER_HOLD_DAYS = 14;
/** The lesson that introduces syllables: singing is on numbers before it (contracts §8.3). */
export const SYLLABLES_LESSON = "U03.L08";

const tighter = (c: TolCents): TolCents | null => LADDER_RUNGS[LADDER_RUNGS.indexOf(c) + 1] ?? null;
const looser = (c: TolCents): TolCents | null => LADDER_RUNGS[LADDER_RUNGS.indexOf(c) - 1] ?? null;

function median(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
}

/** One sung note as the wire carries it (`{ midi, cents, credit }`); only voiced notes (cents known) count. */
interface WireNote {
  midi: number | null;
  cents: number | null;
  credit: number;
}
function graded(notes: readonly WireNote[] | null | undefined): { absCents: number; credit: number }[] {
  return (notes ?? [])
    .filter((n) => typeof n.cents === "number" && Number.isFinite(n.cents))
    .map((n) => ({ absCents: Math.abs(n.cents as number), credit: n.credit }));
}

export interface VoiceDeps {
  gates: GatesService;
}

export class VoiceService {
  readonly time: LearnerTime;
  constructor(
    private readonly ctx: ServiceContext,
    private readonly d: VoiceDeps,
  ) {
    this.time = new LearnerTime(ctx);
  }

  get #repos() {
    return this.ctx.repos;
  }

  // --- Quiet mode ---------------------------------------------------------------------------------

  /**
   * Quiet mode today: the learner's choice for today wins (on or off), then "always" (`profile.quiet`), then
   * no usable mic (`profile.inputKind === "none"`). Without a mic the choice "off for today" changes nothing.
   */
  quietState(day: string = this.time.day()): { quiet: boolean; reason: VoiceState["quietReason"] } {
    const p = this.#repos.profile.get();
    const v = this.#repos.voice.get();
    const noMic = p.inputKind === "none";
    if (v.quietDay === day) {
      if (v.quietToday) return { quiet: true, reason: "today" };
      return noMic ? { quiet: true, reason: "no-mic" } : { quiet: false, reason: null };
    }
    if (p.quiet) return { quiet: true, reason: "always" };
    if (noMic) return { quiet: true, reason: "no-mic" };
    return { quiet: false, reason: null };
  }
  quiet(): boolean {
    return this.quietState().quiet;
  }

  /** `PUT /voice/quiet`: `today` lasts until the next learner day; `always` is the profile's flag. */
  setQuiet(body: VoiceQuietSet): VoiceState {
    const at = this.time.iso();
    const day = this.time.day();
    const v = this.#repos.voice.get();
    if (body.scope === "today") this.#repos.voice.save({ ...v, quietDay: day, quietToday: body.quiet }, at);
    else {
      this.#repos.profile.patch({ quiet: body.quiet });
      // "Always off" also clears a choice made for today, so the switch does what it says now.
      if (v.quietDay === day) this.#repos.voice.save({ ...v, quietDay: null, quietToday: false }, at);
    }
    return this.state();
  }

  // --- the view -----------------------------------------------------------------------------------

  /** Singing labels: numbers until U03.L08 is completed; then the profile's choice (syllables by default). */
  labels(): VoiceState["labels"] {
    if (!this.d.gates.lessonCompleted(SYLLABLES_LESSON)) return "numbers";
    return this.#repos.profile.get().solfege;
  }

  state(): VoiceState {
    const day = this.time.day();
    const p = this.#repos.profile.get();
    const q = this.quietState(day);
    const range =
      p.vocalLowMidi === null || p.vocalHighMidi === null
        ? null
        : {
            low: p.vocalLowMidi,
            high: p.vocalHighMidi,
            comfortLow: p.comfortLowMidi ?? p.vocalLowMidi + 2,
            comfortHigh: p.comfortHighMidi ?? p.vocalHighMidi - 2,
          };
    return {
      day,
      quiet: q.quiet,
      quietReason: q.reason,
      range,
      labels: this.labels(),
      ladder: this.ladder(),
    };
  }

  /**
   * The checkpoint that holds the ladder (contracts §8.2 as amended by decision 29): one the planner has
   * actually offered (Today's New block, or a session started on it) on one of the last
   * `LADDER_OFFER_HOLD_DAYS` learner days, and not passed or soft-passed. A checkpoint whose second-to-last
   * lesson is done but that was never offered (a track the learner dropped near its end) holds nothing, and an
   * offer the planner stopped repeating (the learner left that track) lapses, so the ladder never freezes for
   * good. A core checkpoint blocks the default order, so the planner offers it every day until it is passed.
   */
  pendingCheckpoint(day: string = this.time.day()): string | null {
    const offers = this.#repos.voice.offers();
    let pending: { id: string; day: string } | null = null;
    for (const [cpId, offered] of Object.entries(offers)) {
      if (this.#sessionDaysAfter(offered, day) >= LADDER_OFFER_HOLD_DAYS) continue;
      if (this.ctx.content.checkpointMeta(cpId) === null || this.d.gates.checkpointPassed(cpId)) continue;
      if (pending === null || offered > pending.day) pending = { id: cpId, day: offered };
    }
    return pending?.id ?? null;
  }

  /**
   * How old an offer is: the learner days after it, up to `day`, on which a session was started. A break does
   * not age it (the first sessions back are light ones, which do not offer the checkpoint; with calendar days
   * the hold lapsed during the break and the light session's Coda could tighten the ladder from evidence sung
   * before the break, the checkpoint still pending). A learner who keeps practising without it (a dropped
   * track) lapses it after `LADDER_OFFER_HOLD_DAYS` such days.
   */
  #sessionDaysAfter(offered: string, day: string): number {
    if (day <= offered) return 0;
    const days = new Set<string>();
    for (const s of this.#repos.sessions.since(addDays(offered, 1))) if (s.day <= day) days.add(s.day);
    return days.size;
  }

  /** The planner offered checkpoint `cpId` today (decision 29). Anything that is not a checkpoint is ignored. */
  recordOffer(cpId: string | null, day: string = this.time.day()): void {
    if (cpId === null || this.ctx.content.checkpointMeta(cpId) === null) return;
    if (this.d.gates.checkpointPassed(cpId)) return;
    this.#repos.voice.recordOffer(cpId, day, this.time.iso());
  }

  /** Days missed since the last qualifying day before today (contracts §7.9 `gap`). */
  #gapDays(day: string): number {
    const last = this.#repos.streak.lastQualifiedDay(day);
    return last === null ? 0 : Math.max(0, dayIndex(day) - dayIndex(last) - 1);
  }

  ladder(): VoiceLadder {
    const day = this.time.day();
    const p = this.#repos.profile.get();
    const v = this.#repos.voice.get();
    const cents = p.singToleranceCents as TolCents;
    const nextCents = p.singTolMode === "auto" ? tighter(cents) : null;
    const bar = nextCents === null ? null : LADDER_BARS[nextCents as Exclude<TolCents, 70>];
    const changeDay = v.lastChange === null ? null : this.time.day(new Date(v.lastChange.at));
    const days = this.#windowDays(day, changeDay, bar);
    const pending = this.pendingCheckpoint(day);
    const loosenable = looser(cents) !== null;
    const loosenedToday =
      v.lastChange?.reason === "loosen" && this.time.day(new Date(v.lastChange.at)) === day;
    return {
      cents,
      mode: p.singTolMode,
      next: nextCents === null || bar === null ? null : { cents: nextCents, medianAtMost: bar },
      days,
      qualifyingDays: days.filter((d) => d.qualifies).length,
      daysNeeded: LADDER_DAYS_NEEDED,
      held: pending === null ? null : { reason: "checkpoint-pending", checkpointId: pending },
      offerLoosen: loosenable && !loosenedToday && this.#gapDays(day) >= RETURN.loosenGap,
      lastChange: v.lastChange,
    };
  }

  /**
   * The days of the 21-day window with graded notes, after the learner day of the last change: the change day
   * itself never counts again toward the next rung (as `@oak/pitch` `ladderProgress` reads `since`), so a rung
   * always rests on 3 days that all come after it.
   */
  #windowDays(day: string, changeDay: string | null, bar: number | null): VoiceLadder["days"] {
    const windowStart = addDays(day, -(LADDER_WINDOW_DAYS - 1));
    const from =
      changeDay !== null && addDays(changeDay, 1) > windowStart ? addDays(changeDay, 1) : windowStart;
    const notes = from > day ? [] : this.#repos.sung.between(from, day, null);
    const byDay = new Map<string, SungNoteRow[]>();
    for (const n of notes) byDay.set(n.day, [...(byDay.get(n.day) ?? []), n]);
    return [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([d, rows]) => {
        const med = median(rows.map((r) => r.absCents));
        return {
          day: d,
          notes: rows.length,
          medianAbsCents: med === null ? null : Math.round(med * 10) / 10,
          qualifies: bar !== null && med !== null && rows.length >= LADDER_MIN_NOTES && med <= bar,
        };
      });
  }

  // --- the learner's settings ---------------------------------------------------------------------

  /** `PUT /voice/ladder`: Auto, a fixed tolerance, or the one-tap loosen (only while it is offered). */
  setLadder(body: VoiceLadderSet): VoiceState {
    const at = this.time.iso();
    const p = this.#repos.profile.get();
    const v = this.#repos.voice.get();
    const from = p.singToleranceCents as TolCents;
    if (body.mode === "auto") {
      this.#repos.profile.patch({ singTolMode: "auto" });
    } else if (body.mode === "fixed") {
      const to = body.cents as TolCents;
      this.#repos.profile.patch({ singTolMode: "fixed", singToleranceCents: to });
      if (to !== from) this.#repos.voice.save({ ...v, lastChange: { from, to, at, reason: "learner" } }, at);
    } else {
      const to = looser(from);
      if (to === null || !this.ladder().offerLoosen)
        throw conflict("a looser tolerance is offered after a break of three weeks or more");
      this.#repos.profile.patch({ singToleranceCents: to });
      this.#repos.voice.save({ ...v, lastChange: { from, to, at, reason: "loosen" } }, at);
    }
    return this.state();
  }

  // --- evidence -----------------------------------------------------------------------------------

  /**
   * A graded sung lesson step (`steps.attempt` with a `sung` response). Not counted: Quiet-mode fallbacks,
   * tutor-typed attempts, errors, and the onboarding's lenient first sing (it is not graded on the ladder).
   */
  recordStep(args: {
    attemptId: number;
    exercise: Exercise;
    sung: readonly WireNote[] | null;
    modality: string | undefined;
    status: string;
    tutorAssisted: boolean;
  }): void {
    if (args.exercise.kind !== "sing" || args.sung === null) return;
    if (args.modality === "fallback" || args.tutorAssisted || args.status === "error") return;
    if ((args.exercise.tol as { lenient?: boolean } | undefined)?.lenient === true) return;
    const tol = this.#repos.profile.get().singToleranceCents;
    this.#write("step", String(args.attemptId), graded(args.sung), tol);
  }

  /**
   * One drill trial as stored (`drills.trials` upserts, so a re-post replaces its notes): its sung notes and
   * its sung resolution. Not counted: skipped trials and parts, revealed trials, Quiet-mode trials.
   */
  recordTrial(drillSessionId: string, t: DrillTrialRecord, mic: boolean): void {
    const id = `${drillSessionId}#${t.idx}`;
    const quiet = t.modality === "quiet" || t.modality === "fallback";
    const tol = this.#repos.profile.get().singToleranceCents;
    const sung = mic && !quiet && !t.response.skipped && t.revealed !== true ? graded(t.response.sung) : [];
    this.#write("trial", id, sung, tol);
    const r: SungResolution | null | undefined = t.sungResolution;
    const resolution = r && !r.skipped && !r.quiet && !quiet ? graded(r.notes) : [];
    this.#write("resolution", id, resolution, r?.tolCents ?? tol);
  }

  #write(
    kind: "step" | "trial" | "resolution",
    sourceId: string,
    notes: readonly { absCents: number; credit: number }[],
    tolCents: number,
  ): void {
    const at = this.time.iso();
    const day = this.time.day();
    this.#repos.sung.replace(
      kind,
      sourceId,
      notes.map((n, idx) => ({ idx, day, absCents: n.absCents, credit: n.credit, tolCents, at })),
    );
  }

  // --- the ladder moves -----------------------------------------------------------------------------

  /**
   * Called when a session ends: tightens one rung when the evidence qualifies (auto mode, nothing pending).
   * Returns the change made, or `null`.
   */
  evaluate(): LadderChange | null {
    const p = this.#repos.profile.get();
    if (p.singTolMode !== "auto") return null;
    const ladder = this.ladder();
    if (ladder.next === null || ladder.held !== null) return null;
    if (ladder.qualifyingDays < LADDER_DAYS_NEEDED) return null;
    const at = this.time.iso();
    const change: LadderChange = { from: ladder.cents, to: ladder.next.cents, at, reason: "evidence" };
    this.#repos.profile.patch({ singToleranceCents: change.to });
    this.#repos.voice.save({ ...this.#repos.voice.get(), lastChange: change }, at);
    return change;
  }

  /** The Coda's `toleranceChange`: an evidence change not announced yet, once. */
  announce(): { from: TolCents; to: TolCents } | null {
    const v = this.#repos.voice.get();
    const c = v.lastChange;
    if (c === null || c.reason !== "evidence") return null;
    if (v.announcedAt !== null && v.announcedAt >= c.at) return null;
    this.#repos.voice.save({ ...v, announcedAt: this.time.iso() }, this.time.iso());
    return { from: c.from, to: c.to };
  }

  /** U03.L08 introduces syllables: from then on the learner sings on syllables (numbers stay accepted). */
  onLessonComplete(lessonId: string): void {
    if (lessonId === SYLLABLES_LESSON && this.#repos.profile.get().solfege === "numbers")
      this.#repos.profile.patch({ solfege: "syllables" });
  }
}
