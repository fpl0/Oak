// The turns the panel is running or has just run, per thread. The server's timeline (`tutor.timeline`) is the
// record; a live turn is shown until the timeline has caught up with it (a finished turn is stored and comes
// back in the next timeline read), and a failed turn stays as long as the panel is open so its partial text and
// its Retry remain (the server keeps failed tails out of the timeline: contracts §10.1 "excluded").
import type { SubjectRef, ThreadKind, TutorEventOf, TutorTurnRequest } from "@oak/api";
import { create } from "zustand";
import { type RunTurnOptions, runTutorTurn, startTurn, type TurnState } from "../lib/tutor-stream.ts";

export interface LiveTurn {
  id: number;
  thread: SubjectRef;
  kind: ThreadKind;
  /** The learner's side of the turn as shown ("Give me a nudge", or what they typed). */
  label: string;
  request: TutorTurnRequest;
  state: TurnState;
  startedAt: number;
  finishedAt: number | null;
}

export interface TurnListener {
  /** The server's facts for this turn (the rung after any advance, whether Reveal may show). */
  meta?(turn: LiveTurn, meta: TutorEventOf<"meta">["data"]): void;
  /** The turn ended (done or error). */
  finished?(turn: LiveTurn): void;
}

export const useTurns = create<{ turns: LiveTurn[] }>(() => ({ turns: [] }));

type Runner = (request: TutorTurnRequest, opts: RunTurnOptions) => Promise<TurnState>;
let runner: Runner = runTutorTurn;
/** Tests swap the runner. */
export function setTurnRunner(next: Runner | null): void {
  runner = next ?? runTutorTurn;
}

const MAX_TURNS = 40;
const controllers = new Map<number, AbortController>();
const listeners = new Set<TurnListener>();
let nextId = 1;

export const threadKeyOf = (t: SubjectRef): string => `${t.subjectKind}:${t.subjectId}`;

export function onTurns(l: TurnListener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

function update(id: number, patch: Partial<LiveTurn>): LiveTurn | null {
  let out: LiveTurn | null = null;
  useTurns.setState((s) => ({
    turns: s.turns.map((t) => {
      if (t.id !== id) return t;
      out = { ...t, ...patch };
      return out;
    }),
  }));
  return out;
}

/** The turn that is streaming now, if any (one at a time: the composer waits for it). */
export function streamingTurn(): LiveTurn | null {
  return useTurns.getState().turns.find((t) => t.state.status === "streaming") ?? null;
}

/** Starts a turn. Resolves when it has ended; the store holds every intermediate state. */
export async function sendTurn(
  request: TutorTurnRequest,
  label: string,
  now: () => number = Date.now,
): Promise<LiveTurn> {
  const id = nextId++;
  const ac = new AbortController();
  controllers.set(id, ac);
  const turn: LiveTurn = {
    id,
    thread: request.thread,
    kind: request.kind,
    label,
    request,
    state: startTurn(),
    startedAt: now(),
    finishedAt: null,
  };
  useTurns.setState((s) => ({ turns: [...s.turns, turn].slice(-MAX_TURNS) }));
  let sawMeta = false;
  const final = await runner(request, {
    signal: ac.signal,
    onState(state) {
      const t = update(id, { state });
      if (t && state.meta && !sawMeta) {
        sawMeta = true;
        for (const l of listeners) l.meta?.(t, state.meta);
      }
    },
  });
  controllers.delete(id);
  const done = update(id, { state: final, finishedAt: now() }) ?? {
    ...turn,
    state: final,
    finishedAt: now(),
  };
  for (const l of listeners) l.finished?.(done);
  return done;
}

/** Stop (Esc): aborts the turn; it ends as an `aborted` error and keeps what it wrote. */
export function stopTurn(id?: number): boolean {
  const target = id ?? streamingTurn()?.id;
  if (target === undefined) return false;
  const ac = controllers.get(target);
  if (!ac) return false;
  ac.abort();
  return true;
}

/**
 * Sends a failed turn again and drops the failed one (the server does not climb the rung twice on a retry). Turns
 * run one at a time: while another turn streams, a retry is refused (the panel disables its button), as the
 * composer waits.
 */
export function retryTurn(id: number): Promise<LiveTurn> | null {
  const t = useTurns.getState().turns.find((x) => x.id === id);
  if (t?.state.status !== "error" || streamingTurn() !== null) return null;
  useTurns.setState((s) => ({ turns: s.turns.filter((x) => x.id !== id) }));
  return sendTurn(t.request, t.label);
}

/** Drops a failed turn the learner dismissed. */
export function dismissTurn(id: number): void {
  useTurns.setState((s) => ({ turns: s.turns.filter((x) => x.id !== id || x.state.status === "streaming") }));
}

/**
 * The timeline of `thread` was read at `readAt`: finished turns that ended before it are in the record now and
 * leave the live list. Failed turns stay (they are not in the record).
 */
export function settleThread(thread: SubjectRef, readAt: number): void {
  const key = threadKeyOf(thread);
  const keep = (t: LiveTurn) =>
    threadKeyOf(t.thread) !== key ||
    t.state.status !== "done" ||
    t.finishedAt === null ||
    t.finishedAt > readAt;
  const turns = useTurns.getState().turns;
  if (turns.every(keep)) return;
  useTurns.setState({ turns: turns.filter(keep) });
}

export function turnsOf(turns: readonly LiveTurn[], thread: SubjectRef): LiveTurn[] {
  const key = threadKeyOf(thread);
  return turns.filter((t) => threadKeyOf(t.thread) === key);
}

/** Tests. */
export function resetTurns(): void {
  for (const ac of controllers.values()) ac.abort();
  controllers.clear();
  listeners.clear();
  useTurns.setState({ turns: [] });
}
