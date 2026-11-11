// The session context every surface reads (docs/design/wave2.md §3.3): today's plan from the server, the block
// the learner is in (warm-up → new → make → coda, contracts §9.3), active time against the budget (§9.1), and
// "Wrap up" (§9.4). The session engineer owns the flow (routes, navigation, the Coda); lesson, drills, capstone,
// checkpoint and studio only read `useSession` and report their block's end with `reportBlockDone`.
import type { Session, SessionPlan, TargetMinutes } from "@oak/api";

/** The four blocks of a session day. `new` is the server's `main` phase. */
export const SESSION_BLOCKS = ["warmup", "new", "make", "coda"] as const;
export type SessionBlock = (typeof SESSION_BLOCKS)[number];
/** `SessionHeartbeat.phase` / `SessionEnd.phaseMs` keys. */
export type SessionPhaseKey = "warmup" | "main" | "make" | "coda";

/** Minutes per block (contracts §9.1). `make: 0` where the Make is part of the work (capstone, gym). */
export interface BlockBudget {
  warmup: number;
  new: number;
  make: number;
  coda: number;
}

/**
 * How a surface tells the session its block is over. The session store advances (warm-up item by item, then
 * new, make, coda) and the session engineer's runner navigates; a surface never navigates to the next block.
 */
export type BlockReport =
  /** One warm-up set finished (or was skipped: `skipped: true`, e.g. a mic set in Quiet mode). */
  | {
      block: "warmup";
      source: "drills";
      warmupItemId: string;
      drillSessionId: string | null;
      meanCredit: number | null;
      skipped?: boolean;
    }
  /** The New block: a lesson up to its Make, a checkpoint, a capstone session's work, a gym transcription. */
  | {
      block: "new";
      source: "lesson" | "checkpoint" | "capstone" | "gym" | "light";
      itemId: string;
      /** False when the learner wrapped up early (the lesson resumes at `resumeStep` next time). */
      completed: boolean;
      resumeStep?: string | null;
    }
  /** The Make (or the Quick sketch after "Wrap up"): a saved sketch, always. */
  | { block: "make"; source: "lesson" | "quick-sketch" | "checkpoint" | "capstone"; sketchId: string }
  /** The Coda's "Done for today". */
  | { block: "coda"; source: "coda" };

export type WrapState = "none" | "offered" | "kept-going" | "wrapping";

export interface SessionState {
  /** Today's plan (`GET /session/today`), or null outside a session. */
  plan: SessionPlan | null;
  /** The started session (`POST /session/start`), or null before Start. */
  session: Session | null;
  /** The block on screen; null = not in a session (free practice, Studio, browsing). */
  block: SessionBlock | null;
  /** Index into `plan.warmup.items` of the next warm-up set. */
  warmupIndex: number;
  /** Reports received, oldest first. */
  reports: BlockReport[];
  /** Focused, non-idle time in this session (idle over 60 s is not counted, contracts §9.7). */
  activeMs: number;
  phaseMs: Record<SessionPhaseKey, number>;
  /** At the target time a non-modal line offers "Wrap up with a quick sketch?" once (contracts §9.3). */
  wrap: WrapState;
  /** True once "Wrap up" was taken before the Make. Sent with `session.end`. */
  wrappedEarly: boolean;
  paused: boolean;
}

export type SessionEvent =
  | { type: "begin"; plan: SessionPlan; session: Session }
  /** `ms` of active time passed (the runner ticks; it leaves out idle time and hidden tabs). */
  | { type: "tick"; ms: number }
  | { type: "enter"; block: SessionBlock }
  | { type: "report"; report: BlockReport }
  | { type: "wrap-up" }
  | { type: "keep-going" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "reset" }
  /** After a reload: the state the runner saved for the open session. */
  | { type: "restore"; state: SessionState };

/** What the session store exposes to every surface. */
export interface SessionApi extends SessionState {
  begin(plan: SessionPlan, session: Session): void;
  tick(ms: number): void;
  enter(block: SessionBlock): void;
  reportBlockDone(report: BlockReport): void;
  wrapUp(): void;
  keepGoing(): void;
  pause(): void;
  resume(): void;
  reset(): void;
}

export type { TargetMinutes };
