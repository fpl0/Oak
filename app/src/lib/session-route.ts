// Where a planned session (or a map item) is played: the route table of contracts §11.9 applied to session kinds.
import {
  checkpointRouteParam,
  isCapstoneId,
  isCheckpointId,
  isLessonId,
  parseCapstoneSessionId,
  type SessionPlan,
} from "@oak/api";

export type Target =
  | { to: "/learn/$lessonId"; params: { lessonId: string }; search?: { step?: string } }
  | { to: "/checkpoint/$unitId"; params: { unitId: string } }
  | { to: "/capstone/$id"; params: { id: string } }
  | { to: "/transcribe" }
  | { to: "/practice/review" }
  | { to: "/studio" }
  | { to: "/" };

/** The route of a map item ID (`U01.L02`, `U03.CP`, `J.CP1`, `C1`, `GYM.04`). */
export function routeOfItem(id: string | null, step?: string | null): Target {
  if (!id) return { to: "/practice/review" };
  if (isLessonId(id))
    return step
      ? { to: "/learn/$lessonId", params: { lessonId: id }, search: { step } }
      : { to: "/learn/$lessonId", params: { lessonId: id } };
  if (isCheckpointId(id)) return { to: "/checkpoint/$unitId", params: { unitId: checkpointRouteParam(id) } };
  if (isCapstoneId(id)) return { to: "/capstone/$id", params: { id } };
  if (/^GYM\.\d+$/.test(id)) return { to: "/transcribe" };
  // A capstone session ID (`C1.S2`) opens its capstone.
  const session = parseCapstoneSessionId(id);
  if (session) return { to: "/capstone/$id", params: { id: session.capstone } };
  return { to: "/" };
}

/** Where "Start session" goes for today's plan. */
export function routeOfPlan(plan: Pick<SessionPlan, "kind" | "mapItemId" | "main">): Target {
  switch (plan.kind) {
    case "review":
    case "keepalive":
      return { to: "/practice/review" };
    case "studio":
      return { to: "/studio" };
    case "gym":
      return { to: "/transcribe" };
    case "light":
      return plan.main?.light
        ? { to: "/learn/$lessonId", params: { lessonId: plan.main.light.lessonId } }
        : routeOfItem(plan.mapItemId);
    default:
      return routeOfItem(plan.mapItemId, plan.main?.resumeStep ?? null);
  }
}
