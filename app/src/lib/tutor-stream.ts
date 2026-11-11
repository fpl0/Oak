// Client side of a tutor turn (contracts §10, interfaces §4.2). `api().stream` reads the SSE frames; this file
// folds them into one view state with a pure reducer, so the panel (Wave 2) only renders state.
//
// The rule that matters: a turn is over only on a terminal `done` or `error` event. A stream that ends without
// one (an idle drop, a proxy cut, a server crash mid-turn) is an error of kind `network`, never a silent success
// with half a message.
import {
  type CardData,
  type ThreadKind,
  TUTOR_ERROR_COPY,
  TUTOR_ROUTE_OF,
  type TutorErrorKind,
  type TutorEvent,
  type TutorEventOf,
  type TutorTurnRequest,
  type UsageSummary,
} from "@oak/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api.ts";

export type TurnStatus = "idle" | "streaming" | "done" | "error";

export interface TurnState {
  status: TurnStatus;
  meta: TutorEventOf<"meta">["data"] | null;
  /** Progress line ("Listening to bars 1–4…"). */
  phase: TutorEventOf<"status">["data"] | null;
  text: string;
  thinking: string;
  tools: { toolUseId: string; name: string; ok: boolean | null; summary: string | null }[];
  /** Partial `propose_code` JSON by tool use, while a card is being drafted. */
  drafts: Record<string, string>;
  cards: CardData[];
  review: TutorEventOf<"review">["data"] | null;
  usage: UsageSummary | null;
  done: TutorEventOf<"done">["data"] | null;
  error: { kind: TutorErrorKind; message: string; retryAfterSec?: number } | null;
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
      return {
        ...state,
        status: "streaming",
        tools: [
          ...state.tools,
          { toolUseId: event.data.toolUseId, name: event.data.name, ok: null, summary: null },
        ],
      };
    case "tool_input":
      return {
        ...state,
        drafts: {
          ...state.drafts,
          [event.data.toolUseId]: (state.drafts[event.data.toolUseId] ?? "") + event.data.partialJson,
        },
      };
    case "tool_result":
      return {
        ...state,
        tools: state.tools.map((t) =>
          t.toolUseId === event.data.toolUseId ? { ...t, ok: event.data.ok, summary: event.data.summary } : t,
        ),
      };
    case "card": {
      const { [event.data.toolUseId]: _drafted, ...drafts } = state.drafts;
      return { ...state, drafts, cards: [...state.cards, event.data] };
    }
    case "review":
      return { ...state, review: event.data };
    case "usage":
      return { ...state, usage: event.data };
    case "done":
      return { ...state, status: "done", phase: null, done: event.data, usage: event.data.usage };
    case "error":
      return {
        ...state,
        status: "error",
        phase: null,
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
    error: { kind: "network", message: TUTOR_ERROR_COPY.network },
  };
}

export interface RunTurnOptions {
  signal?: AbortSignal;
  onState?(state: TurnState): void;
}

/** Runs one tutor turn to its end and resolves with the final state. Never rejects. */
export async function runTutorTurn(request: TutorTurnRequest, opts: RunTurnOptions = {}): Promise<TurnState> {
  let state = startTurn();
  opts.onState?.(state);
  const route = TUTOR_ROUTE_OF[request.kind];
  try {
    await api().stream(route, request, {
      ...(opts.signal ? { signal: opts.signal } : {}),
      onEvent(event) {
        state = reduceTurn(state, event);
        opts.onState?.(state);
      },
    });
  } catch {
    // `stream` never rejects by contract; a broken client is still a failed turn, not a crash.
  }
  const settled = settleTurn(state);
  if (settled !== state) opts.onState?.(settled);
  return settled;
}

/** React binding: one turn at a time, `Esc`-style `stop()` aborts it (contracts: the client resends to retry). */
export function useTutorTurn() {
  const [state, setState] = useState<TurnState>(INITIAL_TURN);
  const abortRef = useRef<AbortController | null>(null);
  const send = useCallback(async (request: TutorTurnRequest) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    return runTutorTurn(request, { signal: ac.signal, onState: setState });
  }, []);
  const stop = useCallback(() => abortRef.current?.abort(), []);
  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState(INITIAL_TURN);
  }, []);
  useEffect(() => () => abortRef.current?.abort(), []);
  return { state, send, stop, reset };
}

export type { ThreadKind };
