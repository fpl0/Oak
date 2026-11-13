// Starting a gym day's New block (contracts §2.5, wave4.md §5.4–§5.5). The session records the gym session with
// `gym.start` (the learner's own `GYM.nn`, which the slot rule counts), then opens its project: a ladder item drawn
// for that gym session (`ladder.next { gymId }`, so an even slot without audio is drawn one realism level up), or the
// learner's own-audio project. Idempotent per Oak session: a reload, a second render or a resumed session finds the
// gym session already started for it (`gym.plan.history`) and its project (`transcriptionId`), and starts nothing new.
import type { GymPlan, GymSession, LadderItem, TranscriptionDetail } from "@oak/api";

export interface GymStartApi {
  plan(): Promise<Pick<GymPlan, "next" | "history">>;
  start(body: {
    sessionId: string | null;
    kind: "ladder" | "own-audio";
    transcriptionId: string | null;
  }): Promise<GymSession>;
  nextItem(body: { sessionId: string | null; gymId: string }): Promise<Pick<LadderItem, "itemId">>;
}

export interface GymStarted {
  gymId: string;
  kind: "ladder" | "own-audio";
  /** The transcription project the block works on. */
  projectId: string;
  /** True when this call started the gym session (false: found, already started for this Oak session). */
  fresh: boolean;
}

/** What `gym.start` is asked for: an own-audio slot only with a project to continue; else a ladder session. */
export function startBody(
  next: GymPlan["next"],
  sessionId: string | null,
): { sessionId: string | null; kind: "ladder" | "own-audio"; transcriptionId: string | null } {
  if (next?.kind === "own-audio" && !next.ownAudioFallback && next.transcriptionId)
    return { sessionId, kind: "own-audio", transcriptionId: next.transcriptionId };
  return { sessionId, kind: "ladder", transcriptionId: null };
}

export async function startGym(apiPort: GymStartApi, sessionId: string): Promise<GymStarted> {
  const plan = await apiPort.plan();
  let gym = plan.history.find((g) => g.sessionId === sessionId) ?? null;
  const fresh = gym === null;
  if (gym === null) gym = await apiPort.start(startBody(plan.next, sessionId));
  if (gym.kind === "own-audio" && gym.transcriptionId)
    return { gymId: gym.gymId, kind: "own-audio", projectId: gym.transcriptionId, fresh };
  // A ladder session: its item, once drawn, is kept on the gym row (`transcriptionId`).
  const projectId = gym.transcriptionId ?? (await apiPort.nextItem({ sessionId, gymId: gym.gymId })).itemId;
  return { gymId: gym.gymId, kind: "ladder", projectId, fresh };
}

const inflight = new Map<string, Promise<GymStarted>>();
/** One start per Oak session in this tab, however many times the block renders. */
export function startGymOnce(apiPort: GymStartApi, sessionId: string): Promise<GymStarted> {
  const known = inflight.get(sessionId);
  if (known) return known;
  const p = startGym(apiPort, sessionId).catch((e: unknown) => {
    inflight.delete(sessionId);
    throw e;
  });
  inflight.set(sessionId, p);
  return p;
}

/** Versions saved in this session: the gym day's Make (contracts §9.1). */
export function versionsThisSession(
  project: Pick<TranscriptionDetail, "versions">,
  startedAt: string | null | undefined,
): number {
  if (!startedAt) return project.versions.length;
  return project.versions.filter((v) => v.createdAt >= startedAt).length;
}
