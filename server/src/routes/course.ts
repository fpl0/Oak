// session.*, lessons, steps, checkpoints, capstones, gym, terms.
import { checkpointFromRouteParam, isCheckpointId } from "@oak/content-kit";
import type { AppDeps } from "../deps.ts";
import { ApiError } from "../errors.ts";
import type { Mounter } from "./define.ts";

/** `U07` (core route parameter) or the full ID (`U07.CP`, `J.CP1`). */
function checkpointId(param: string): string {
  if (isCheckpointId(param)) return param;
  return checkpointFromRouteParam(param) ?? param;
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
  mount("session.start", ({ body }) => s.sessions.start(body));
  mount("session.heartbeat", ({ params, body }) => {
    s.sessions.heartbeat(params.id, body);
    return { ok: true as const };
  });
  mount("session.end", ({ params, body }) => s.sessions.end(params.id, body));

  mount("lessons.progress", () => s.gates.courseProgress());
  mount("steps.state", ({ params }) => s.course.stepState(params.id, params.stepId));
  mount("steps.attempt", ({ params, body }) => s.course.attempt(params.id, params.stepId, body));
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

  mount("gym.start", ({ body }) => s.course.gymStart(body));
  mount("terms.introduced", () => ({ items: d.repos.terms.list() }));
}
