// session.*, lessons, steps, checkpoints, capstones, gym, terms.
import { checkpointFromRouteParam, isCheckpointId } from "@oak/content-kit";
import type { AppDeps } from "../deps.ts";
import { ApiError } from "../errors.ts";
import { idempotent } from "../idempotency.ts";
import type { SessionStartRecord } from "../services/sessions.ts";
import { voicingGate } from "../services/voicing-gate.ts";
import type { Mounter } from "./define.ts";

/** `U07` (core route parameter) or the full ID (`U07.CP`, `J.CP1`). */
function checkpointId(param: string): string {
  if (isCheckpointId(param)) return param;
  return checkpointFromRouteParam(param) ?? param;
}

/** All review due now, in seconds: the planner's estimate with no budget limit. */
async function dueSecNow(d: AppDeps): Promise<number> {
  const srs = d.srs();
  if (srs === null) return 0;
  return (await srs.due({ budgetSec: 86_400, more: false })).plannedSec;
}

/** Session telemetry at start (contracts §9.7): today's planned warm-up and the review due before it. */
async function startRecord(d: AppDeps, targetMinutes: 15 | 20 | 25): Promise<SessionStartRecord | null> {
  try {
    const planner = d.planner();
    const plan = planner === null ? null : await planner.today({ targetMinutes });
    return {
      warmupPlannedSec: plan?.warmup.plannedSec ?? 0,
      warmupItems: plan?.warmup.items.length ?? 0,
      dueSec: await dueSecNow(d),
    };
  } catch (e) {
    d.log(`session telemetry at start: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

async function endMeasures(d: AppDeps): Promise<{ dueSecAfter: number; deferredCards: number } | null> {
  try {
    const deferred = d.repos.db
      .query("SELECT COUNT(*) AS n FROM srs_cards WHERE status = 'deferred'")
      .get() as {
      n: number;
    };
    return { dueSecAfter: await dueSecNow(d), deferredCards: deferred.n };
  } catch (e) {
    d.log(`session telemetry at end: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

export function courseRoutes(mount: Mounter, d: AppDeps): void {
  const s = d.services;

  mount("session.today", async ({ query }) => {
    const planner = d.planner();
    if (planner === null) throw new ApiError("unavailable", "the session planner is not available yet");
    const target =
      query.targetMinutes === undefined
        ? d.repos.profile.get().targetMinutes
        : (Number(query.targetMinutes) as 15 | 20 | 25);
    return planner.today({ targetMinutes: target });
  });
  mount("session.start", async ({ body }) =>
    s.sessions.start(body, await startRecord(d, body.targetMinutes)),
  );
  mount("session.heartbeat", ({ params, body }) => {
    s.sessions.heartbeat(params.id, body);
    return { ok: true as const };
  });
  mount("session.end", async ({ params, body }) => s.sessions.end(params.id, body, await endMeasures(d)));

  mount("lessons.progress", () => s.gates.courseProgress());
  mount("steps.state", ({ params }) => s.course.stepState(params.id, params.stepId));
  // Wave 3 (wave3.md §5.2): a retried or double-submitted attempt with the same key counts once.
  mount("steps.attempt", ({ params, body }) => {
    const { idempotencyKey, ...rest } = body;
    return idempotent(
      d,
      "steps.attempt",
      idempotencyKey,
      { lessonId: params.id, stepId: params.stepId, body: rest },
      () => s.course.attempt(params.id, params.stepId, rest),
    );
  });
  mount("steps.hint", ({ params, body }) => s.course.hint(params.id, params.stepId, { reveal: body.reveal }));
  mount("steps.newSeries", ({ params }) => s.course.newSeries(params.id, params.stepId));
  mount("lessons.complete", ({ params, body }) => s.course.complete(params.id, body));

  mount("checkpoints.start", ({ params }) => s.course.checkpointStart(checkpointId(params.cpId)));
  mount("checkpoints.attempt", ({ params, body }) =>
    s.course.checkpointSubmit(checkpointId(params.cpId), body),
  );

  mount("capstones.get", ({ params }) => s.course.capstoneState(params.id));
  mount("capstones.check", ({ params, body }) => s.course.capstoneCheck(params.id, body));
  mount("capstones.completeSession", ({ params, body }) => s.course.capstoneCompleteSession(params.id, body));

  mount("gym.start", ({ body }) => s.gym.start(body));
  mount("terms.introduced", () => ({ items: d.repos.terms.list() }));

  // Wave 2 (docs/design/wave2.md §4).
  mount("session.summary", ({ params }) => s.sessions.summary(params.id));
  mount("lessons.steps", ({ params }) => s.course.lessonSteps(params.id));
  mount("lessons.position", ({ params, body }) => s.course.position(params.id, body));
  mount("capstones.release", ({ params, body }) => s.release.release(params.id, body));

  // Wave 3 (docs/design/wave3.md §5.1): today's sessions on the server, Today's done state.
  mount("session.day", () => s.sessions.dayState());

  // Wave 4 (docs/design/wave4.md §5.1, §5.5, §5.6): multi-session capstones, the gym plan, the voicing gate.
  mount("capstones.sessions", ({ params }) => s.capstoneSessions.sessions(params.id));
  mount("capstones.saveDraft", ({ params, body }) => s.capstoneSessions.saveDraft(params.id, body));
  // A retried or double-submitted check with the same key counts once (wave3.md §5.2).
  mount("capstones.recordCheck", ({ params, body }) => {
    const { idempotencyKey, ...rest } = body;
    return idempotent(
      d,
      "capstones.recordCheck",
      idempotencyKey,
      { capstoneId: params.id, checkId: params.checkId, body: rest },
      () => s.capstoneSessions.recordCheck(params.id, params.checkId, { ...rest }),
    );
  });
  mount("capstones.gate", ({ params }) => s.capstoneSessions.gate(params.id));
  mount("gym.plan", () => s.gym.plan());
  mount("gates.voicing", () => voicingGate(s.unlocks));

  // Wave 5 (docs/design/wave5.md §5.1): the optional side lessons A1.L01–L04 and the one Today would offer next.
  mount("sideLessons.list", () => s.sideLessons.list());
}
