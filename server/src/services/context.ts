// What every service shares: the repositories, the content index, the clock, and the learner's day.
import { randomUUID } from "node:crypto";
import type { Profile } from "@oak/api";
import type { ContentIndex } from "../content/index.ts";
import type { Repos } from "../db/repos/index.ts";
import { addDays, learnerDay, weekStart } from "../lib/days.ts";

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
  /** The learner day of an instant (default: now). */
  day(at: Date = this.now()): string {
    const p = this.profile();
    return learnerDay(at, p.timezone, p.rolloverHour);
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
