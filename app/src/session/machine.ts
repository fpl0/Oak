// The session machine (contracts §9.3, ux §1.3): idle → warmup → main → make → coda → done, with pause and
// resume. The zustand store (store.ts) holds where the learner is and is what block surfaces report into; this
// machine follows it (`SYNC`) and owns the life cycle around it: the moves allowed between blocks (forward
// only, nothing auto-advances into another lesson), pausing, ending the session on the server when the Coda
// opens (the Coda shows the summary `session.end` returns) and the final "Done for today".
//
// It runs no timers and touches no DOM: the runner (runner.ts) provides the `endSession` actor and the
// `onBlock` action (navigation, an immediate heartbeat). Unit-tested with fixture plans in machine.test.ts.
import type { Session, SessionPlan, SessionSummary } from "@oak/api";
import { assign, fromPromise, setup } from "xstate";
import type { SessionEndBody } from "./store.ts";
import type { SessionBlock } from "./types.ts";

/** The machine's state names for the blocks: the store's `new` is the server's `main` phase. */
export type FlowState = "warmup" | "main" | "make" | "coda";
export const FLOW_OF: Record<SessionBlock, FlowState> = {
  warmup: "warmup",
  new: "main",
  make: "make",
  coda: "coda",
};
const ORDER: Record<FlowState, number> = { warmup: 0, main: 1, make: 2, coda: 3 };

export interface SessionMachineContext {
  plan: SessionPlan | null;
  session: Session | null;
  /** What `session.end` answered (the Coda's cards). */
  summary: SessionSummary | null;
  /** Why ending failed, for the Coda's retry line. */
  endError: string | null;
  /** The body to send with `session.end`, captured when the Coda opens. */
  endBody: SessionEndBody | null;
}

export type SessionMachineEvent =
  | { type: "BEGIN"; plan: SessionPlan; session: Session; block: SessionBlock }
  /** The store's block changed (or a reload restored it). `null` once the Coda was reported done. */
  | { type: "SYNC"; block: SessionBlock | null; endBody: SessionEndBody }
  | { type: "PAUSE" }
  | { type: "RESUME" }
  | { type: "RETRY_END" }
  /** "Done for today". */
  | { type: "FINISH" }
  /** Leave without a Coda (the session stays open on the server and can be resumed today). */
  | { type: "ABANDON" };

export interface EndInput {
  sessionId: string;
  body: SessionEndBody;
}

export interface SessionMachineInput {
  /** A session already ended (the Coda was reloaded): the summary the runner kept. */
  summary?: SessionSummary | null;
}

export const sessionMachine = setup({
  types: {
    context: {} as SessionMachineContext,
    events: {} as SessionMachineEvent,
    input: {} as SessionMachineInput,
  },
  actors: {
    /** `POST /session/:id/end`. The runner provides the real one; tests provide a fake. */
    endSession: fromPromise<SessionSummary, EndInput>(async () => {
      throw new Error("endSession is not provided");
    }),
  },
  actions: {
    /** A block was entered (the runner navigates and sends a heartbeat at once). */
    onBlock: (_, _params: { block: FlowState }) => {},
    /** The session is over: the runner clears what it saved and records the day as done. */
    onDone: () => {},
    keepEndBody: assign({
      endBody: ({ context, event }) => (event.type === "SYNC" ? event.endBody : context.endBody),
    }),
  },
  guards: {
    isBlock: ({ context, event }, params: { to: FlowState }) =>
      event.type === "SYNC" &&
      event.block !== null &&
      context.session !== null &&
      FLOW_OF[event.block] === params.to,
    codaReported: (_, params: { to: SessionBlock | null }) => params.to === null,
  },
}).createMachine({
  id: "session",
  initial: "idle",
  context: ({ input }) => ({
    plan: null,
    session: null,
    summary: input.summary ?? null,
    endError: null,
    endBody: null,
  }),
  states: {
    idle: {
      on: {
        BEGIN: [
          {
            guard: ({ event }) => event.block === "warmup",
            target: "running.flow.warmup",
            actions: assign({ plan: ({ event }) => event.plan, session: ({ event }) => event.session }),
          },
          {
            guard: ({ event }) => event.block === "new",
            target: "running.flow.main",
            actions: assign({ plan: ({ event }) => event.plan, session: ({ event }) => event.session }),
          },
          {
            guard: ({ event }) => event.block === "make",
            target: "running.flow.make",
            actions: assign({ plan: ({ event }) => event.plan, session: ({ event }) => event.session }),
          },
          {
            target: "running.flow.coda",
            actions: assign({ plan: ({ event }) => event.plan, session: ({ event }) => event.session }),
          },
        ],
      },
    },
    running: {
      type: "parallel",
      on: { ABANDON: { target: "abandoned" } },
      states: {
        flow: {
          initial: "warmup",
          states: {
            warmup: {
              entry: { type: "onBlock", params: { block: "warmup" } },
              on: { SYNC: syncFrom("warmup") },
            },
            main: {
              entry: { type: "onBlock", params: { block: "main" } },
              on: { SYNC: syncFrom("main") },
            },
            make: {
              entry: { type: "onBlock", params: { block: "make" } },
              on: { SYNC: syncFrom("make") },
            },
            coda: {
              entry: { type: "onBlock", params: { block: "coda" } },
              initial: "ending",
              states: {
                ending: {
                  invoke: {
                    src: "endSession",
                    input: ({ context }) => ({
                      sessionId: context.session?.id ?? "",
                      body: context.endBody ?? {
                        wrappedEarly: false,
                        phaseMs: { warmup: 0, main: 0, make: 0, coda: 0 },
                      },
                    }),
                    onDone: {
                      target: "ready",
                      actions: assign({ summary: ({ event }) => event.output, endError: null }),
                    },
                    onError: {
                      target: "failed",
                      actions: assign({
                        endError: ({ event }) =>
                          event.error instanceof Error ? event.error.message : "The session didn't close.",
                      }),
                    },
                  },
                },
                failed: { on: { RETRY_END: "ending" } },
                ready: {},
              },
              on: {
                FINISH: { target: "#session.done" },
                SYNC: {
                  guard: { type: "codaReported", params: ({ event }) => ({ to: event.block }) },
                  target: "#session.done",
                },
              },
            },
          },
        },
        clock: {
          initial: "active",
          states: {
            active: { on: { PAUSE: "paused" } },
            paused: { on: { RESUME: "active" } },
          },
        },
      },
    },
    done: { type: "final", entry: "onDone" },
    abandoned: { type: "final" },
  },
});

/** The SYNC transitions of a block state: forward only, to the exact block the store is in. */
function syncFrom(from: Exclude<FlowState, "coda">) {
  return (["main", "make", "coda"] as const)
    .filter((t) => ORDER[t] > ORDER[from])
    .map((to) => ({
      guard: { type: "isBlock" as const, params: { to } },
      target: to,
      actions: "keepEndBody" as const,
    }));
}

/** The machine state as one word, for the UI and tests. */
export type RunnerStatus = "idle" | "warmup" | "main" | "make" | "ending" | "end-failed" | "coda" | "done";

export function statusOf(value: unknown): RunnerStatus {
  if (value === "idle") return "idle";
  if (value === "done" || value === "abandoned") return "done";
  if (typeof value === "object" && value !== null && "running" in value) {
    const running = (value as { running: { flow: unknown } }).running;
    const flow = running.flow;
    if (typeof flow === "string") return flow as RunnerStatus;
    if (typeof flow === "object" && flow !== null && "coda" in flow) {
      const coda = (flow as { coda: string }).coda;
      return coda === "ready" ? "coda" : coda === "failed" ? "end-failed" : "ending";
    }
  }
  return "idle";
}

/** Whether the machine's clock region is paused. */
export function isPausedValue(value: unknown): boolean {
  if (typeof value !== "object" || value === null || !("running" in value)) return false;
  return (value as { running: { clock: unknown } }).running.clock === "paused";
}
