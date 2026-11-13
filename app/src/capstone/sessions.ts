// The sessions of a multi-session capstone (contracts §2.4, wave4.md §5.1): C2.S1–S2, X1.S1–S3. One view per
// `CapstoneSessionDef`, read from `capstones.sessions` (Wave 4) when the server has it, else rebuilt from the
// Wave 3 `CapstoneState` (sessions done, the linked draft). Pure.
import {
  type CapstoneCheckState,
  type CapstoneDef,
  type CapstoneSessionState,
  type CapstoneSessions,
  type CapstoneState,
  stripMarkers,
} from "@oak/api";

/** The code a session opens with when there is no draft yet: its own starter, else the brief's. */
export function starterOf(def: Pick<CapstoneDef, "sessionDefs" | "brief">, sessionIndex = 0): string {
  const own = def.sessionDefs[sessionIndex]?.starter;
  return stripMarkers(own ?? def.brief?.code.starter ?? "").code;
}

export type SessionStatus = CapstoneSessionState["status"];

export interface SessionView {
  id: string;
  /** 0-based. */
  index: number;
  title: string;
  goal: string;
  status: SessionStatus;
  draft: CapstoneSessionState["draft"];
  checks: CapstoneCheckState[];
  /** The tutor review is offered at the end of this session. */
  review: boolean;
  /** The session ends by releasing the piece. */
  release: boolean;
  /** Code a first session opens with (`CapstoneSessionDef.starter`). */
  starter: string | null;
}

/** Every session of the capstone, in order, with its status. */
export function sessionViews(
  def: Pick<CapstoneDef, "sessionDefs">,
  state: Pick<CapstoneState, "sessions" | "sketchId" | "status">,
  server: CapstoneSessions | null | undefined,
): SessionView[] {
  const total = def.sessionDefs.length;
  const fromServer = new Map((server?.sessions ?? []).map((s) => [String(s.capstoneSessionId), s] as const));
  let openSeen = false;
  return def.sessionDefs.map((sd, index) => {
    const s = fromServer.get(String(sd.id));
    const base = {
      id: String(sd.id),
      index,
      title: sd.title,
      goal: sd.goal,
      review: sd.review ?? index === total - 1,
      release: sd.release ?? index === total - 1,
      starter: sd.starter ?? null,
    };
    if (s) return { ...base, status: s.status, draft: s.draft, checks: s.checks };
    // Wave 3 fallback: done from `state.sessions`; the first not-done session is open (in progress once a draft
    // exists); the rest wait for it.
    let status: SessionStatus;
    if (state.sessions.includes(String(sd.id))) status = "done";
    else if (!openSeen) {
      openSeen = true;
      status = state.sketchId ? "in_progress" : state.status === "locked" ? "locked" : "open";
    } else status = "locked";
    return { ...base, status, draft: null, checks: [] };
  });
}

/** The session to work in: the server's `current`, else the first not done, else the last (revision). */
export function currentSession(
  views: readonly SessionView[],
  server?: CapstoneSessions | null,
): SessionView | null {
  if (views.length === 0) return null;
  if (server?.current) {
    const v = views.find((x) => x.id === String(server.current));
    if (v) return v;
  }
  return views.find((v) => v.status !== "done") ?? (views.at(-1) as SessionView);
}

/** Sessions done, for "Session 2 of 3". */
export function sessionsDone(views: readonly SessionView[]): number {
  return views.filter((v) => v.status === "done").length;
}

/** A draft older than this when the workspace opens was left in an earlier sitting. */
export const RESUME_AFTER_MS = 10 * 60_000;

/**
 * Whether opening the workspace is a return to work already started (a session done, or a draft saved in an
 * earlier sitting): then the piece is offered "from the top", so the learner hears where they left off. A draft
 * the Start button made a moment ago is not a return.
 */
export function isResume(
  views: readonly SessionView[],
  latestDraft: { version: number; createdAt: string } | null,
  now: number = Date.now(),
): boolean {
  if (latestDraft === null) return false;
  if (views.some((v) => v.status === "done")) return true;
  const at = Date.parse(latestDraft.createdAt);
  return Number.isFinite(at) && now - at > RESUME_AFTER_MS;
}

/** "Session 2 of 3 · Melody". */
export function sessionLabel(v: Pick<SessionView, "index" | "title">, total: number): string {
  return `Session ${v.index + 1} of ${total} · ${v.title}`;
}
