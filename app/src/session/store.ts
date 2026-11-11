// The session store (docs/design/wave2.md §3.3): a pure reducer over `SessionEvent`s plus a zustand binding.
// One session at a time; the session engineer's runner drives it (begin, tick, enter, end), the block surfaces
// report into it. Server state (the plan, the session row, the summary) stays in TanStack Query; this store
// holds only where the learner is and how long they have been at it.
import {
  CHECKPOINT_DAY,
  type EndpointInput,
  SESSION_BUDGET,
  type SessionPlan,
  type TargetMinutes,
} from "@oak/api";
import { create } from "zustand";
import type {
  BlockBudget,
  BlockReport,
  SessionApi,
  SessionBlock,
  SessionEvent,
  SessionPhaseKey,
  SessionState,
} from "./types.ts";

/** Idle time beyond this is not active time (contracts §9.7). */
export const IDLE_CUTOFF_MS = 60_000;

export const INITIAL_SESSION: SessionState = {
  plan: null,
  session: null,
  block: null,
  warmupIndex: 0,
  reports: [],
  activeMs: 0,
  phaseMs: { warmup: 0, main: 0, make: 0, coda: 0 },
  wrap: "none",
  wrappedEarly: false,
  paused: false,
};

/** `new` is the server's `main` phase. */
export function phaseOf(block: SessionBlock): SessionPhaseKey {
  return block === "new" ? "main" : block;
}

/** Minutes per block for a plan's kind and target (contracts §9.1). */
export function blockBudget(kind: SessionPlan["kind"], target: TargetMinutes): BlockBudget {
  const b = SESSION_BUDGET[target];
  switch (kind) {
    case "checkpoint":
      return {
        warmup: CHECKPOINT_DAY.warmup,
        new: CHECKPOINT_DAY.checkpoint,
        make: CHECKPOINT_DAY.make,
        coda: 1,
      };
    case "capstone":
      // The draft save is the Make.
      return { warmup: 3, new: b.capstoneWork, make: 0, coda: 1 };
    case "gym":
      // The saved transcription version is the Make.
      return { warmup: 4, new: b.gymWork, make: 0, coda: 1 };
    case "review":
      return { warmup: target - 1, new: 0, make: 0, coda: 1 };
    case "keepalive":
      // One easy set, then an optional one-minute riff (contracts §7.8 c): it counts at the 2-minute mark.
      return { warmup: 2, new: 0, make: 1, coda: 1 };
    case "studio":
      return { warmup: 0, new: 0, make: target - 1, coda: 1 };
    default:
      return { warmup: b.warmup, new: b.new, make: b.make, coda: b.coda };
  }
}

/** The minute mark at which "Wrap up with a quick sketch?" is offered: the session's target. */
export function wrapAtMs(plan: Pick<SessionPlan, "kind" | "targetMinutes">): number {
  // A Keep-alive is short by design: nothing to wrap up.
  if (plan.kind === "keepalive") return Number.POSITIVE_INFINITY;
  // A checkpoint day is about 20 minutes at every target (contracts §9.1).
  const minutes = plan.kind === "checkpoint" ? 20 : plan.targetMinutes;
  return minutes * 60_000;
}

/** The first block of a plan: the warm-up when anything is planned, else the New block (or the Make for Studio). */
export function firstBlock(plan: SessionPlan): SessionBlock {
  if (plan.warmup.items.length > 0) return "warmup";
  // Studio, and a Keep-alive with nothing due: the riff of the day is the whole session (contracts §7.8 c).
  if (plan.kind === "studio" || plan.kind === "keepalive") return "make";
  if (plan.mapItemId === null && plan.main === null) return "coda";
  return "new";
}

/** The block after `block` once it is done. Capstone and gym days have no separate Make. */
export function nextBlock(block: SessionBlock, plan: SessionPlan): SessionBlock | null {
  switch (block) {
    case "warmup":
      if (plan.kind === "review") return "coda";
      // Keep-alive: one easy set, then the optional one-minute riff of the day (the runner offers Skip).
      if (plan.kind === "studio" || plan.kind === "keepalive") return "make";
      return plan.mapItemId === null && plan.main === null ? "coda" : "new";
    case "new":
      return plan.kind === "capstone" || plan.kind === "gym" ? "coda" : "make";
    case "make":
      return "coda";
    case "coda":
      return null;
  }
}

function apply(state: SessionState, report: BlockReport): SessionState {
  const plan = state.plan;
  const reports = [...state.reports, report];
  if (plan === null) return { ...state, reports };
  if (report.block === "warmup") {
    const warmupIndex = state.warmupIndex + 1;
    const done = warmupIndex >= plan.warmup.items.length;
    return { ...state, reports, warmupIndex, block: done ? nextBlock("warmup", plan) : "warmup" };
  }
  if (report.block === "new" && !report.completed) return { ...state, reports, block: "make" };
  return { ...state, reports, block: nextBlock(report.block, plan) };
}

/** Pure: the next state. Events that make no sense in the current state leave it unchanged. */
export function sessionReducer(state: SessionState, ev: SessionEvent): SessionState {
  switch (ev.type) {
    case "begin":
      return { ...INITIAL_SESSION, plan: ev.plan, session: ev.session, block: firstBlock(ev.plan) };
    case "reset":
      return INITIAL_SESSION;
    case "restore":
      return { ...INITIAL_SESSION, ...ev.state, paused: false };
    case "tick": {
      if (state.block === null || state.paused || !(ev.ms > 0)) return state;
      const ms = Math.min(ev.ms, IDLE_CUTOFF_MS);
      const key = phaseOf(state.block);
      const activeMs = state.activeMs + ms;
      const due = state.plan !== null && activeMs >= wrapAtMs(state.plan);
      const offer = due && state.wrap === "none" && (state.block === "warmup" || state.block === "new");
      return {
        ...state,
        activeMs,
        phaseMs: { ...state.phaseMs, [key]: state.phaseMs[key] + ms },
        wrap: offer ? "offered" : state.wrap,
      };
    }
    case "enter":
      return state.session === null ? state : { ...state, block: ev.block };
    case "report":
      return state.block === null ? state : apply(state, ev.report);
    case "wrap-up": {
      if (state.block === null || state.block === "coda") return state;
      // Before the Make: jump to the Quick sketch (contracts §9.4). In the Make: go to the Coda.
      const early = state.block === "warmup" || state.block === "new";
      return {
        ...state,
        wrap: "wrapping",
        wrappedEarly: state.wrappedEarly || early,
        block: early ? "make" : "coda",
      };
    }
    case "keep-going":
      return state.wrap === "offered" ? { ...state, wrap: "kept-going" } : state;
    case "pause":
      return state.block === null ? state : { ...state, paused: true };
    case "resume":
      return { ...state, paused: false };
  }
}

/** The body of `POST /session/:id/end`. */
export type SessionEndBody = EndpointInput<"session.end">["body"];

/** The body of `POST /session/:id/end` from the store. */
export function sessionEndBody(state: SessionState): SessionEndBody {
  return { wrappedEarly: state.wrappedEarly, phaseMs: { ...state.phaseMs } };
}

/** Minutes left in the current block's budget (never negative), for "≈ 3 min left" copy. */
export function blockMinutesLeft(state: SessionState): number | null {
  if (state.plan === null || state.block === null) return null;
  const budget = blockBudget(state.plan.kind, state.plan.targetMinutes)[state.block];
  return Math.max(0, budget - state.phaseMs[phaseOf(state.block)] / 60_000);
}

export const useSession = create<SessionApi>((set) => {
  const dispatch = (ev: SessionEvent) => set((s) => sessionReducer(s, ev));
  return {
    ...INITIAL_SESSION,
    begin: (plan, session) => dispatch({ type: "begin", plan, session }),
    tick: (ms) => dispatch({ type: "tick", ms }),
    enter: (block) => dispatch({ type: "enter", block }),
    reportBlockDone: (report) => dispatch({ type: "report", report }),
    wrapUp: () => dispatch({ type: "wrap-up" }),
    keepGoing: () => dispatch({ type: "keep-going" }),
    pause: () => dispatch({ type: "pause" }),
    resume: () => dispatch({ type: "resume" }),
    reset: () => dispatch({ type: "reset" }),
  };
});

/** After a reload: puts back a session saved by the runner (`persist.ts`). The learner resumes unpaused. */
export function restoreSession(state: SessionState): void {
  useSession.setState((s) => sessionReducer(s, { type: "restore", state }));
}

/** For surfaces: report the end of your block (a no-op outside a session, so free practice needs no branch). */
export function reportBlockDone(report: BlockReport): void {
  useSession.getState().reportBlockDone(report);
}

/** The session ID to send with attempts, drill sessions and sketches (`null` outside a session). */
export function currentSessionId(): string | null {
  return useSession.getState().session?.id ?? null;
}
