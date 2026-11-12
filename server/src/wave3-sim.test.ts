// Wave 3 review: hundreds of simulated days through the HTTP API on the real course (U00–U04 authored or stood
// in, then past the end of authored content), with the Wave 3 invariants checked every day:
//  - one open session per learner day: two tabs racing `session.start` get one session (§5.1);
//  - the server-side done state (`session.day`) across tabs, a clock stepped back and the next day;
//  - idempotent retries under the new keys: a fact review sent twice, or raced, is rated once (§5.2);
//  - the warm-up within its budget, no more than 2 mic sets and none in Quiet mode, nothing before it opens;
//  - checkpoints open exactly when their unit's lessons are done, pass on gating items alone and never on voice
//    (sung items failed or skipped change nothing, contracts §7.6);
//  - the sing-tolerance ladder only tightens, one rung at a time, at a session end, announced once, never while a
//    checkpoint is pending (contracts §8.2), whatever bad days the learner has;
//  - deferred families are released (the governor's release path) and none waits for ever;
//  - backup → import into a fresh server → the same plan, due batch, voice state and course progress.
import { beforeAll, describe, expect, test } from "bun:test";
import type {
  CourseProgress,
  DrillSession,
  Session,
  SessionDay,
  SessionPlan,
  SessionSummary,
  SrsCard,
  VoiceState,
  WarmupItem,
} from "@oak/api";
import type { ContentSource } from "./content/types.ts";
import { realCourse } from "./testing/course.ts";
import { gradeResult as gradeResultOf0, type Harness, harness } from "./testing/harness.ts";
import { rng, SimLearner } from "./testing/learner.ts";

let course: ContentSource;
beforeAll(async () => {
  course = await realCourse();
});

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const START = Date.parse("2026-10-19T17:00:00.000Z");
const RUNGS = [70, 50, 35, 25];
const gradeResultOf = (exerciseId: string, score: number) => gradeResultOf0({ exerciseId, score });
const dayNo = (day: string): number => Math.round(Date.parse(`${day}T00:00:00.000Z`) / DAY);

interface Profile {
  name: string;
  seed: number;
  days: number;
  skip: number;
  longGap: number;
  /** Mean |cents| of the learner's sung notes on a good day, and the chance a day is a bad one. */
  singCents: number;
  badDay: number;
  quiet: number;
  gating: (r: () => number) => number;
  backwards: number;
  /** Days on which a backup is exported and imported into a fresh server to compare. */
  backupEvery: number;
  /** A break of this many days starting on day `at` (exercises the one-tap loosen after 21 days away). */
  forcedGap: { at: number; days: number };
}

const PROFILES: Profile[] = [
  {
    name: "steady-singer",
    seed: 31,
    days: 260,
    skip: 0.15,
    longGap: 0.01,
    singCents: 12,
    badDay: 0.15,
    quiet: 0.05,
    gating: (r) => 0.8 + r() * 0.2,
    backwards: 0.1,
    backupEvery: 45,
    forcedGap: { at: 150, days: 24 },
  },
  {
    name: "erratic-voice",
    seed: 32,
    days: 260,
    skip: 0.3,
    longGap: 0.04,
    singCents: 28,
    badDay: 0.4,
    quiet: 0.15,
    gating: (r) => r(),
    backwards: 0.25,
    backupEvery: 60,
    forcedGap: { at: 200, days: 23 },
  },
];

class Sim {
  readonly me: SimLearner;
  readonly r: () => number;
  readonly failures: string[] = [];
  now = START;
  keys = 0;
  quietToday = false;
  badToday = false;
  endOfCourse = false;
  /** The ladder as last seen, and whether a change was announced for it. */
  ladderCents = 70;
  ladderAt: string | null = null;
  readonly kinds = new Map<string, number>();
  checkpoints = 0;
  maxDeferredWait = 0;
  /** The day each deferred card was first seen deferred. */
  readonly deferredSince = new Map<string, number>();
  backups = 0;
  readonly longWaits: string[] = [];
  abandoned = 0;
  tightenings: string[] = [];
  /** Decision 29, kept independently of the server: the learner day each checkpoint was last offered. */
  readonly offered = new Map<string, number>();
  readonly passedCps = new Set<string>();
  /** Learner days on which a session was started (an offer ages only on these: a break does not age it). */
  readonly sessionDays = new Set<number>();
  /** Decision 27, kept independently: per perceptual/production family, the attended days since its lesson. */
  readonly firstReviewWaits = new Map<string, number>();
  firstReviewMax = 0;
  firstReviewOf = "";
  firstReviewed = 0;
  lastPlanDay = "";
  loosens: string[] = [];
  /** The learner day of the last session that ended (a qualifying day for the 21-day gap). */
  lastEndedDay: string | null = null;

  constructor(
    readonly h: Harness,
    readonly p: Profile,
  ) {
    this.me = new SimLearner(h, course, p.seed);
    this.r = rng(p.seed * 104729);
  }

  fail(day: string, what: string): void {
    this.failures.push(`[${this.p.name} ${day}] ${what}`);
  }
  setClock(ms: number): void {
    this.now = ms;
    this.h.clock.set(new Date(ms).toISOString());
  }
  key(): string {
    return `${this.p.name}-k${this.keys++}`;
  }

  /** A sung note as the drill runner posts it: |cents| drawn around the learner's level, worse on a bad day. */
  note(midi: number): { midi: number; cents: number; credit: number } {
    const spread = this.badToday ? 60 + this.r() * 60 : this.p.singCents;
    const cents = Math.round((this.r() * 2 - 1) * spread * 1.6);
    const abs = Math.abs(cents);
    return {
      midi,
      cents,
      credit: abs <= this.ladderCents ? 1 : abs <= Math.min(2 * this.ladderCents, 100) ? 0.5 : 0,
    };
  }

  async doItem(sessionId: string, item: WarmupItem): Promise<void> {
    if (item.kind === "listen") return;
    if (item.familyId === null && item.members.length === 0) {
      // Fact reviews, each with its own key; sometimes retried in a row or raced by a second tab.
      for (const cardId of item.cardIds) {
        const before = await this.card(cardId);
        const body = {
          cardId,
          drillSessionId: null,
          idempotencyKey: this.key(),
          outcome: {
            meanCredit: this.r() < 0.85 ? 1 : 0,
            medianRtMs: 2500,
            extraReplays: 0,
            hintRung: 0,
            revealed: false,
            playedLevel: null,
            meanAbsCents: null,
          },
        };
        const x = this.r();
        const sent =
          x < 0.15
            ? [
                await this.h.json("POST", "/api/srs/review", body),
                await this.h.json("POST", "/api/srs/review", body),
              ]
            : x < 0.3
              ? await Promise.all([
                  this.h.json("POST", "/api/srs/review", body),
                  this.h.json("POST", "/api/srs/review", body),
                ])
              : [await this.h.json("POST", "/api/srs/review", body)];
        const day = (await this.day()).day;
        if (sent.some((s) => s.status !== 200))
          this.fail(day, `review ${cardId}: ${sent.map((s) => `${s.status} ${JSON.stringify(s.body)}`)}`);
        if (new Set(sent.map((s) => JSON.stringify(s.body))).size > 1)
          this.fail(day, `review ${cardId}: a retry answered differently`);
        const after = await this.card(cardId);
        if (before && after && after.reps !== before.reps + 1)
          this.fail(day, `review ${cardId} sent ${sent.length}× rated ${after.reps - before.reps}×`);
      }
      return;
    }
    const familyIds = item.familyId !== null ? [item.familyId] : item.members;
    const purpose = item.kind === "anchor" ? "anchor" : item.kind === "repair" ? "repair" : "srs";
    const drill = await this.me.api<DrillSession>("POST", "/api/drills/sessions", {
      sessionId,
      purpose,
      familyIds,
      warmupItemId: item.id,
    });
    const trials = [];
    for (let idx = 0; idx < Math.max(1, drill.trialsPlanned); idx++) {
      const familyId = familyIds[idx % familyIds.length] as string;
      const fam = course.families.find((f) => f.id === familyId);
      const mic = fam?.mic === true;
      const cats = drill.openCategories[familyId] ?? [];
      const credit = this.r() < 0.85 ? 1 : 0;
      const sung = mic && !this.quietToday ? [this.note(60), this.note(64), this.note(67)] : null;
      // A functional-ear trial asks a sung resolution on some trials (contracts §8.3).
      const fet = familyId.startsWith("fam.deg.") && !mic && idx < 3;
      const resolution = fet
        ? {
            path: ["3", "2", "1"] as ("1" | "2" | "3")[],
            order: "play-first" as const,
            notes: this.quietToday ? [] : [this.note(64), this.note(62), this.note(60)],
            credit: 1,
            passed: true,
            skipped: this.r() < 0.1,
            quiet: this.quietToday,
            tolCents: this.ladderCents as 70 | 50 | 35 | 25,
          }
        : null;
      trials.push({
        idx,
        familyId,
        seed: idx + 1,
        level: drill.levels[familyId] ?? 1,
        category: cats[idx % Math.max(1, cats.length)] ?? "all",
        params: {},
        response: { answer: null, taps: null, sung, skipped: false },
        credit,
        correct: credit === 1,
        rtMs: 1500 + Math.round(this.r() * 1500),
        replays: 0,
        confusion: null,
        centsError: null,
        at: this.h.clock.now().toISOString(),
        revealed: false,
        modality: this.quietToday && mic ? ("quiet" as const) : ("normal" as const),
        sungResolution: resolution,
      });
    }
    await this.me.api("POST", `/api/drills/sessions/${drill.id}/trials`, { trials });
    // A retried trial post (a flaky network) replaces the same rows.
    if (this.r() < 0.2) await this.me.api("POST", `/api/drills/sessions/${drill.id}/trials`, { trials });
    await this.me.api("POST", `/api/drills/sessions/${drill.id}/finish`);
  }

  async card(id: string): Promise<SrsCard | undefined> {
    const { cards } = await this.me.api<{ cards: SrsCard[] }>("GET", "/api/drills/families");
    return cards.find((c) => c.cardId === id);
  }
  day(): Promise<SessionDay> {
    return this.me.api<SessionDay>("GET", "/api/session/day");
  }
  voice(): Promise<VoiceState> {
    return this.me.api<VoiceState>("GET", "/api/voice");
  }

  async checkPlan(plan: SessionPlan, progress: CourseProgress): Promise<void> {
    const w = plan.warmup;
    if (w.plannedSec > w.budgetSec + 0.001)
      this.fail(plan.day, `warm-up ${w.plannedSec}s over ${w.budgetSec}s`);
    const mics = w.items.filter((i) => i.mic).length;
    if (mics > 2) this.fail(plan.day, `${mics} mic sets`);
    if (this.quietToday && mics > 0) this.fail(plan.day, "a mic set planned in Quiet mode");
    const completed = new Set(
      progress.lessons.filter((l) => l.status === "completed").map((l) => l.lessonId as string),
    );
    for (const item of w.items)
      for (const f of [item.familyId, ...item.members]) {
        const fam = course.families.find((x) => x.id === f);
        if (fam && !fam.id.startsWith("fam.mix.") && !completed.has(fam.unlock.lesson))
          this.fail(plan.day, `${f} in the warm-up before ${fam.unlock.lesson}`);
      }
    // Checkpoints open exactly when every lesson they cover is completed (contracts §7.6 rule 3).
    for (const c of progress.checkpoints) {
      const covered = progress.lessons.filter((l) => l.lessonId.startsWith(`${c.cpId.replace(".CP", "")}.L`));
      const allDone = covered.length > 0 && covered.every((l) => l.status === "completed");
      if ((c.status !== "locked") !== allDone)
        this.fail(plan.day, `${c.cpId} is ${c.status} with its lessons ${allDone ? "" : "not "}all done`);
    }
    // L03+ of U02–U05 waits for the previous unit's checkpoint (rule 2).
    for (const [unit, cp] of [
      ["U02", "U01.CP"],
      ["U03", "U02.CP"],
      ["U04", "U03.CP"],
      ["U05", "U04.CP"],
    ] as const) {
      const ok = ["passed", "soft-passed"].includes(
        progress.checkpoints.find((x) => x.cpId === cp)?.status ?? "",
      );
      for (const l of progress.lessons.filter((x) => x.lessonId.startsWith(`${unit}.L`)))
        if (Number(l.lessonId.slice(5)) >= 3 && !ok && l.status !== "locked")
          this.fail(plan.day, `${l.lessonId} ${l.status} before ${cp} passed`);
    }
    // Decision 29 oracle: what Today offers is an offer.
    if (plan.kind === "checkpoint" && plan.mapItemId !== null)
      this.offered.set(plan.mapItemId, dayNo(plan.day));
    // Decision 27 oracle: a family seeded by a lesson is waiting until its first set is planned.
    const planned = new Set<string>(w.items.flatMap((i) => [i.familyId ?? "", ...i.members]));
    // A first review can also come from the lesson itself (a lesson that practises the family in a drill).
    const reviewed = new Set<string>();
    if (this.firstReviewWaits.size > 0) {
      const { cards } = await this.me.api<{ cards: SrsCard[] }>("GET", "/api/drills/families");
      for (const c of cards) if (c.lastReviewAt !== null) reviewed.add(c.cardId);
    }
    const newDay = this.lastPlanDay !== plan.day;
    this.lastPlanDay = plan.day;
    for (const [f, waited] of [...this.firstReviewWaits]) {
      if (planned.has(f) || reviewed.has(f)) {
        this.firstReviewWaits.delete(f);
        this.firstReviewed++;
        if (waited > this.firstReviewMax) {
          this.firstReviewMax = waited;
          this.firstReviewOf = f;
        }
        continue;
      }
      const fam = course.families.find((x) => x.id === f);
      // A sung family is paused in Quiet mode (contracts §8.5): a Quiet day is not a day it could be planned.
      if ((fam?.mic === true && this.quietToday) || !newDay) continue;
      this.firstReviewWaits.set(f, waited + 1);
      if (waited + 1 > 7)
        this.fail(plan.day, `${f} still has no review set ${waited + 1} attended days after its lesson`);
    }
    if (plan.mapItemId !== null) {
      const id = plan.mapItemId as string;
      const st =
        progress.lessons.find((l) => l.lessonId === id)?.status ??
        progress.checkpoints.find((c) => c.cpId === id)?.status ??
        progress.capstones.find((c) => id.startsWith(`${c.capstoneId}.`))?.status;
      if (st === "locked") this.fail(plan.day, `${id} planned while locked`);
    }
  }

  async checkLadder(day: string, atSessionEnd: SessionSummary | null): Promise<void> {
    const v = await this.voice();
    const l = v.ladder;
    const was = this.ladderCents;
    if (l.cents !== was) {
      const changed = l.lastChange;
      if (atSessionEnd === null) this.fail(day, `ladder moved ${was} → ${l.cents} outside a session end`);
      if (changed?.reason !== "evidence")
        this.fail(day, `ladder moved ${was} → ${l.cents} by ${changed?.reason}`);
      if (RUNGS.indexOf(l.cents) !== RUNGS.indexOf(was) + 1)
        this.fail(day, `ladder moved ${was} → ${l.cents}: not one rung finer`);
      if (atSessionEnd !== null && atSessionEnd.toleranceChange?.to !== l.cents)
        this.fail(
          day,
          `ladder moved ${was} → ${l.cents} but the Coda said ${JSON.stringify(atSessionEnd.toleranceChange)}`,
        );
      if (this.pendingBefore !== null) this.fail(day, `ladder moved while ${this.pendingBefore} was pending`);
      for (const [cp, at] of this.offered)
        if (
          !this.passedCps.has(cp) &&
          [...this.sessionDays].filter((x) => x > at && x <= dayNo(day)).length < 14
        )
          this.fail(day, `ladder moved ${was} → ${l.cents} while ${cp} (offered on day ${at}) is not passed`);
      this.tightenings.push(`${day} ${was}→${l.cents}`);
    } else if (atSessionEnd?.toleranceChange) {
      this.fail(day, `the Coda announced ${JSON.stringify(atSessionEnd.toleranceChange)} with no change`);
    }
    this.ladderCents = l.cents;
  }
  pendingBefore: string | null = null;

  /**
   * The one-tap loosen (contracts §8.2, §7.9): offered only after 21 or more days away and only above the
   * loosest rung; it moves exactly one rung looser, is not offered again that day, and a second tap is refused.
   */
  async checkLoosen(day: string): Promise<void> {
    const v = await this.voice();
    const away = this.lastEndedDay === null ? 0 : dayNo(day) - dayNo(this.lastEndedDay) - 1;
    if (v.ladder.offerLoosen && away < 21) this.fail(day, `loosen offered after ${away} days away`);
    if (v.ladder.offerLoosen && v.ladder.cents === 70) this.fail(day, "loosen offered at ±70");
    if (
      !v.ladder.offerLoosen &&
      away >= 22 &&
      v.ladder.cents !== 70 &&
      v.ladder.lastChange?.reason !== "loosen"
    )
      this.fail(day, `no loosen offered after ${away} days away at ±${v.ladder.cents}`);
    if (!v.ladder.offerLoosen) return;
    const was = v.ladder.cents;
    const res = await this.h.json<VoiceState>("PUT", "/api/voice/ladder", { mode: "loosen" });
    if (res.status !== 200) {
      this.fail(day, `loosen ${res.status}`);
      return;
    }
    const l = res.body.ladder;
    if (RUNGS.indexOf(l.cents) !== RUNGS.indexOf(was) - 1 || l.lastChange?.reason !== "loosen")
      this.fail(day, `loosen moved ±${was} → ±${l.cents} (${l.lastChange?.reason})`);
    if (l.offerLoosen) this.fail(day, "loosen still offered after it was taken");
    const twice = await this.h.json("PUT", "/api/voice/ladder", { mode: "loosen" });
    if (twice.status !== 409) this.fail(day, `a second loosen the same day: ${twice.status}`);
    this.loosens.push(`${day} ${was}→${l.cents}`);
    this.ladderCents = l.cents;
  }

  async checkDeferred(dayN: number, day: string): Promise<void> {
    const { cards } = await this.me.api<{ cards: SrsCard[] }>("GET", "/api/drills/families");
    for (const c of cards) {
      if (c.status === "deferred" && c.kind === "family") {
        if (!this.deferredSince.has(c.cardId)) this.deferredSince.set(c.cardId, dayN);
      } else if (this.deferredSince.has(c.cardId)) {
        this.maxDeferredWait = Math.max(
          this.maxDeferredWait,
          dayN - (this.deferredSince.get(c.cardId) as number),
        );
        if (dayN - (this.deferredSince.get(c.cardId) as number) > 14)
          this.longWaits.push(
            `${c.cardId} ${dayN - (this.deferredSince.get(c.cardId) as number)}d (day ${dayN})`,
          );
        this.deferredSince.delete(c.cardId);
      }
    }
    void day;
  }

  async session(plan: SessionPlan): Promise<void> {
    this.kinds.set(plan.kind, (this.kinds.get(plan.kind) ?? 0) + 1);
    this.sessionDays.add(dayNo(plan.day));
    const before = await this.day();
    // Two tabs start today's session at once: one session, the second resumes it (§5.1).
    const body = { kind: plan.kind, mapItemId: plan.mapItemId, targetMinutes: plan.targetMinutes };
    const starts = await Promise.all([
      this.h.json<Session>("POST", "/api/session/start", body),
      this.h.json<Session>("POST", "/api/session/start", { ...body, kind: "studio", mapItemId: null }),
    ]);
    if (starts.some((s) => s.status !== 200)) this.fail(plan.day, `start ${starts.map((s) => s.status)}`);
    const [a, b] = starts.map((s) => s.body);
    if (!a || !b || a.id !== b.id) this.fail(plan.day, `two starts made two sessions ${a?.id} ${b?.id}`);
    const ses = a as Session;
    const open = await this.day();
    if (open.open?.id !== ses.id) this.fail(plan.day, `session.day.open ${open.open?.id} ≠ ${ses.id}`);
    if (open.doneForToday !== before.doneForToday)
      this.fail(plan.day, "starting a session changed the done state");

    for (const item of plan.warmup.items) if (this.r() > 0.1) await this.doItem(ses.id, item);
    const id = plan.mapItemId;
    if (plan.main?.light != null) {
      await this.me.sketch("Light lesson", "lesson-make", plan.main.light.lessonId, ses.id);
    } else if (plan.kind === "lesson" && id !== null) {
      if (!course.lessons.some((l) => l.id === id)) {
        // Past the written course Today must plan a review day, never a lesson with no lesson file.
        this.fail(plan.day, `a lesson day for ${id}, which is not written`);
        this.endOfCourse = true;
      } else {
        await this.me.doLesson(id, ses.id);
        await this.singSteps(id, ses.id, plan.day);
        const done = await this.me.completeLesson(id, ses.id);
        void done;
        for (const f of course.families)
          if (
            f.unlock.lesson === id &&
            f.kind !== "concept" &&
            !f.id.startsWith("fam.mix.") &&
            !this.firstReviewWaits.has(f.id)
          )
            this.firstReviewWaits.set(f.id, 0);
      }
    } else if (plan.kind === "checkpoint" && id !== null) {
      await this.checkpoint(plan, id, ses.id);
    } else if (plan.kind === "capstone" && id !== null) {
      await this.capstone(id, ses.id);
    }
    // Sometimes the tab is closed before the Coda: the session stays open and the next day starts afresh.
    if (plan.kind !== "checkpoint" && this.r() < 0.06) {
      this.abandoned++;
      return;
    }
    const v = await this.voice();
    this.pendingBefore = v.ladder.held?.checkpointId ?? null;
    const summary = await this.me.endSession(ses.id);
    // A repeated end (a second tab's Coda) answers the same summary and never announces twice.
    if (this.r() < 0.3) {
      const again = await this.me.endSession(ses.id);
      if (JSON.stringify(again) !== JSON.stringify(summary))
        this.fail(plan.day, "a repeated end answered differently");
    }
    await this.checkLadder(plan.day, summary);
    this.lastEndedDay = plan.day;
    const after = await this.day();
    if (after.open !== null) this.fail(plan.day, "a session is still open after its end");
    if (plan.kind !== "studio" && !after.doneForToday)
      this.fail(plan.day, `${plan.kind} ended, day not done`);
    if (after.doneForToday && after.summarySessionId === null) this.fail(plan.day, "done with no summary");
  }

  /**
   * The lesson's sing steps, taken with a sung response under an idempotency key, sometimes retried in a row
   * or raced by a second tab (wave3.md §5.2): the notes reach the ladder exactly once, and never in Quiet mode.
   */
  async singSteps(lessonId: string, sessionId: string, day: string): Promise<void> {
    const def = course.lessons.find((l) => l.id === lessonId);
    for (const step of def?.steps ?? []) {
      const ex = step.exercise;
      if (ex === undefined || ex.kind !== "sing") continue;
      if ((ex.tol as { lenient?: boolean } | undefined)?.lenient === true) continue;
      const notesBefore = (await this.voice()).ladder.days.find((x) => x.day === day)?.notes ?? 0;
      const notes = [60, 62, 64, 65, 67, 69, 71, 72].map((m) => this.note(m));
      const body = {
        idempotencyKey: this.key(),
        sessionId,
        exerciseId: ex.id,
        exerciseVersion: ex.version,
        seriesNo: 0,
        params: null,
        response: this.quietToday ? { skipped: true as const } : { sung: notes },
        result: {
          ...gradeResultOf(`${lessonId}/${ex.id}`, 1),
          modality: this.quietToday ? ("fallback" as const) : ("normal" as const),
        },
        extraReplays: 0,
        activeMs: 20_000,
        tutorAssisted: false,
      };
      const path = `/api/lessons/${lessonId}/steps/${step.id}/attempts`;
      const x = this.r();
      const sent =
        x < 0.3
          ? await Promise.all([this.h.json("POST", path, body), this.h.json("POST", path, body)])
          : x < 0.6
            ? [await this.h.json("POST", path, body), await this.h.json("POST", path, body)]
            : [await this.h.json("POST", path, body)];
      if (sent.some((r) => r.status !== 200))
        this.fail(
          day,
          `sing step ${lessonId} ${step.id}: ${sent.map((r) => `${r.status} ${JSON.stringify(r.body)}`)}`,
        );
      if (new Set(sent.map((r) => JSON.stringify(r.body))).size > 1)
        this.fail(day, `sing step ${lessonId} ${step.id}: a retry answered differently`);
      const notesAfter = (await this.voice()).ladder.days.find((x) => x.day === day)?.notes ?? 0;
      const want = this.quietToday ? 0 : notes.length;
      if (notesAfter - notesBefore !== want)
        this.fail(
          day,
          `sing step ${lessonId} ${step.id} sent ${sent.length}× added ${notesAfter - notesBefore} notes, not ${want}`,
        );
      this.sungSteps++;
    }
  }
  sungSteps = 0;

  async checkpoint(plan: SessionPlan, cpId: string, sessionId: string): Promise<void> {
    this.checkpoints++;
    const route = cpId.replace(/\.CP$/, "");
    const start = await this.me.api<{
      attemptNo: number;
      items: { idx: number; role: string; kind?: string }[];
    }>("POST", `/api/checkpoints/${route}/start`);
    const sk = await this.me.sketch(`${cpId} Make`, "checkpoint", cpId, sessionId);
    const g = Math.round(this.p.gating(this.r) * 100) / 100;
    // Level-setting (sung, tapped, heard) items fail or are skipped at random: they must never matter.
    const res = await this.me.api<{ passed: boolean; softPassOffered?: boolean; softPassed?: boolean }>(
      "POST",
      `/api/checkpoints/${route}/attempts`,
      {
        sessionId,
        attemptNo: start.attemptNo,
        items: start.items.map((i) => {
          const lv = i.role !== "gating";
          const skipped = lv && this.r() < 0.4;
          return {
            idx: i.idx,
            score: lv ? (skipped ? 0 : this.r() * 0.3) : g,
            skipped,
            response: { code: "" },
            result: null,
          };
        }),
        makeSketchId: sk.id,
        acceptSoftPass: false,
      },
    );
    if (res.passed !== g >= 0.85)
      this.fail(plan.day, `${cpId} attempt ${start.attemptNo} at gating ${g}: passed=${res.passed}`);
    if (res.passed) this.passedCps.add(cpId);
    // A double-submitted attempt (a second tab, a retried request) is refused and changes nothing.
    if (this.r() < 0.2) {
      const again = await this.h.json("POST", `/api/checkpoints/${route}/attempts`, {
        sessionId,
        attemptNo: start.attemptNo,
        items: start.items.map((i) => ({
          idx: i.idx,
          score: 1,
          skipped: false,
          response: { code: "" },
          result: null,
        })),
        makeSketchId: sk.id,
        acceptSoftPass: true,
      });
      if (again.status !== 409) this.fail(plan.day, `${cpId} attempt submitted twice: ${again.status}`);
      const p = await this.me.api<CourseProgress>("GET", "/api/lessons/progress");
      const st = p.checkpoints.find((c) => c.cpId === cpId)?.status;
      if ((st === "passed" || st === "soft-passed") !== res.passed)
        this.fail(plan.day, `${cpId} is ${st} after a resubmit of a ${res.passed ? "pass" : "fail"}`);
    }
  }

  /** A capstone session: a passing check of the draft, the session recorded, the piece released. */
  async capstone(mapItemId: string, sessionId: string): Promise<void> {
    const capId = mapItemId.replace(/\.S\d+$/, "");
    const cap = course.capstones.find((c) => c.id === capId);
    const sk = await this.me.sketch(`${capId} draft`, "capstone", capId, sessionId);
    const rubric = (
      ((cap?.brief ?? {}) as { rubric?: { id: string; required: boolean }[] }).rubric ?? []
    ).map((r) => ({ ruleId: r.id, required: r.required, ok: true }));
    await this.me.api("POST", `/api/capstones/${capId}/checks`, {
      sessionId,
      sketchId: sk.id,
      sketchVersion: 1,
      result: {
        exerciseId: `${capId}/${cap?.brief?.id}`,
        exerciseVersion: 1,
        attemptNo: 1,
        firstAttempt: true,
        mode: "capstone",
        status: "pass",
        score: 1,
        adjustedScore: 1,
        dims: {},
        constraints: [],
        rubric,
        diagnostics: [],
        messages: [],
        assist: { rung: 0, tutorHints: 0, extraReplays: 0, revealed: false },
      },
    });
    await this.me.api("POST", `/api/capstones/${capId}/sessions`, {
      sessionId,
      capstoneSessionId: mapItemId,
      sketchId: sk.id,
      flavour: null,
    });
    const state = await this.me.api<{ status: string }>("GET", `/api/capstones/${capId}`);
    if (state.status === "released") return;
    await this.h.json("POST", `/api/capstones/${capId}/release`, {
      sessionId,
      sketchId: sk.id,
      sketchVersion: 1,
      title: `${capId} take`,
      flavour: null,
      linerNotesMd: "A take.",
      theoryTags: [],
      includeReviewNote: false,
    });
  }

  async backupRoundTrip(day: string): Promise<void> {
    this.backups++;
    const exported = new Uint8Array(
      await (await this.h.req("GET", "/api/backup/export?audio=0")).arrayBuffer(),
    );
    const fresh = await harness({ dev: true, content: course, now: new Date(this.now).toISOString() });
    try {
      const imp = await fresh.destructive("POST", "/api/backup/import", "backup.import", "*", exported);
      if (imp.status !== 200) {
        this.fail(day, `backup import ${imp.status} ${await imp.text()}`);
        return;
      }
      for (const path of [
        "/api/session/today",
        "/api/srs/due",
        "/api/voice",
        "/api/session/day",
        "/api/lessons/progress",
        "/api/drills/families",
      ]) {
        const a = await this.h.json("GET", path);
        const b = await fresh.json("GET", path);
        if (JSON.stringify(a) !== JSON.stringify(b))
          this.fail(
            day,
            `${path} differs after backup → restore:\n${JSON.stringify(a.body).slice(0, 400)}\n${JSON.stringify(b.body).slice(0, 400)}`,
          );
      }
    } finally {
      await fresh.close();
    }
  }

  async run(): Promise<void> {
    const me = this.me;
    await me.api("PUT", "/api/profile", { timezone: "UTC", inputKind: "builtin" });
    this.setClock(START);
    const first = await me.today();
    const ses = await me.startSession(first);
    const sk = await me.sketch("Sketch 001", "lesson-make", "U00.L01", ses.id);
    await me.api("PUT", "/api/onboarding", { step: "coda", sketchId: sk.id, finished: true });
    await me.endSession(ses.id);
    // Onboarding is the day's session: Today is done (wave3.md §5.1), in this tab and any other.
    const onboarded = await this.day();
    if (!onboarded.doneForToday) this.fail(onboarded.day, "onboarding finished but the day is not done");
    this.lastEndedDay = onboarded.day;
    let base = START;
    let gap = 0;
    for (let d = 1; d < this.p.days; d++) {
      base += DAY;
      let at = base + Math.floor(this.r() * 8) * HOUR - 4 * HOUR;
      if (this.r() < this.p.backwards) at = Math.min(at, this.now) - Math.floor(1 + this.r() * 20) * HOUR;
      this.setClock(Math.max(at, this.now - 20 * HOUR));
      const today = await this.day();
      if (today.open !== null && today.open.day !== today.day)
        this.fail(today.day, `a session left open on ${today.open.day} shows as open today`);
      if (d % this.p.backupEvery === 0) await this.backupRoundTrip(today.day);
      await this.checkDeferred(d, today.day);
      if (d === this.p.forcedGap.at) gap = this.p.forcedGap.days;
      if (gap > 0 || this.r() < this.p.skip) {
        gap = Math.max(0, gap - 1);
        await this.checkLadder(today.day, null);
        continue;
      }
      if (this.r() < this.p.longGap) {
        gap = 3 + Math.floor(this.r() * 25);
        continue;
      }
      await this.checkLoosen(today.day);
      this.quietToday = this.r() < this.p.quiet;
      this.badToday = this.r() < this.p.badDay;
      if (this.quietToday) await me.api("PUT", "/api/voice/quiet", { quiet: true, scope: "today" });
      const plan = await me.today();
      const progress = await me.api<CourseProgress>("GET", "/api/lessons/progress");
      await this.checkPlan(plan, progress);
      const u04 = progress.checkpoints.find((c) => c.cpId === "U04.CP")?.status;
      if (plan.kind === "review" && (u04 === "passed" || u04 === "soft-passed")) this.endOfCourse = true;
      if (this.endOfCourse) {
        // Past the authored course: a review day with the same budget (contracts §7.4).
        const due = await me.api<{ plannedSec: number; budgetSec: number; items: WarmupItem[] }>(
          "GET",
          "/api/srs/due",
        );
        if (due.plannedSec > due.budgetSec + 0.001)
          this.fail(today.day, `review ${due.plannedSec}s over budget`);
      }
      const abandonedBefore = this.abandoned;
      await this.session(plan);
      if (this.abandoned !== abandonedBefore) {
        // Later that day the open session is resumed by a second start, whatever it names.
        const again = await me.api<Session>("POST", "/api/session/start", {
          kind: "review",
          mapItemId: null,
          targetMinutes: 20,
        });
        const sd = await this.day();
        if (sd.day === today.day && sd.open?.id !== again.id)
          this.fail(sd.day, "the abandoned session is not the open one");
        continue;
      }
      // The same learner day, a little later, with the clock stepped back an hour: still done.
      this.setClock(this.now + 2 * HOUR);
      if (this.r() < 0.3) this.setClock(this.now - 3 * HOUR);
      const later = await this.day();
      if (later.day === today.day && !later.doneForToday)
        this.fail(later.day, "the done state was lost later that day");
      // "More practice" after the done state: a new session is allowed and does not undo it.
      if (this.r() < 0.15) {
        const more = await me.api<Session>("POST", "/api/session/start", {
          kind: "review",
          mapItemId: null,
          targetMinutes: 20,
        });
        const sd = await this.day();
        if (sd.open?.id !== more.id) this.fail(sd.day, "More practice did not open its own session");
        if (sd.day === today.day && !sd.doneForToday) this.fail(sd.day, "More practice undid the done state");
        const sum = await me.endSession(more.id);
        await this.checkLadder(sd.day, sum);
      }
    }
  }
}

describe("Wave 3 invariants over hundreds of days, through the HTTP API", () => {
  for (const p of PROFILES)
    test(`${p.name}: ${p.days} days`, async () => {
      const h = await harness({ dev: true, content: course, now: new Date(START).toISOString() });
      const sim = new Sim(h, p);
      try {
        await sim.run();
      } finally {
        await h.close();
      }
      console.log(
        p.name,
        JSON.stringify([...sim.kinds]),
        `checkpoints ${sim.checkpoints}, backups ${sim.backups}, longest deferred wait ${sim.maxDeferredWait} days,`,
        `ladder ${sim.tightenings.join(", ") || "never moved"}; failures ${sim.failures.length}`,
        `abandoned ${sim.abandoned}`,
        `long waits: ${sim.longWaits.join(", ")}`,
        `${sim.sungSteps} sung steps, ${sim.firstReviewed} first reviews, at most ${sim.firstReviewMax} attended days (${sim.firstReviewOf}); loosens ${sim.loosens.join(", ") || "none"}`,
      );
      expect(sim.failures.slice(0, 20)).toEqual([]);
      // The run reached past U04 and past the authored course, met checkpoints and moved the ladder.
      expect(sim.endOfCourse).toBe(true);
      expect(sim.checkpoints).toBeGreaterThan(0);
      // The independent oracles were exercised: families waited for first reviews, a loosen was taken.
      expect(sim.firstReviewed).toBeGreaterThanOrEqual(15);
      expect(sim.sungSteps).toBeGreaterThan(5);
      expect(sim.loosens.length).toBeGreaterThan(0);
    }, 900_000);
});
