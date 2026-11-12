// Sessions: start (START unlocks, capstone state), heartbeat, end (minutes, keep-alive qualification,
// session telemetry, the Coda summary). Today's plan itself comes from the SRS engineer's planner.
import type { Session, SessionDay, SessionSummary, SessionTelemetry } from "@oak/api";
import { STREAK } from "@oak/srs";
import { tx } from "../db/index.ts";
import { conflict, notFound } from "../errors.ts";
import { addDays, dayIndex } from "../lib/days.ts";
import { LearnerTime, newId, type ServiceContext } from "./context.ts";
import type { CourseService } from "./course.ts";
import type { GatesService } from "./gates.ts";
import type { StreakService } from "./streak.ts";
import type { UnlocksService } from "./unlocks.ts";
import type { VoiceService } from "./voice.ts";

export interface SessionsDeps {
  gates: GatesService;
  unlocks: UnlocksService;
  streak: StreakService;
  course: CourseService;
  voice: VoiceService;
  /** Whether the tutor is switched off in Settings (then the Coda never offers a listening note). */
  tutorOff: () => boolean;
}

/** Stored as `sessions.plan_json` at start: the planned warm-up and all review due then. */
export interface SessionStartRecord {
  warmupPlannedSec: number;
  dueSec: number;
  warmupItems: number;
}

export class SessionsService {
  readonly time: LearnerTime;
  constructor(
    private readonly ctx: ServiceContext,
    private readonly d: SessionsDeps,
  ) {
    this.time = new LearnerTime(ctx);
  }

  get(id: string): Session {
    const s = this.ctx.repos.sessions.get(id);
    if (s === null) throw notFound(`session ${id}`);
    return s;
  }

  openToday(): Session | null {
    return this.ctx.repos.sessions.openOn(this.time.day());
  }

  /**
   * `GET /session/day` (wave3.md §5.1): the session open today and those ended today, so Today's done state
   * lives on the server. A session counts for the day its end falls on (one that crossed the 04:00 rollover
   * belongs to the new day, as the app shows it). Done for today: a planned session (any kind but Studio) ended.
   */
  dayState(): SessionDay {
    const day = this.time.day();
    const endedOn = (s: Session) =>
      s.endedAt === null ? null : s.day === day ? day : this.time.day(new Date(s.endedAt));
    const ended = this.ctx.repos.sessions
      .since(addDays(day, -1))
      .filter((s) => endedOn(s) === day)
      .sort((a, b) => (a.endedAt ?? "").localeCompare(b.endedAt ?? ""));
    const planned = ended.filter((s) => s.kind !== "studio");
    return {
      day,
      open: this.openToday(),
      ended,
      doneForToday: planned.length > 0 || this.onboardedOn(day),
      summarySessionId: planned.at(-1)?.id ?? null,
    };
  }

  /**
   * Onboarding is the first day's session (ux §8: its Coda says "Done for today"). It runs outside
   * `session.start` (it is U00.L01, completed by `PUT /onboarding { finished: true }`), so the day it finished
   * on counts as done here; its Coda lives in the onboarding flow, so there is no `summarySessionId` for it.
   */
  onboardedOn(day: string): boolean {
    const at = this.ctx.repos.onboarding.get().finishedAt;
    return at !== null && this.time.day(new Date(at)) === day;
  }

  start(
    body: {
      kind: Session["kind"];
      mapItemId: Session["mapItemId"];
      targetMinutes: Session["targetMinutes"];
    },
    /** What the planner had for today when the session started (session telemetry, contracts §9.7). */
    plan: SessionStartRecord | null = null,
  ): Session {
    return tx(this.ctx.repos.db, () => {
      // One open session per learner day (wave3.md §5.1): a second start (another tab, a double click)
      // resumes the open one, whatever it names. A session ended today does not block a new one.
      const open = this.openToday();
      if (open !== null) return open;
      const id = body.mapItemId;
      if (id !== null && !this.d.gates.sessionOpen(id) && !this.d.gates.sessionDone(id))
        throw conflict(`${id} is not open yet`);
      const session: Session = {
        id: newId("ses"),
        day: this.time.day(),
        kind: body.kind,
        targetMinutes: body.targetMinutes,
        mapItemId: id,
        contentVersion: this.ctx.content.contentVersion,
        startedAt: this.time.iso(),
        endedAt: null,
        activeMinutes: 0,
        phase: "idle",
      };
      this.ctx.repos.sessions.create(session, plan);
      if (id !== null) {
        this.d.unlocks.onStart(id);
        // A checkpoint started from the map was offered too (decision 29: it holds the ladder until passed).
        this.d.voice.recordOffer(id, session.day);
        const m = /^(.+)\.S\d+$/.exec(id);
        const capstone = m === null ? null : this.ctx.content.capstoneMeta(m[1] as string);
        if (capstone !== null) {
          const row = this.ctx.repos.capstones.get(capstone.id);
          const now = session.startedAt;
          this.ctx.repos.capstones.save({
            capstoneId: capstone.id,
            status: row?.status === "released" ? "released" : "in_progress",
            sessions: row?.sessions ?? [],
            sketchId: row?.sketchId ?? null,
            trackId: row?.trackId ?? null,
            flavour: row?.flavour ?? null,
            lastResult: row?.lastResult ?? null,
            startedAt: row?.startedAt ?? now,
            releasedAt: row?.releasedAt ?? null,
            updatedAt: now,
          });
        }
      }
      return session;
    });
  }

  heartbeat(id: string, body: { phase: Session["phase"]; activeMs: number; stepId: string | null }): void {
    const s = this.get(id);
    if (s.endedAt !== null) throw conflict("this session has ended");
    this.ctx.repos.sessions.heartbeat(id, body.phase, body.activeMs / 60_000);
  }

  end(
    id: string,
    body: { wrappedEarly: boolean; phaseMs: { warmup: number; main: number; make: number; coda: number } },
    measured: { dueSecAfter: number; deferredCards: number } | null = null,
  ): SessionSummary {
    const s = this.get(id);
    if (s.endedAt !== null) {
      const stored = this.ctx.repos.sessions.summary(id) as SessionSummary | null;
      if (stored !== null) return stored;
    }
    return tx(this.ctx.repos.db, () => {
      const now = this.time.iso();
      const totalMs = body.phaseMs.warmup + body.phaseMs.main + body.phaseMs.make + body.phaseMs.coda;
      const minutes = Math.max(s.activeMinutes, totalMs / 60_000);
      // Keep-alive qualifies the day at the 2-minute mark or when its set ended (contracts §7.8 c).
      const drills = this.ctx.repos.db
        .query(
          "SELECT COUNT(*) AS n, SUM(trials_total) AS trials FROM drill_sessions WHERE session_id = ? AND finished_at IS NOT NULL",
        )
        .get(id) as { n: number; trials: number | null };
      if (s.kind === "keepalive" && (minutes * 60 >= STREAK.keepAliveSec || drills.n > 0))
        this.d.streak.qualify("keepalive", { day: s.day });
      this.d.streak.addMinutes(minutes, s.day);
      const ended: Session = { ...s, endedAt: now, phase: "done", activeMinutes: minutes };

      const telemetry: SessionTelemetry = {
        sessionId: id,
        day: s.day,
        targetMinutes: s.targetMinutes,
        kind: s.kind,
        warmupMs: body.phaseMs.warmup,
        newMs: body.phaseMs.main,
        makeMs: body.phaseMs.make,
        codaMs: body.phaseMs.coda,
        totalActiveMs: totalMs,
        warmupSets: drills.n,
        warmupPlannedSec: 0,
        dueSecBefore: 0,
        dueSecAfter: measured?.dueSecAfter ?? 0,
        deferredCards: measured?.deferredCards ?? 0,
        overflowSec: 0,
        wrappedEarly: body.wrappedEarly,
        split: this.ctx.repos.lessons.progress(s.mapItemId ?? "")?.splitPart === "A",
      };
      const plan = this.ctx.repos.db.query("SELECT plan_json FROM sessions WHERE id = ?").get(id) as {
        plan_json: string | null;
      };
      if (plan?.plan_json) {
        try {
          const p = JSON.parse(plan.plan_json) as Partial<SessionStartRecord> & {
            warmup?: { plannedSec?: number };
          };
          telemetry.warmupPlannedSec = p.warmupPlannedSec ?? p.warmup?.plannedSec ?? 0;
          telemetry.dueSecBefore = p.dueSec ?? 0;
          // Warm-up overflow (§7.4, §9.7): due review left beyond what the warm-up planned. Invisible to the learner.
          telemetry.overflowSec = Math.max(0, telemetry.dueSecBefore - telemetry.warmupPlannedSec);
        } catch {
          /* a plan that does not parse is left out */
        }
      }
      this.ctx.repos.ops.saveSessionTelemetry(telemetry);

      const firstDay = this.time.firstDay();
      const listening: SessionSummary["listeningNote"] = this.d.tutorOff()
        ? "off"
        : s.kind === "capstone" || dayIndex(s.day) - dayIndex(firstDay) < 7
          ? "auto"
          : "offer";
      const next = this.d.gates.nextMapItem();
      const teaser =
        this.ctx.repos.settings.get("teaserOptIn") && next !== null
          ? { mapItemId: next, title: this.#title(next) }
          : null;
      // The sing-tolerance ladder moves only between sessions and is announced once, here (contracts §8.2).
      this.d.voice.evaluate();
      const toleranceChange = this.d.voice.announce();
      const summary: SessionSummary = {
        session: ended,
        streak: this.d.streak.summary(),
        sketchesSaved: this.ctx.repos.sketches.savedSince(s.startedAt),
        canDo: this.ctx.repos.cando.since(s.startedAt),
        unlocks: this.ctx.repos.unlocks.since(s.startedAt),
        toleranceChange,
        listeningNote: listening,
        teaser,
      };
      this.ctx.repos.sessions.end(id, now, minutes, summary);
      return summary;
    });
  }

  /** The Coda after a reload (wave2 §4 `session.summary`): the summary `end` stored. */
  summary(id: string): SessionSummary {
    const s = this.get(id);
    if (s.endedAt === null) throw conflict("this session has not ended yet");
    const stored = this.ctx.repos.sessions.summary(id) as SessionSummary | null;
    if (stored === null) throw notFound(`summary of session ${id}`);
    return stored;
  }

  #title(id: string): string {
    return (
      this.ctx.content.lessonDef(id)?.title ??
      this.ctx.content.lessonSite(id)?.meta.title ??
      this.ctx.content.checkpointMeta(id)?.title ??
      this.ctx.content.capstoneMeta(id.replace(/\.S\d+$/, ""))?.title ??
      id
    );
  }
}
