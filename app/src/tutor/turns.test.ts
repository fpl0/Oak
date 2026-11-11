import { afterEach, describe, expect, test } from "bun:test";
import type { TutorTurnRequest } from "@oak/api";
import { reduceTurn, startTurn, type TurnState } from "../lib/tutor-stream.ts";
import {
  dismissTurn,
  onTurns,
  resetTurns,
  retryTurn,
  sendTurn,
  setTurnRunner,
  settleThread,
  stopTurn,
  streamingTurn,
  turnsOf,
  useTurns,
} from "./turns.ts";

const req: TutorTurnRequest = {
  thread: { subjectKind: "lesson", subjectId: "U01.L01" },
  kind: "hint",
  userText: "Give me a nudge.",
  lessonId: "U01.L01",
  stepId: "S6",
};
const usage = {
  backend: "claude-cli" as const,
  requests: 1,
  inputTokens: 1,
  outputTokens: 1,
  cacheReadInputTokens: 0,
  cacheCreationInputTokens: 0,
  cacheCreation1hInputTokens: 0,
  cacheCreation5mInputTokens: 0,
  costUsd: null,
  includedInPlan: true,
  servedBy: [],
};
const meta = {
  conversationId: "lesson:U01.L01:2026-11-11:hint",
  kind: "hint" as const,
  lane: "hint" as const,
  backend: "claude-cli" as const,
  model: "claude-opus-5-5",
  rung: 2 as const,
  revealAllowed: false,
};

afterEach(() => {
  resetTurns();
  setTurnRunner(null);
});

describe("turns", () => {
  test("a turn streams into the store, reports meta once and finishes", async () => {
    setTurnRunner(async (_r, opts) => {
      let s: TurnState = startTurn();
      for (const e of [
        { type: "meta", data: meta },
        { type: "text", data: { delta: "Listen to bar 2." } },
        { type: "done", data: { stopReason: "end_turn", backend: "claude-cli", iterations: 1, usage } },
      ] as const) {
        s = reduceTurn(s, e);
        opts.onState?.(s);
      }
      return s;
    });
    const metas: number[] = [];
    const finished: string[] = [];
    onTurns({ meta: (_t, m) => metas.push(m.rung ?? -1), finished: (t) => finished.push(t.state.status) });
    const t = await sendTurn(req, "Give me a nudge", () => 100);
    expect(t.state.text).toBe("Listen to bar 2.");
    expect(metas).toEqual([2]);
    expect(finished).toEqual(["done"]);
    expect(turnsOf(useTurns.getState().turns, req.thread)).toHaveLength(1);
    // The timeline read after the turn ended holds it now: the live copy goes.
    settleThread(req.thread, 50);
    expect(useTurns.getState().turns).toHaveLength(1);
    settleThread(req.thread, 150);
    expect(useTurns.getState().turns).toHaveLength(0);
  });

  test("Stop aborts the streaming turn; a failed turn stays until retried or dismissed", async () => {
    setTurnRunner(
      (_r, opts) =>
        new Promise((resolve) => {
          let s = reduceTurn(startTurn(), { type: "text", data: { delta: "Slowly" } });
          opts.onState?.(s);
          opts.signal?.addEventListener("abort", () => {
            s = reduceTurn(s, { type: "error", data: { kind: "aborted", message: "Stopped." } });
            resolve(s);
          });
        }),
    );
    const running = sendTurn(req, "Give me a nudge");
    await Bun.sleep(0);
    expect(streamingTurn()?.state.text).toBe("Slowly");
    expect(stopTurn()).toBe(true);
    const t = await running;
    expect(t.state.error?.kind).toBe("aborted");
    expect(stopTurn()).toBe(false);
    settleThread(req.thread, Date.now() + 1000);
    expect(useTurns.getState().turns).toHaveLength(1);

    setTurnRunner(async (_r, opts) => {
      const s = reduceTurn(startTurn(), {
        type: "done",
        data: { stopReason: "end_turn", backend: "claude-cli", iterations: 1, usage },
      });
      opts.onState?.(s);
      return s;
    });
    const again = await retryTurn(t.id);
    expect(again?.request).toEqual(req);
    expect(useTurns.getState().turns.map((x) => x.state.status)).toEqual(["done"]);
    dismissTurn(again?.id ?? 0);
    expect(useTurns.getState().turns).toHaveLength(0);
  });

  test("Retry waits while another turn streams: one stream at a time (review)", async () => {
    setTurnRunner(async (_r, opts) => {
      const s = reduceTurn(startTurn(), { type: "error", data: { kind: "overloaded", message: "busy" } });
      opts.onState?.(s);
      return s;
    });
    const failed = await sendTurn(req, "Give me a nudge.");
    let release: (s: TurnState) => void = () => {};
    setTurnRunner(
      (_r, opts) =>
        new Promise<TurnState>((resolve) => {
          opts.onState?.(startTurn());
          release = resolve;
        }),
    );
    const slow = sendTurn(req, "Another question");
    await Bun.sleep(0);
    expect(streamingTurn()).not.toBeNull();
    expect(retryTurn(failed.id)).toBeNull();
    expect(useTurns.getState().turns.some((t) => t.id === failed.id)).toBe(true);
    release(
      reduceTurn(startTurn(), {
        type: "done",
        data: { stopReason: "end_turn", backend: "claude-cli", iterations: 1, usage },
      }),
    );
    await slow;
    expect(retryTurn(failed.id)).not.toBeNull();
  });
});
