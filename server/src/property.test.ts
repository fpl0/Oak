// Property and scenario tests over hundreds of simulated days, ONLY through the HTTP API, with randomised
// learners: perfect, struggling, erratic, long gaps, binge days, time-zone changes (DST zones included) and
// a clock that steps backwards. After every day the invariants of contracts §7.4–§7.10 and §9 are checked
// against what the API answers: the streak never lies, no warm-up is over its budget, nothing is scheduled
// before it opens, checkpoints and capstones open exactly per §7.6, and mastery never drops without
// evidence. Writes are retried and raced as two tabs would.
import { beforeAll, describe, expect, test } from "bun:test";
import type {
  CapstoneReleaseResult,
  CourseProgress,
  DueBatch,
  FamilyState,
  SessionPlan,
  SessionSummary,
  SkillMap,
  SrsCard,
  StreakSummary,
  StreakWeek,
  Unlock,
  VoiceState,
} from "@oak/api";
import { MASTERY_LEVELS } from "@oak/api";
import type { ContentSource } from "./content/types.ts";
import { realCourse } from "./testing/course.ts";
import { type Harness, harness } from "./testing/harness.ts";
import { rng, SimLearner } from "./testing/learner.ts";

let course: ContentSource;
beforeAll(async () => {
  course = await realCourse();
});

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const START = Date.parse("2026-10-19T17:00:00.000Z"); // a Monday, so DST ends inside the run in EU and US
const ZONES = [
  "UTC",
  "Europe/Lisbon",
  "America/New_York",
  "America/Los_Angeles",
  "Australia/Lord_Howe", // a 30-minute DST shift
  "Asia/Kathmandu", // a +05:45 offset
  "Pacific/Chatham", // +12:45/+13:45
  "America/Santiago", // DST changes at midnight
];
const MET = new Set<StreakWeek["status"]>(["met", "met-banked", "met-repaired"]);
const rank = (l: SkillMap["nodes"][number]["level"]) => MASTERY_LEVELS.indexOf(l);

interface Profile {
  name: string;
  seed: number;
  days: number;
  /** Probability of skipping a day; long gaps are drawn separately. */
  skip: number;
  /** Probability of a 3–25-day gap starting on a day. */
  longGap: number;
  /** Probability of a second (and third) session on a day. */
  binge: number;
  meanCredit: number;
  /** Lesson step score on a first attempt: perfect learners pass, strugglers often fail first. */
  failFirst: number;
  /** Checkpoint gating score. */
  gating: (r: () => number) => number;
  tzChange: number;
  /** Probability that the clock steps back some hours before the day's session. */
  backwards: number;
  /** Probability that a write is sent twice (a retry) or raced (two tabs). */
  dupes: number;
}

function profiles(): Profile[] {
  return [
    {
      name: "perfect",
      seed: 1,
      days: 120,
      skip: 0.05,
      longGap: 0,
      binge: 0,
      meanCredit: 0.98,
      failFirst: 0,
      gating: () => 1,
      tzChange: 0,
      backwards: 0,
      dupes: 0.2,
    },
    {
      name: "struggling",
      seed: 2,
      days: 120,
      skip: 0.25,
      longGap: 0.02,
      binge: 0,
      meanCredit: 0.6,
      failFirst: 0.6,
      gating: (r) => 0.55 + r() * 0.35,
      tzChange: 0,
      backwards: 0,
      dupes: 0.2,
    },
    {
      name: "erratic",
      seed: 3,
      days: 160,
      skip: 0.35,
      longGap: 0.04,
      binge: 0.2,
      meanCredit: 0.8,
      failFirst: 0.3,
      gating: (r) => r(),
      tzChange: 0.08,
      backwards: 0.1,
      dupes: 0.3,
    },
    {
      name: "binge-and-gaps",
      seed: 4,
      days: 200,
      skip: 0.1,
      longGap: 0.05,
      binge: 0.4,
      meanCredit: 0.85,
      failFirst: 0.2,
      gating: (r) => 0.7 + r() * 0.3,
      tzChange: 0.05,
      backwards: 0.15,
      dupes: 0.3,
    },
    {
      name: "binge-and-gaps-2",
      seed: 7,
      days: 200,
      skip: 0.1,
      longGap: 0.05,
      binge: 0.4,
      meanCredit: 0.85,
      failFirst: 0.2,
      gating: (r) => 0.7 + r() * 0.3,
      tzChange: 0.05,
      backwards: 0.15,
      dupes: 0.3,
    },
    {
      name: "tz-hopper",
      seed: 8,
      days: 200,
      skip: 0.1,
      longGap: 0.05,
      binge: 0.4,
      meanCredit: 0.85,
      failFirst: 0.2,
      gating: (r) => 0.7 + r() * 0.3,
      tzChange: 0.4,
      backwards: 0.35,
      dupes: 0.3,
    },
    {
      name: "erratic-2",
      seed: 5,
      days: 160,
      skip: 0.35,
      longGap: 0.04,
      binge: 0.2,
      meanCredit: 0.8,
      failFirst: 0.3,
      gating: (r) => r(),
      tzChange: 0.08,
      backwards: 0.1,
      dupes: 0.3,
    },
    {
      name: "erratic-3",
      seed: 6,
      days: 160,
      skip: 0.35,
      longGap: 0.04,
      binge: 0.2,
      meanCredit: 0.8,
      failFirst: 0.3,
      gating: (r) => r(),
      tzChange: 0.08,
      backwards: 0.1,
      dupes: 0.3,
    },
  ];
}

class Sim {
  readonly me: SimLearner;
  readonly r: () => number;
  /** Highest values seen so far: these never go down. */
  longest = 0;
  totalDays = 0;
  /** Closed weeks seen met: they stay met. */
  readonly metWeeks = new Set<string>();
  levels = new Map<string, number>();
  readonly failures: string[] = [];
  readonly kinds = new Map<string, number>();
  zone = "UTC";
  now: number;
  keys = 0;
  /**
   * The learner day Quiet mode was switched on for (the mic chip, scope "today"), or `null`. The choice lapses at
   * the next learner day (wave3.md §5.3): a binge session an hour later can fall on the next day (a time-zone hop
   * or the rollover), where Quiet is off again and mic sets are lawful.
   */
  quietDay: string | null = null;
  /** The plan reached a lesson the test course does not have (past the stand-ins). */
  endOfCourse = false;
  prevWeeks: StreakWeek[] = [];

  constructor(
    readonly h: Harness,
    readonly p: Profile,
  ) {
    this.me = new SimLearner(h, course, p.seed);
    this.me.meanCredit = p.meanCredit;
    this.r = rng(p.seed * 7919);
    this.now = START;
  }

  fail(day: string, what: string): void {
    this.failures.push(`[${this.p.name} ${day}] ${what}`);
  }

  setClock(ms: number): void {
    this.now = ms;
    this.h.clock.set(new Date(ms).toISOString());
  }

  /** Sends a write once, twice in a row (a retry), or twice at once (two tabs). */
  async write<T>(method: string, path: string, body?: unknown): Promise<{ status: number; body: T }[]> {
    const x = this.r();
    if (x < this.p.dupes / 2) {
      const a = await this.h.json<T>(method, path, body);
      const b = await this.h.json<T>(method, path, body);
      return [a, b];
    }
    if (x < this.p.dupes)
      return Promise.all([this.h.json<T>(method, path, body), this.h.json<T>(method, path, body)]);
    return [await this.h.json<T>(method, path, body)];
  }

  async checkStreak(day: string, s: StreakSummary): Promise<void> {
    if (s.longestWeeks < this.longest) {
      this.fail(day, `longest run fell ${this.longest} → ${s.longestWeeks}`);
      if (process.env.OAK_SIM_DEBUG)
        console.log(
          day,
          this.zone,
          new Date(this.now).toISOString(),
          JSON.stringify(this.prevWeeks),
          JSON.stringify((await this.me.api<{ weeks: StreakWeek[] }>("GET", "/api/streak?weeks=104")).weeks),
        );
    }
    if (s.totalDays < this.totalDays) this.fail(day, `total days fell ${this.totalDays} → ${s.totalDays}`);
    if (s.weeks > s.longestWeeks) this.fail(day, `current run ${s.weeks} > longest ${s.longestWeeks}`);
    if (s.bankedRests < 0 || s.bankedRests > 2) this.fail(day, `bank ${s.bankedRests}`);
    const q = s.thisWeek.days.filter((d) => d.qualified).length;
    if (q !== s.thisWeek.qualifyingDays)
      this.fail(day, `this week counts ${s.thisWeek.qualifyingDays}, days say ${q}`);
    this.longest = Math.max(this.longest, s.longestWeeks);
    this.totalDays = Math.max(this.totalDays, s.totalDays);
    const hist = await this.me.api<{ weeks: StreakWeek[] }>("GET", "/api/streak?weeks=104");
    this.prevWeeks = hist.weeks;
    for (const w of hist.weeks.slice(0, -1)) {
      if (MET.has(w.status)) this.metWeeks.add(w.weekStart);
      else if (this.metWeeks.has(w.weekStart)) this.fail(day, `week ${w.weekStart} was met, now ${w.status}`);
    }
  }

  async checkPlan(plan: SessionPlan, progress: CourseProgress): Promise<void> {
    const w = plan.warmup;
    if (w.plannedSec > w.budgetSec + 0.001)
      this.fail(plan.day, `warm-up ${w.plannedSec}s over ${w.budgetSec}s`);
    const short = plan.kind === "checkpoint" || plan.kind === "capstone";
    // Wave 4: a gym day's warm-up is 4 minutes at every target (contracts §9.1).
    const budget =
      plan.kind === "gym" ? 240 : short ? 180 : { 15: 240, 20: 300, 25: 360 }[plan.targetMinutes];
    if (w.budgetSec !== budget) this.fail(plan.day, `budget ${w.budgetSec} for a ${plan.kind} day`);
    if (w.items.filter((i) => i.mic).length > 2) this.fail(plan.day, "more than 2 mic sets");
    // Nothing is scheduled before it opens.
    const id = plan.mapItemId;
    if (id !== null) {
      const l = progress.lessons.find((x) => x.lessonId === id);
      const c = progress.checkpoints.find((x) => x.cpId === id);
      const cap = progress.capstones.find((x) => id.startsWith(`${x.capstoneId}.`));
      const gym =
        /^GYM\.\d{2}$/.test(id) &&
        progress.lessons.some((x) => x.lessonId === "U07.L01" && x.status === "completed");
      const status = gym ? "open" : (l?.status ?? c?.status ?? cap?.status ?? "unknown");
      if (status === "locked" || status === "unknown") this.fail(plan.day, `${id} planned while ${status}`);
    }
    const { cards, families } = await this.me.api<{ cards: SrsCard[]; families: FamilyState[] }>(
      "GET",
      "/api/drills/families",
    );
    const live = new Map(cards.map((c) => [c.cardId as string, c.status]));
    const completed = new Set(
      progress.lessons.filter((l) => l.status === "completed").map((l) => l.lessonId as string),
    );
    for (const item of w.items)
      for (const f of [item.familyId, ...item.members, ...item.cardIds]) {
        if (f === null) continue;
        if (!live.has(f)) this.fail(plan.day, `warm-up item ${f} has no card (never seeded)`);
        // Nothing is scheduled before it is unlocked: a family after its lesson, a deck card after its gate.
        const fam = course.families.find((x) => x.id === f);
        const gate =
          fam !== undefined
            ? fam.id.startsWith("fam.mix.")
              ? null
              : fam.unlock.lesson
            : (() => {
                const deck = course.decks.find((d) => d.cards.some((c) => c.id === f));
                const card = deck?.cards.find((c) => c.id === f);
                return deck === undefined ? null : (card?.gate ?? deck.unlock.lesson);
              })();
        if (gate !== null && !completed.has(gate)) this.fail(plan.day, `warm-up item ${f} before ${gate}`);
      }
    // ... and never above the level its gates open (contracts §7.3).
    for (const item of w.items) {
      if (item.familyId === null || item.level === null) continue;
      const st = families.find((x) => x.familyId === item.familyId);
      if (st !== undefined && item.level > st.maxOpenLevel)
        this.fail(plan.day, `${item.familyId} planned at level ${item.level} > open ${st.maxOpenLevel}`);
    }
    // Quiet mode (contracts §8.5): no mic set is planned.
    if (this.quietDay === plan.day && w.items.some((i) => i.mic))
      this.fail(plan.day, "a mic set planned in Quiet mode");
    // §7.6: L03+ of a unit waits for the previous checkpoint; a checkpoint needs its unit's lessons.
    for (const [unit, cp] of [
      ["U02", "U01.CP"],
      ["U03", "U02.CP"],
    ] as const) {
      const passed = ["passed", "soft-passed"].includes(
        progress.checkpoints.find((x) => x.cpId === cp)?.status ?? "",
      );
      for (const l of progress.lessons.filter((x) => x.lessonId.startsWith(`${unit}.L`)))
        if (Number(l.lessonId.slice(5)) >= 3 && !passed && l.status !== "locked")
          this.fail(plan.day, `${l.lessonId} is ${l.status} before ${cp} is passed`);
    }
    for (const c of progress.checkpoints) {
      if (c.status === "locked") continue;
      const unit = c.cpId.replace(".CP", "");
      for (const l of progress.lessons.filter((x) => x.lessonId.startsWith(`${unit}.L`)))
        if (l.status !== "completed")
          this.fail(plan.day, `${c.cpId} is ${c.status} with ${l.lessonId} ${l.status}`);
    }
  }

  async checkMastery(day: string, active: boolean): Promise<void> {
    const map = await this.me.api<SkillMap>("GET", "/api/skills/map");
    const next = new Map(map.nodes.map((n) => [n.skillId as string, rank(n.level)]));
    if (!active)
      for (const [id, lv] of this.levels) {
        const now = next.get(id) ?? 0;
        if (now < lv)
          this.fail(day, `${id} fell from ${MASTERY_LEVELS[lv]} to ${MASTERY_LEVELS[now]} with no evidence`);
      }
    this.levels = next;
  }

  async capstone(plan: SessionPlan, sessionId: string): Promise<void> {
    const capId = (plan.mapItemId as string).replace(/\.S\d+$/, "");
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
      capstoneSessionId: plan.mapItemId,
      sketchId: sk.id,
      flavour: null,
    });
    const state = await this.me.api<{ status: string; sessions: string[]; releasable?: boolean }>(
      "GET",
      `/api/capstones/${capId}`,
    );
    if (state.status === "released") return;
    const rel = await this.write<CapstoneReleaseResult>("POST", `/api/capstones/${capId}/release`, {
      sessionId,
      sketchId: sk.id,
      sketchVersion: 1,
      title: `${capId} take`,
      flavour: null,
      linerNotesMd: "A take.",
      theoryTags: [],
      includeReviewNote: false,
    });
    const ok = rel.filter((x) => x.status === 200);
    if (ok.length === 0 && rel.some((x) => x.status !== 409))
      this.fail(plan.day, `release ${capId}: ${JSON.stringify(rel.map((x) => [x.status, x.body]))}`);
    // A retried or raced release is one album version, not two.
    for (const r of ok)
      if (r.body.track.currentVersion !== 1)
        this.fail(plan.day, `release ${capId} made version ${r.body.track.currentVersion}`);
  }

  async session(plan: SessionPlan): Promise<void> {
    this.kinds.set(plan.kind, (this.kinds.get(plan.kind) ?? 0) + 1);
    const ses = await this.me.startSession(plan);
    for (const item of plan.warmup.items) {
      if (this.r() < 0.1) continue; // a skipped set stays due without penalty
      await this.me.doItem(ses.id, item);
    }
    const id = plan.mapItemId;
    if (plan.main?.light != null) {
      await this.me.sketch("Light lesson", "lesson-make", plan.main.light.lessonId, ses.id);
    } else if (plan.kind === "lesson" && id !== null) {
      if (!course.lessons.some((l) => l.id === id)) {
        this.endOfCourse = true;
        return;
      }
      const def = this.me.lesson(id);
      for (const step of def.steps) {
        const ex = step.exercise;
        if (ex === undefined) continue;
        if (this.r() < this.p.failFirst) {
          await this.me.attempt(id, step.id, ex.id, 0.3 + this.r() * 0.4, ses.id, ex.version);
          if (ex.hints !== null)
            await this.me.api("POST", `/api/lessons/${id}/steps/${step.id}/hints`, { reveal: false });
        }
        const pass = {
          sessionId: ses.id,
          exerciseId: ex.id,
          exerciseVersion: ex.version,
          seriesNo: 0,
          params: null,
          response: { code: "x" },
          result: {
            exerciseId: `${id}/${ex.id}`,
            exerciseVersion: ex.version,
            attemptNo: 1,
            firstAttempt: true,
            mode: "lesson",
            status: "pass",
            score: 0.95,
            adjustedScore: 0.95,
            dims: {},
            constraints: [],
            diagnostics: [],
            messages: [],
            assist: { rung: 0, tutorHints: 0, extraReplays: 0, revealed: false },
          },
          extraReplays: 0,
          activeMs: 10_000,
          tutorAssisted: false,
        };
        // One learner action, one key (wave3.md §5.2): a retry or a second tab counts once.
        const stepPath = `/api/lessons/${id}/steps/${step.id}`;
        const a0 = (await this.me.api<{ attempts: number }>("GET", stepPath)).attempts;
        const sent = await this.write("POST", `${stepPath}/attempts`, {
          ...pass,
          idempotencyKey: `${this.p.name}-${id}-${step.id}-${this.keys++}`.replace(/[^A-Za-z0-9_-]/g, "_"),
        });
        for (const r of sent)
          if (r.status !== 200) this.fail(plan.day, `attempt ${id}/${step.id}: ${r.status}`);
        const a1 = (await this.me.api<{ attempts: number }>("GET", stepPath)).attempts;
        if (a1 !== a0 + 1)
          this.fail(plan.day, `attempt ${id}/${step.id} sent ${sent.length}× counted ${a1 - a0}×`);
      }
      const sk = await this.me.sketch(`${def.title} Make`, "lesson-make", id, ses.id);
      const done = await this.write<{ unlocks: Unlock[] }>("POST", `/api/lessons/${id}/complete`, {
        sessionId: ses.id,
        sketchId: sk.id,
        lessonVersion: def.version,
        contentHash: `h${def.version}`,
        splitPart: null,
      });
      for (const d of done)
        if (d.status !== 200) this.fail(plan.day, `complete ${id}: ${d.status} ${JSON.stringify(d.body)}`);
    } else if (plan.kind === "checkpoint" && id !== null) {
      const route = id.replace(/\.CP$/, "");
      const start = await this.me.api<{ attemptNo: number; items: { idx: number; role: string }[] }>(
        "POST",
        `/api/checkpoints/${route}/start`,
      );
      const sk = await this.me.sketch(`${id} Make`, "checkpoint", id, ses.id);
      const g = this.p.gating(this.r);
      const res = await this.write<{ passed: boolean }>("POST", `/api/checkpoints/${route}/attempts`, {
        sessionId: ses.id,
        attemptNo: start.attemptNo,
        items: start.items.map((i) => ({
          idx: i.idx,
          score: i.role === "gating" ? g : this.r(),
          skipped: false,
          response: { code: "" },
          result: null,
        })),
        makeSketchId: sk.id,
        acceptSoftPass: this.r() < 0.7,
      });
      const ok = res.filter((x) => x.status === 200).length;
      if (ok !== 1)
        this.fail(plan.day, `checkpoint submit accepted ${ok} times: ${res.map((x) => x.status)}`);
      for (const x of res)
        if (x.status !== 200 && x.status !== 409) this.fail(plan.day, `checkpoint submit ${x.status}`);
    } else if (plan.kind === "capstone" && id !== null) {
      await this.capstone(plan, ses.id);
    } else if (plan.kind === "gym" && id !== null) {
      // Wave 4: the transcription slot (contracts §2.5) takes its ordinal and a ladder item.
      await this.me.gymDay(ses.id, { note: plan.note });
    }
    const ends = await this.write<SessionSummary>("POST", `/api/session/${ses.id}/end`, {
      wrappedEarly: false,
      phaseMs: { warmup: 240_000, main: 540_000, make: 240_000, coda: 60_000 },
    });
    const bodies = ends.filter((e) => e.status === 200).map((e) => JSON.stringify(e.body));
    if (bodies.length !== ends.length) this.fail(plan.day, `session end ${ends.map((e) => e.status)}`);
    if (new Set(bodies).size > 1) this.fail(plan.day, "a repeated session end answered a different summary");
  }

  async run(): Promise<void> {
    const me = this.me;
    // A learner whose mic works (onboarding's mic step); some days they switch Quiet mode on for the day.
    await me.api("PUT", "/api/profile", { timezone: "UTC", inputKind: "builtin" });
    // Day 1: onboarding is U00.L01.
    this.setClock(START);
    const first = await me.today();
    const ses = await me.startSession(first);
    const sk = await me.sketch("Sketch 001", "lesson-make", "U00.L01", ses.id);
    await me.api("PUT", "/api/onboarding", { step: "coda", sketchId: sk.id, finished: true });
    await me.endSession(ses.id);
    let base = START;
    let gap = 0;
    for (let d = 1; d < this.p.days; d++) {
      base += DAY;
      if (this.r() < this.p.tzChange) {
        this.zone = ZONES[Math.floor(this.r() * ZONES.length)] as string;
        await me.api("PUT", "/api/profile", { timezone: this.zone });
      }
      // A random local hour; sometimes the clock steps back some hours (NTP, a zone change, a dev move).
      let at = base + Math.floor(this.r() * 10) * HOUR - 6 * HOUR;
      if (this.r() < this.p.backwards) at = Math.min(at, this.now) - Math.floor(1 + this.r() * 30) * HOUR;
      this.setClock(at);
      if (gap > 0) {
        gap -= 1;
        await this.idleDay();
        continue;
      }
      if (this.r() < this.p.longGap) {
        gap = 3 + Math.floor(this.r() * 22);
        await this.idleDay();
        continue;
      }
      if (this.r() < this.p.skip) {
        await this.idleDay();
        continue;
      }
      await this.activeDay();
    }
  }

  lastDay = "";
  async idleDay(): Promise<void> {
    const s = await this.me.api<{ streak: StreakSummary; day: string }>("GET", "/api/bootstrap");
    this.lastDay = s.day;
    await this.checkStreak(s.day, s.streak);
    await this.checkMastery(s.day, false);
  }

  /** Past the test course: a reviews-only day (contracts §7.4: the same budget, then "a little more"). */
  async reviewDay(): Promise<void> {
    const due = await this.me.api<DueBatch>("GET", "/api/srs/due");
    const day = (await this.me.api<{ day: string }>("GET", "/api/bootstrap")).day;
    if (due.plannedSec > due.budgetSec + 0.001)
      this.fail(day, `review ${due.plannedSec}s over ${due.budgetSec}s`);
    const ses = await this.me.api<{ id: string }>("POST", "/api/session/start", {
      kind: "review",
      mapItemId: null,
      targetMinutes: 20,
    });
    for (const item of due.items) await this.me.doItem(ses.id, item);
    let total = due.plannedSec;
    for (let i = 0; i < 4; i++) {
      const more = await this.me.api<DueBatch>("GET", "/api/srs/due?more=1");
      if (more.items.length === 0) break;
      total += more.plannedSec;
      for (const item of more.items) await this.me.doItem(ses.id, item);
    }
    if (total > 720 + 0.001) this.fail(day, `a reviews-only day planned ${total}s (cap 720)`);
    await this.me.endSession(ses.id);
  }

  async activeDay(): Promise<void> {
    if (this.endOfCourse) {
      await this.reviewDay();
      const s = await this.me.api<{ streak: StreakSummary; day: string }>("GET", "/api/bootstrap");
      await this.checkStreak(s.day, s.streak);
      await this.checkMastery(s.day, true);
      return;
    }
    let sessions = 1;
    while (this.r() < this.p.binge && sessions < 3) sessions += 1;
    if (this.r() < 0.1) {
      const v = await this.me.api<VoiceState>("PUT", "/api/voice/quiet", { quiet: true, scope: "today" });
      this.quietDay = v.day;
    }
    for (let i = 0; i < sessions; i++) {
      // The server holds Quiet for exactly the learner day it was chosen for, and drops it at the boundary.
      const voice = await this.me.api<VoiceState>("GET", "/api/voice");
      const expectQuiet = this.quietDay === voice.day;
      if (voice.quiet !== expectQuiet || (expectQuiet && voice.quietReason !== "today"))
        this.fail(voice.day, `Quiet is ${voice.quiet} (${voice.quietReason}); chosen for ${this.quietDay}`);
      const plan = await this.me.today();
      if (plan.day !== voice.day) this.fail(plan.day, `the plan's day differs from voice.get's ${voice.day}`);
      const progress = await this.me.api<CourseProgress>("GET", "/api/lessons/progress");
      await this.checkPlan(plan, progress);
      await this.session(plan);
      if (this.endOfCourse) return;
      this.setClock(this.now + HOUR);
    }
    const s = await this.me.api<{ streak: StreakSummary; day: string }>("GET", "/api/bootstrap");
    await this.checkStreak(s.day, s.streak);
    await this.checkMastery(s.day, true);
    // No duplicate unlock rows, ever.
    const unlocks = (await this.me.api<{ items: Unlock[] }>("GET", "/api/unlocks")).items;
    const ids = unlocks.map((u) => u.itemId);
    if (new Set(ids).size !== ids.length) this.fail(s.day, "duplicate unlock rows");
  }
}

/** `OAK_SIM_SWEEP=<n>` adds n more seeds of the harshest profile (time zones, clock steps, binges, gaps). */
function sweep(): Profile[] {
  const n = Number(process.env.OAK_SIM_SWEEP ?? 0);
  const hopper = profiles().find((p) => p.name === "tz-hopper") as Profile;
  const base = Number(process.env.OAK_SIM_SWEEP_BASE ?? 100);
  return Array.from({ length: n }, (_, i) => ({ ...hopper, name: `sweep-${base + i}`, seed: base + i }));
}

describe("randomised learners over months, through the HTTP API", () => {
  for (const p of [...profiles(), ...sweep()])
    test(`${p.name}: ${p.days} days`, async () => {
      const h = await harness({ dev: true, content: course, now: new Date(START).toISOString() });
      const sim = new Sim(h, p);
      try {
        await sim.run();
      } finally {
        await h.close();
      }
      console.log(p.name, sim.lastDay, JSON.stringify([...sim.kinds]), "failures:", sim.failures.length);
      expect(sim.failures.slice(0, 25)).toEqual([]);
    }, 600_000);
});
