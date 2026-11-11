// streak_days, streak_weeks, rests.
import type { StreakDay, StreakWeek } from "@oak/api";
import { all, bool, type Db, fromJson, get, int, run, toJson } from "../index.ts";

interface DayRow {
  day: string;
  qualified: number;
  source: string;
  kinds_json: string;
  minutes: number;
  review_sets: number;
  sketch_saved: number;
}
const toDay = (r: DayRow): StreakDay => ({
  day: r.day,
  qualified: bool(r.qualified),
  source: r.source as StreakDay["source"],
  kinds: fromJson<StreakDay["kinds"]>(r.kinds_json, []),
  minutes: r.minutes,
  reviewSets: r.review_sets,
  sketchSaved: bool(r.sketch_saved),
});
interface WeekRow {
  week_start: string;
  goal: number;
  qualifying_days: number;
  banked_used: number;
  repaired_days: number;
  status: string;
}
const toWeek = (r: WeekRow): StreakWeek => ({
  weekStart: r.week_start,
  goal: r.goal,
  qualifyingDays: r.qualifying_days,
  bankedUsed: r.banked_used,
  repairedDays: r.repaired_days,
  status: r.status as StreakWeek["status"],
});

export class StreakRepo {
  constructor(private readonly db: Db) {}

  day(day: string): StreakDay | null {
    const row = get<DayRow>(this.db, "SELECT * FROM streak_days WHERE day = ?", day);
    return row === null ? null : toDay(row);
  }
  saveDay(d: StreakDay): StreakDay {
    run(
      this.db,
      `INSERT INTO streak_days (day, qualified, source, kinds_json, minutes, review_sets, sketch_saved)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (day) DO UPDATE SET qualified = excluded.qualified, source = excluded.source,
         kinds_json = excluded.kinds_json, minutes = excluded.minutes, review_sets = excluded.review_sets,
         sketch_saved = excluded.sketch_saved`,
      d.day,
      int(d.qualified),
      d.source,
      toJson(d.kinds),
      d.minutes,
      d.reviewSets,
      int(d.sketchSaved),
    );
    return d;
  }
  daysBetween(from: string, to: string): StreakDay[] {
    return all<DayRow>(
      this.db,
      "SELECT * FROM streak_days WHERE day >= ? AND day <= ? ORDER BY day",
      from,
      to,
    ).map(toDay);
  }
  qualifiedDays(): string[] {
    return all<{ day: string }>(this.db, "SELECT day FROM streak_days WHERE qualified = 1 ORDER BY day").map(
      (r) => r.day,
    );
  }
  lastQualifiedDay(before?: string): string | null {
    const row =
      before === undefined
        ? get<{ day: string }>(
            this.db,
            "SELECT day FROM streak_days WHERE qualified = 1 ORDER BY day DESC LIMIT 1",
          )
        : get<{ day: string }>(
            this.db,
            "SELECT day FROM streak_days WHERE qualified = 1 AND day < ? ORDER BY day DESC LIMIT 1",
            before,
          );
    return row?.day ?? null;
  }

  week(weekStart: string): StreakWeek | null {
    const row = get<WeekRow>(this.db, "SELECT * FROM streak_weeks WHERE week_start = ?", weekStart);
    return row === null ? null : toWeek(row);
  }
  weeks(): StreakWeek[] {
    return all<WeekRow>(this.db, "SELECT * FROM streak_weeks ORDER BY week_start").map(toWeek);
  }
  saveWeek(w: StreakWeek): StreakWeek {
    run(
      this.db,
      `INSERT INTO streak_weeks (week_start, goal, qualifying_days, banked_used, repaired_days, status)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (week_start) DO UPDATE SET goal = excluded.goal, qualifying_days = excluded.qualifying_days,
         banked_used = excluded.banked_used, repaired_days = excluded.repaired_days, status = excluded.status`,
      w.weekStart,
      w.goal,
      w.qualifyingDays,
      w.bankedUsed,
      w.repairedDays,
      w.status,
    );
    return w;
  }

  unspentRests(): number {
    return Number(
      get<{ n: number }>(this.db, "SELECT COUNT(*) AS n FROM rests WHERE spent_week IS NULL")?.n ?? 0,
    );
  }
  earnedIn(week: string): boolean {
    return get(this.db, "SELECT 1 FROM rests WHERE earned_week = ?", week) !== null;
  }
  earnRest(week: string): void {
    run(this.db, "INSERT INTO rests (earned_week) VALUES (?)", week);
  }
  /** Spends up to `n` banked rests on `week`, oldest first. Returns how many were spent. */
  spendRests(week: string, n: number): number {
    const ids = all<{ id: number }>(
      this.db,
      "SELECT id FROM rests WHERE spent_week IS NULL ORDER BY earned_week, id LIMIT ?",
      n,
    );
    for (const { id } of ids) run(this.db, "UPDATE rests SET spent_week = ? WHERE id = ?", week, id);
    return ids.length;
  }
}
