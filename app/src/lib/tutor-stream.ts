// Client side of a tutor turn (contracts §10, interfaces §4.2). The `@oak/api` client reads the SSE frames; this
// file folds them into one view state with a pure reducer, so the panel only renders state.
//
// Two rules matter:
//  - a turn is over only on a terminal `done` or `error` event. A stream that ends without one (an idle drop, a
//    proxy cut, a server crash mid-turn) is an error of kind `network`, never a silent success with half a message;
//  - a turn that receives nothing for `idleMs` is stalled. The server sends `: ping` every 5 s (SSE comments the
//    parser drops), so the watchdog counts raw bytes, pings included: silence for 45 s means the connection is
//    gone even though the socket looks open. The turn is aborted and reported as a `network` error with its own
//    copy; the partial text is kept.
import {
  type CardData,
  createClient,
  type FetchLike,
  SSE_PING_INTERVAL_MS,
  type ThreadKind,
  TUTOR_ERROR_COPY,
  TUTOR_ROUTE_OF,
  type TutorErrorKind,
  type TutorEvent,
  type TutorEventOf,
  type TutorTurnRequest,
  type UsageSummary,
} from "@oak/api";

export type TurnStatus = "idle" | "streaming" | "done" | "error";

export interface TurnTool {
  toolUseId: string;
  name: string;
  ok: boolean | null;
}

export interface TurnState {
  status: TurnStatus;
  meta: TutorEventOf<"meta">["data"] | null;
  /** Progress line ("Running the code"). */
  phase: TutorEventOf<"status">["data"] | null;
  text: string;
  thinking: string;
  /**
   * Tool calls, in order. The server's own `summary` is deliberately not kept: the panel shows fixed copy per
   * tool, so nothing a tool saw (a score, a step's rung) can reach the learner through an activity line.
   */
  tools: TurnTool[];
  /** Partial `propose_code` JSON by tool use, while a card is being drafted. */
  drafts: Record<string, string>;
  cards: CardData[];
  review: TutorEventOf<"review">["data"] | null;
  usage: UsageSummary | null;
  done: TutorEventOf<"done">["data"] | null;
  error: { kind: TutorErrorKind; message: string; retryAfterSec?: number; stalled?: boolean } | null;
}

export const INITIAL_TURN: TurnState = {
  status: "idle",
  meta: null,
  phase: null,
  text: "",
  thinking: "",
  tools: [],
  drafts: {},
  cards: [],
  review: null,
  usage: null,
  done: null,
  error: null,
};

/** Silence (no byte, not even a ping) after which a turn counts as stalled: nine missed pings. */
export const TURN_IDLE_MS = SSE_PING_INTERVAL_MS * 9;

export const STALLED_COPY = "The tutor stopped responding. What it wrote so far is kept; try again.";

export function startTurn(): TurnState {
  return { ...INITIAL_TURN, status: "streaming" };
}

/** Folds one event into the turn. Events after a terminal one are ignored. */
export function reduceTurn(state: TurnState, event: TutorEvent): TurnState {
  if (state.status === "done" || state.status === "error") return state;
  switch (event.type) {
    case "meta":
      return { ...state, status: "streaming", meta: event.data };
    case "status":
      return { ...state, status: "streaming", phase: event.data };
    case "text":
      return { ...state, status: "streaming", text: state.text + event.data.delta };
    case "thinking":
      return { ...state, status: "streaming", thinking: state.thinking + event.data.delta };
    case "tool_start":
      if (state.tools.some((t) => t.toolUseId === event.data.toolUseId)) return state;
      return {
        ...state,
        status: "streaming",
        tools: [...state.tools, { toolUseId: event.data.toolUseId, name: event.data.name, ok: null }],
      };
    case "tool_input":
      return {
        ...state,
        drafts: {
          ...state.drafts,
          [event.data.toolUseId]: (state.drafts[event.data.toolUseId] ?? "") + event.data.partialJson,
        },
      };
    case "tool_result": {
      const known = state.tools.some((t) => t.toolUseId === event.data.toolUseId);
      const tools = known
        ? state.tools.map((t) => (t.toolUseId === event.data.toolUseId ? { ...t, ok: event.data.ok } : t))
        : [...state.tools, { toolUseId: event.data.toolUseId, name: event.data.name, ok: event.data.ok }];
      return { ...state, tools };
    }
    case "card": {
      const { [event.data.toolUseId]: _drafted, ...drafts } = state.drafts;
      if (state.cards.some((c) => c.cardId === event.data.cardId)) return { ...state, drafts };
      return { ...state, drafts, cards: [...state.cards, event.data] };
    }
    case "review":
      return { ...state, review: event.data };
    case "usage":
      return { ...state, usage: event.data };
    case "done":
      return { ...state, status: "done", phase: null, drafts: {}, done: event.data, usage: event.data.usage };
    case "error":
      return {
        ...state,
        status: "error",
        phase: null,
        drafts: {},
        error: {
          kind: event.data.kind,
          message: event.data.message,
          ...(event.data.retryAfterSec === undefined ? {} : { retryAfterSec: event.data.retryAfterSec }),
        },
        usage: event.data.usage ?? state.usage,
      };
  }
}

/** Closes a turn whose stream ended without a terminal event: that is a `network` error. */
export function settleTurn(state: TurnState): TurnState {
  if (state.status === "done" || state.status === "error") return state;
  return {
    ...state,
    status: "error",
    phase: null,
    drafts: {},
    error: { kind: "network", message: TUTOR_ERROR_COPY.network },
  };
}

/** A turn the watchdog stopped: a `network` error with its own copy, whatever the abort produced. */
export function stallTurn(state: TurnState): TurnState {
  return {
    ...state,
    status: "error",
    phase: null,
    drafts: {},
    error: { kind: "network", message: STALLED_COPY, stalled: true },
  };
}

/**
 * Wraps a fetch so every chunk of the response body (SSE comments included) calls `onBytes`. The body is
 * re-streamed unchanged; cancelling the wrapped body cancels the original.
 */
export function tapFetch(base: FetchLike, onBytes: () => void): FetchLike {
  return async (url, init) => {
    const res = await base(url, init);
    if (!res.body) return res;
    const reader = res.body.getReader();
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        onBytes();
        controller.enqueue(value);
      },
      cancel(reason) {
        return reader.cancel(reason);
      },
    });
    return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
  };
}

export interface RunTurnOptions {
  signal?: AbortSignal;
  onState?(state: TurnState): void;
  /** Silence after which the turn is stalled. Default `TURN_IDLE_MS`. */
  idleMs?: number;
  /** The fetch to stream with (tests). Default: the browser's. */
  fetch?: FetchLike;
  /** Clock for the watchdog (tests). */
  now?: () => number;
  /** How often the watchdog looks (tests shorten it). Default 1 s. */
  watchEveryMs?: number;
}

const defaultFetch: FetchLike = (url, init) => fetch(url, init);

/** Runs one tutor turn to its end and resolves with the final state. Never rejects. */
export async function runTutorTurn(request: TutorTurnRequest, opts: RunTurnOptions = {}): Promise<TurnState> {
  const now = opts.now ?? Date.now;
  const idleMs = opts.idleMs ?? TURN_IDLE_MS;
  let state = startTurn();
  opts.onState?.(state);

  // One controller for the fetch: the caller's Stop and the watchdog both abort it.
  const ac = new AbortController();
  const onOuterAbort = () => ac.abort();
  if (opts.signal?.aborted) ac.abort();
  else opts.signal?.addEventListener("abort", onOuterAbort, { once: true });

  let last = now();
  let stalled = false;
  const touch = () => {
    last = now();
  };
  const watch = setInterval(() => {
    if (now() - last > idleMs && !ac.signal.aborted) {
      stalled = true;
      ac.abort();
    }
  }, opts.watchEveryMs ?? 1_000);

  const client = createClient({ fetch: tapFetch(opts.fetch ?? defaultFetch, touch) });
  try {
    await client.stream(TUTOR_ROUTE_OF[request.kind], request, {
      signal: ac.signal,
      onEvent(event) {
        touch();
        state = reduceTurn(state, event);
        opts.onState?.(state);
      },
    });
  } catch {
    // `stream` never rejects by contract; a broken client is still a failed turn, not a crash.
  } finally {
    clearInterval(watch);
    opts.signal?.removeEventListener("abort", onOuterAbort);
  }
  const settled = stalled && !opts.signal?.aborted ? stallTurn(state) : settleTurn(state);
  if (settled !== state) opts.onState?.(settled);
  return settled;
}

/** Whether a failed turn may be sent again now (a rate limit asks for a pause first). */
export function retryAt(state: TurnState, finishedAt: number): number {
  const sec = state.error?.retryAfterSec;
  return sec && sec > 0 ? finishedAt + sec * 1_000 : finishedAt;
}

export type { ThreadKind };
