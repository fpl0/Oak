// What every service shares: the repositories, the content index, the clock, and the learner's day.
import { randomUUID } from "node:crypto";
import type { Profile } from "@oak/api";
import type { ContentIndex } from "../content/index.ts";
import type { Repos } from "../db/repos/index.ts";
import { addDays, learnerDay, monotonicDay, weekStart } from "../lib/days.ts";

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export interface ServiceContext {
  repos: Repos;
  content: ContentIndex;
  clock: Clock;
  appVersion: string;
}

/** The learner-local calendar: the profile's zone and rollover hour (contracts §7.8). */
export class LearnerTime {
  constructor(private readonly ctx: ServiceContext) {}
  profile(): Profile {
    return this.ctx.repos.profile.get();
  }
  now(): Date {
    return this.ctx.clock.now();
  }
  iso(): string {
    return this.now().toISOString();
  }
  timeZone(): string {
    return this.profile().timezone;
  }
  /**
   * The learner day of an instant. Without `at` it is TODAY, which never runs backwards (`monotonicDay`):
   * a clock stepped back or a westward time-zone change continues the day Oak already recorded activity on
   * instead of reopening an earlier one. With `at`, the plain calendar day of that instant (for dating
   * stored instants).
   */
  day(at?: Date): string {
    const p = this.profile();
    const raw = learnerDay(at ?? this.now(), p.timezone, p.rolloverHour);
    return at === undefined ? monotonicDay(raw, this.activityFloor()) : raw;
  }
  /** The latest learner day with recorded activity (a session or a streak day), or `null`. */
  activityFloor(): string | null {
    const r = this.ctx.repos.db
      .query(
        "SELECT MAX(d) AS d FROM (SELECT MAX(day) AS d FROM sessions UNION ALL SELECT MAX(day) AS d FROM streak_days)",
      )
      .get() as { d: string | null } | null;
    return r?.d ?? null;
  }
  week(day: string = this.day()): string {
    return weekStart(day);
  }
  yesterday(): string {
    return addDays(this.day(), -1);
  }
  /** The learner day on which Oak was first used: onboarding, or the profile's creation. */
  firstDay(): string {
    const p = this.profile();
    return this.day(new Date(p.onboardedAt ?? p.createdAt));
  }
}

export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 20)}`;
}

/** The default IANA zone for a new profile. */
export function systemTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}
