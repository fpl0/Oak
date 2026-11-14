// The server reads behind a capstone day and a gym day (capstone-day.ts, gym-day.ts), joined once for Today, the
// session host and the Coda. The Wave 4 endpoints (`GET /capstones/:id/sessions`, `/gym`, `/ladder`,
// `/capstones/:id/gate`) may answer 501 on a server that has not built them; every model then falls back to what
// the plan and course progress already say, so nothing here ever blocks a day.
import type { Bootstrap, CapstoneGate, CoreCompletion, SessionPlan } from "@oak/api";
import { useQuery } from "@tanstack/react-query";
import { useCapstoneContent } from "../capstone/content.ts";
import { useContent } from "../lib/content.ts";
import {
  apiQuery,
  useCapstoneGate,
  useCapstoneSessions,
  useCourseProgress,
  useGymPlan,
  useLadder,
  useTranscriptions,
} from "../lib/queries.ts";
import {
  type CapstoneDay,
  type CapstoneDefLike,
  capstoneDay,
  capstoneDayTitle,
  capstoneInProgress,
} from "./capstone-day.ts";
import { type CftDay, cftDay, isCftSession, waitingLine } from "./cft-day.ts";
import { type AfterCore, afterCore } from "./finale-model.ts";
import { type GymDay, gymDay } from "./gym-day.ts";
import { authoredUnits, deriveTracks, type TrackRow, trackRows } from "./tracks-model.ts";

/** The full capstone definition (sessions, release, review) for an ID, once the capstone chunk has loaded. */
export function useCapstoneDef(capstoneId: string | null): CapstoneDefLike | null {
  const content = useCapstoneContent();
  if (!capstoneId) return null;
  const def = content.data?.capstones.find((c) => c.id === capstoneId);
  if (!def) return null;
  return {
    id: def.id,
    title: def.title,
    kind: def.kind,
    sessionDefs: def.sessionDefs.map((s) => ({
      id: s.id,
      title: s.title,
      ...(s.release !== undefined ? { release: s.release } : {}),
      ...(s.review !== undefined ? { review: s.review } : {}),
    })),
  };
}

const capstoneOf = (plan: Pick<SessionPlan, "kind" | "mapItemId"> | null): string | null => {
  if (plan?.kind !== "capstone" || !plan.mapItemId) return null;
  return /^(.+)\.S\d+$/.exec(plan.mapItemId)?.[1] ?? null;
};

/** A capstone day for a plan, with whatever the server can say about its sessions. */
export function useCapstoneDay(
  plan: Pick<SessionPlan, "kind" | "mapItemId" | "title"> | null,
): CapstoneDay | null {
  const id = capstoneOf(plan);
  const def = useCapstoneDef(id);
  const sessions = useCapstoneSessions(id);
  const course = useCourseProgress();
  if (!plan || !id) return null;
  const status = course.data?.capstones.find((c) => c.capstoneId === id) ?? null;
  return capstoneDay(plan, def, sessions.data ?? null, status);
}

/**
 * Whether everything `useCapstoneDay` reads has settled (loaded or failed): the session host decides the resume
 * card only then, once per session, so the decision never rests on half-loaded data.
 */
export function useCapstoneDaySettled(plan: Pick<SessionPlan, "kind" | "mapItemId"> | null): boolean {
  const id = capstoneOf(plan);
  const content = useCapstoneContent();
  const sessions = useCapstoneSessions(id);
  const course = useCourseProgress();
  if (!id) return true;
  return !content.isPending && !sessions.isPending && !course.isPending;
}

/** The capstone a gym slot must not interrupt (contracts §2.5), from course progress. */
export function useCapstoneInProgress() {
  const course = useCourseProgress();
  return capstoneInProgress(course.data);
}

/** A gym day for a plan: the slot rule's state (`GET /gym`) and the ladder (`GET /ladder`), when built. */
export function useGymDay(
  plan: Pick<SessionPlan, "kind" | "mapItemId" | "title" | "note"> | null,
): GymDay | null {
  const gym = useGymPlan();
  const ladder = useLadder();
  const projects = useTranscriptions();
  const songs = useLadderSongsAt(
    gym.data?.next?.ladderLevel ?? ladder.data?.level ?? null,
    plan?.kind === "gym",
  );
  if (plan?.kind !== "gym") return null;
  const projectId = gym.data?.next?.transcriptionId ?? null;
  const own = projectId ? projects.data?.items.find((t) => t.id === projectId) : undefined;
  return gymDay(plan, gym.data ?? null, ladder.data ?? null, own?.title ?? null, songs);
}

/**
 * The song pool (`GET /ladder/songs`, Wave 5), read only on a level-5 or level-6 day: the other levels are generated
 * and name no song. `null` while it loads or on a server that answers 501.
 */
export function useLadderSongsAt(level: number | null, when = true) {
  const songs = useQuery({
    ...apiQuery("ladder.songs"),
    enabled: when && (level === 5 || level === 6 || level === 8),
  });
  return songs.data?.items ?? null;
}

/**
 * X1's gate while it is closed (contracts §6.6: "Two more gym sets open X1"): the gym plan carries it from U07.L01;
 * before the server builds `GET /gym`, the capstone's own gate is read once C2 is released.
 */
export function useX1Gate(): CapstoneGate | null {
  const gym = useGymPlan();
  const course = useCourseProgress();
  const c2 = course.data?.capstones.find((c) => c.capstoneId === "C2");
  const x1 = course.data?.capstones.find((c) => c.capstoneId === "X1");
  const ask = !gym.data && c2?.status === "released" && x1?.status === "locked";
  const gate = useCapstoneGate(ask ? "X1" : null);
  return gym.data?.x1 ?? (ask ? (gate.data ?? null) : null);
}

/** The gym is open (from U07.L01): its slots run and Today can offer an extra session. */
export function useGymOpen(plan: Pick<SessionPlan, "alternatives" | "kind"> | null): boolean {
  const gym = useGymPlan();
  if (gym.data) return gym.data.active;
  return !!plan && (plan.kind === "gym" || plan.alternatives.some((a) => a.kind === "gym"));
}

// --- Wave 6 ---------------------------------------------------------------------------------------------------

/**
 * The CF-T day of a plan (cft-day.ts): the standard's sessions and checks, the slot rule's state and the song the
 * learner picked. The song's title comes from the ladder's song list (level 8), read only on a CF-T day.
 */
export function useCftDay(plan: Pick<SessionPlan, "kind" | "mapItemId" | "slot"> | null): CftDay | null {
  const on = plan?.kind === "capstone" && isCftSession(plan.mapItemId);
  const sessions = useCapstoneSessions(on ? "CF-T" : null);
  const gym = useGymPlan();
  const songs = useQuery({ ...apiQuery("ladder.songs"), enabled: on });
  if (!plan || !on) return null;
  const songId = gym.data?.cfT?.songId ?? null;
  const title = songId ? (songs.data?.items.find((s) => s.songId === songId)?.title ?? null) : null;
  return cftDay(plan, sessions.data ?? null, gym.data ?? null, title);
}

/** The compose capstone that waits behind today's CF-T session, in one line, or null. */
export function useWaitingLine(plan: Pick<SessionPlan, "kind" | "mapItemId"> | null): string | null {
  const course = useCourseProgress();
  const content = useCapstoneContent();
  if (plan?.kind !== "capstone" || !isCftSession(plan.mapItemId)) return null;
  // Said with the capstone's own title, so not before the capstone content has loaded.
  const caps = content.data?.capstones;
  if (!caps) return null;
  return waitingLine(capstoneInProgress(course.data), (id) =>
    capstoneDayTitle(caps.find((c) => c.id === id)?.title ?? id),
  );
}

/**
 * `GET /course/completion`, asked only once the lessons of the core are done (`core` from the plan or course
 * progress): before that no surface needs it, and a server that has not built it is never asked.
 */
export function useCompletionWhen(core: string | null | undefined) {
  return useQuery({
    ...apiQuery("course.completion"),
    enabled: core === "lessons-done" || core === "complete",
  });
}

/** What is open once the lessons of the core are done (finale-model.ts), for Today. */
export function useAfterCore(
  plan: Pick<SessionPlan, "core" | "kind" | "mapItemId"> | null,
  boot: Pick<Bootstrap, "day" | "profile"> | null | undefined,
): { after: AfterCore | null; completion: CoreCompletion | null } {
  const completion = useCompletionWhen(plan?.core);
  if (!plan || !boot || !completion.data) return { after: null, completion: completion.data ?? null };
  return {
    after: afterCore(plan, completion.data, {
      day: boot.day,
      timezone: boot.profile.timezone,
      rolloverHour: boot.profile.rolloverHour,
    }),
    completion: completion.data,
  };
}

/**
 * The advanced tracks as rows (tracks-model.ts): the server's `CourseProgress.tracks` when it carries them, else
 * the same gates read from course progress, so Progress and the Oak show the branches on any server.
 */
export function useTrackRows(): TrackRow[] {
  const course = useCourseProgress();
  const content = useContent();
  if (!course.data) return [];
  if (course.data.tracks && course.data.tracks.length > 0) return trackRows(course.data.tracks);
  const authored = authoredUnits((content.data?.lessons ?? []).map((l) => l.id as string));
  return trackRows(deriveTracks(course.data, authored));
}
