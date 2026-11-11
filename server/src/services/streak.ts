// The weekly streak (contracts §7.8): qualifying days, a weekly goal, banked rests, a 48-hour repair
// window and paused weeks. Weeks are closed lazily: every read or write first closes the weeks that
// ended before the current one. Copy and UI live in the app; this file only keeps the numbers.
import type { StreakDay, StreakSummary, StreakWeek } from "@oak/api";
import { STREAK } from "@oak/srs";
import { addDays, dayIndex, dayStartInstant, daysOfWeek, weekdayIndex, weekStart } from "../lib/days.ts";
import { LearnerTime, type ServiceContext } from "./context.ts";

export type QualifyingKind = "review" | "sketch" | "keepalive";

const MET = new Set<StreakWeek["status"]>(["met", "met-banked", "met-repaired"]);
/** Statuses a week has once `close()` settled it. */
const CLOSED = new Set<StreakWeek["status"]>([...MET, "tie-open", "missed"]);

/** The goal of a week: the first week after onboarding is pro-rated, `max(1, ceil(G × daysLeft / 7))`. */
export function weekGoal(goal: number, week: string, firstDay: string): number {
  const firstWeek = weekStart(firstDay);
  if (week !== firstWeek) return goal;
  const daysLeft = 7 - weekdayIndex(firstDay);
  return Math.max(1, Math.ceil((goal * daysLeft) / 7));
}

/** Whether `day` falls inside the repair window of the week before its own (Monday and Tuesday). */
export function inRepairWindow(day: string): boolean {
  return weekdayIndex(day) < STREAK.repairHours / 24;
}

export class StreakService {
  readonly time: LearnerTime;
  constructor(private readonly ctx: ServiceContext) {
    this.time = new LearnerTime(ctx);
  }

  #paused(): Set<string> {
    return new Set(this.ctx.repos.settings.get("pausedWeeks"));
  }
  #goal(week: string): number {
    return weekGoal(this.time.profile().weeklyGoal, week, this.time.firstDay());
  }
  #qualifyingDays(week: string): number {
    return this.ctx.repos.streak.daysBetween(week, addDays(week, 6)).filter((d) => d.qualified).length;
  }

  /**
   * Close every week that ended before `today`'s week, oldest first, and settle open ties whose
   * window has passed. Idempotent.
   */
  close(today: string = this.time.day()): void {
    const repo = this.ctx.repos.streak;
    const current = weekStart(today);
    const first = weekStart(this.time.firstDay());
    const paused = this.#paused();
    for (let w = first; dayIndex(w) < dayIndex(current); w = addDays(w, 7)) {
      const stored = repo.week(w);
      const goal = this.#goal(w);
      const q = this.#qualifyingDays(w);
      if (stored === null || stored.status === "open") {
        if (paused.has(w)) {
          repo.saveWeek({
            weekStart: w,
            goal,
            qualifyingDays: q,
            bankedUsed: 0,
            repairedDays: 0,
            status: "paused",
          });
          continue;
        }
        const bank = repo.unspentRests();
        if (q >= goal) {
          repo.saveWeek({
            weekStart: w,
            goal,
            qualifyingDays: q,
            bankedUsed: 0,
            repairedDays: 0,
            status: "met",
          });
          // Each week met on qualifying days alone earns one rest; the bank holds at most 2.
          if (bank < STREAK.bankMax && !repo.earnedIn(w)) repo.earnRest(w);
        } else if (q + bank >= goal) {
          const used = repo.spendRests(w, goal - q);
          repo.saveWeek({
            weekStart: w,
            goal,
            qualifyingDays: q,
            bankedUsed: used,
            repairedDays: 0,
            status: "met-banked",
          });
        } else {
          repo.saveWeek({
            weekStart: w,
            goal,
            qualifyingDays: q,
            bankedUsed: 0,
            repairedDays: 0,
            status: "tie-open",
          });
        }
      }
      const now = repo.week(w);
      if (now?.status === "tie-open") {
        const next = addDays(w, 7);
        // The tie lasts until Wednesday 04:00 of the next week; once today is past it, the week is missed.
        const windowOver = dayIndex(current) > dayIndex(next) || !inRepairWindow(today);
        if (windowOver) repo.saveWeek({ ...now, status: "missed" });
      }
    }
  }

  /** Records a qualifying activity on `day` (default today). Returns the summary after it. */
  qualify(
    kind: QualifyingKind,
    opts: { day?: string; reviewSets?: number; minutes?: number } = {},
  ): StreakSummary {
    const repo = this.ctx.repos.streak;
    const day = opts.day ?? this.time.day();
    this.close(day);
    const existing = repo.day(day);
    const wasQualified = existing?.qualified === true;
    const kinds = new Set(existing?.kinds ?? []);
    kinds.add(kind);
    let source: StreakDay["source"] = wasQualified && existing !== null ? existing.source : kind;
    if (!wasQualified && inRepairWindow(day) && this.#repair(day)) source = "repair";
    repo.saveDay({
      day,
      qualified: true,
      source,
      kinds: [...kinds].sort() as StreakDay["kinds"],
      minutes: (existing?.minutes ?? 0) + (opts.minutes ?? 0),
      reviewSets: (existing?.reviewSets ?? 0) + (opts.reviewSets ?? (kind === "review" ? 1 : 0)),
      sketchSaved: (existing?.sketchSaved ?? false) || kind === "sketch",
    });
    this.#recordInWeek(day);
    return this.summary(day);
  }

  /** A finished review set qualifies the day with ≥ 4 trials, or ≥ 5 fact cards (contracts §7.8 a). */
  reviewSet(trials: number, opts: { facts?: boolean; day?: string } = {}): StreakSummary {
    const enough = opts.facts === true ? trials >= STREAK.factCards : trials >= STREAK.setTrials;
    if (!enough) return this.summary(opts.day);
    return this.qualify("review", { ...(opts.day === undefined ? {} : { day: opts.day }), reviewSets: 1 });
  }

  /** Adds practice minutes to a day without qualifying it (secondary numbers only). */
  addMinutes(minutes: number, day: string = this.time.day()): void {
    const repo = this.ctx.repos.streak;
    const existing = repo.day(day);
    repo.saveDay(
      existing === null
        ? { day, qualified: false, source: "session", kinds: [], minutes, reviewSets: 0, sketchSaved: false }
        : { ...existing, minutes: existing.minutes + minutes },
    );
  }

  /** One repaired day for last week's open tie. Returns true when it was used. */
  #repair(day: string): boolean {
    const repo = this.ctx.repos.streak;
    const short = addDays(weekStart(day), -7);
    const w = repo.week(short);
    if (w?.status !== "tie-open") return false;
    const repaired = w.repairedDays + 1;
    const need = w.goal - w.qualifyingDays - repaired;
    if (need <= 0) {
      repo.saveWeek({ ...w, repairedDays: repaired, status: "met-repaired" });
    } else if (need <= repo.unspentRests()) {
      const used = repo.spendRests(short, need);
      repo.saveWeek({
        ...w,
        repairedDays: repaired,
        bankedUsed: w.bankedUsed + used,
        status: "met-repaired",
      });
    } else {
      repo.saveWeek({ ...w, repairedDays: repaired });
    }
    return true;
  }

  /**
   * Counts a qualifying day in its week. A week already closed (met, banked, repaired, tie-open, missed)
   * is never reopened: a day that lands in one late (a session ended after the rollover, a time-zone
   * change, a clock stepped back) only adds to its count, and can settle an open tie. Reopening it would
   * re-run the close and could turn a met week into a missed one (its spent rests stay spent).
   */
  #recordInWeek(day: string): void {
    const repo = this.ctx.repos.streak;
    const stored = repo.week(weekStart(day));
    if (stored === null || !CLOSED.has(stored.status)) {
      this.#saveOpenWeek(day);
      return;
    }
    const q = this.#qualifyingDays(stored.weekStart);
    if (q <= stored.qualifyingDays) return;
    const settled = stored.status === "tie-open" && q + stored.repairedDays >= stored.goal;
    repo.saveWeek({
      ...stored,
      qualifyingDays: q,
      status: settled ? (stored.repairedDays > 0 ? "met-repaired" : "met") : stored.status,
    });
  }

  #saveOpenWeek(day: string): void {
    const w = weekStart(day);
    const repo = this.ctx.repos.streak;
    const goal = this.#goal(w);
    const status = this.#paused().has(w) ? "paused" : "open";
    repo.saveWeek({
      weekStart: w,
      goal,
      qualifyingDays: this.#qualifyingDays(w),
      bankedUsed: 0,
      repairedDays: 0,
      status,
    });
  }

  #thisWeek(today: string): StreakSummary["thisWeek"] {
    const w = weekStart(today);
    const paused = this.#paused().has(w);
    const rows = new Map(this.ctx.repos.streak.daysBetween(w, addDays(w, 6)).map((d) => [d.day, d]));
    const days = daysOfWeek(w).map(
      (day): StreakDay =>
        rows.get(day) ?? {
          day,
          qualified: false,
          source: paused ? "paused" : "rest",
          kinds: [],
          minutes: 0,
          reviewSets: 0,
          sketchSaved: false,
        },
    );
    const q = days.filter((d) => d.qualified).length;
    const goal = this.#goal(w);
    const status: StreakWeek["status"] = paused ? "paused" : q >= goal ? "met" : "open";
    return { weekStart: w, goal, qualifyingDays: q, bankedUsed: 0, repairedDays: 0, status, days };
  }

  /** Consecutive met weeks up to now; paused and still-open ties neither count nor break. */
  static runs(weeks: readonly StreakWeek[], currentMet: boolean): { current: number; longest: number } {
    let run = 0;
    let longest = 0;
    for (const w of weeks) {
      if (MET.has(w.status)) run += 1;
      else if (w.status === "missed") run = 0;
      longest = Math.max(longest, run);
    }
    if (currentMet) run += 1;
    longest = Math.max(longest, run);
    return { current: run, longest };
  }

  summary(today: string = this.time.day()): StreakSummary {
    this.close(today);
    const repo = this.ctx.repos.streak;
    const current = weekStart(today);
    // A week settled by `close()` stays settled even when the learner day is behind it (a clock stepped
    // back, a time-zone change across Monday 04:00): the runs never shrink because the clock moved.
    const closed = repo
      .weeks()
      .filter((w) => dayIndex(w.weekStart) < dayIndex(current) || CLOSED.has(w.status));
    const thisWeek = this.#thisWeek(today);
    const currentClosed = closed.some((w) => w.weekStart === current);
    const runs = StreakService.runs(closed, !currentClosed && thisWeek.status === "met");
    const last = closed.find((w) => w.weekStart === addDays(current, -7));
    const bank = repo.unspentRests();
    let repair: StreakSummary["repair"] = null;
    if (last?.status === "tie-open" && last.weekStart === addDays(current, -7) && inRepairWindow(today)) {
      const p = this.time.profile();
      repair = {
        weekStart: last.weekStart,
        missingDays: Math.max(1, last.goal - last.qualifyingDays - last.repairedDays - bank),
        until: dayStartInstant(addDays(current, 2), p.timezone, p.rolloverHour).toISOString(),
      };
    }
    const qualified = repo.qualifiedDays();
    const set = new Set(qualified);
    let runDays = 0;
    let cursor = set.has(today) ? today : addDays(today, -1);
    while (set.has(cursor)) {
      runDays += 1;
      cursor = addDays(cursor, -1);
    }
    return {
      weeks: runs.current,
      longestWeeks: runs.longest,
      weeklyGoal: this.time.profile().weeklyGoal,
      thisWeek,
      bankedRests: Math.min(STREAK.bankMax, bank),
      repair,
      totalDays: qualified.length,
      currentRunDays: runDays,
      todayQualified: set.has(today),
    };
  }

  /** `GET /api/streak`: the summary, the last `n` weeks and their days. */
  history(
    weeks: number,
    today: string = this.time.day(),
  ): { summary: StreakSummary; weeks: StreakWeek[]; days: StreakDay[] } {
    const summary = this.summary(today);
    const from = addDays(weekStart(today), -7 * Math.max(0, weeks - 1));
    const list = this.ctx.repos.streak
      .weeks()
      .filter((w) => w.weekStart >= from && w.weekStart < weekStart(today));
    const { days, ...thisWeek } = summary.thisWeek;
    return {
      summary,
      weeks: [...list, thisWeek],
      days: this.ctx.repos.streak.daysBetween(from, addDays(weekStart(today), 6)),
    };
  }

  /** Days since the last qualifying day (contracts §7.9 `gap`); `null` before the first one. */
  gap(today: string = this.time.day()): number | null {
    const last = this.ctx.repos.streak.lastQualifiedDay(addDays(today, 1));
    return last === null ? null : dayIndex(today) - dayIndex(last);
  }
}
