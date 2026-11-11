// The shell's Mic-live state mirrors the graph's state exactly (contracts §11: visible while open).
import { describe, expect, test } from "bun:test";
import type { MicState } from "@oak/audio";
import { bindMicState } from "./mic.ts";
import { useShell } from "./shell-store.ts";

function fakeGraph() {
  const subs = new Set<(s: MicState) => void>();
  let closed = 0;
  return {
    subscribe(cb: (s: MicState) => void) {
      subs.add(cb);
      cb("closed");
      return () => subs.delete(cb);
    },
    closeAll() {
      closed++;
      for (const cb of subs) cb("closed");
    },
    emit(s: MicState) {
      for (const cb of subs) cb(s);
    },
    get closed() {
      return closed;
    },
  };
}

describe("bindMicState", () => {
  test("live lights the dot and mutes UI sounds; anything else clears both; the dot's close closes the graph", () => {
    const g = fakeGraph();
    let suppressed = 0;
    let released = 0;
    const off = bindMicState(g, () => {
      suppressed++;
      return () => {
        released++;
      };
    });
    expect(useShell.getState().micLive).toBe(false);
    g.emit("opening");
    expect(useShell.getState().micLive).toBe(false);
    g.emit("live");
    expect(useShell.getState().micLive).toBe(true);
    expect(suppressed).toBe(1);
    g.emit("live");
    expect(suppressed).toBe(1);
    useShell.getState().closeMic?.();
    expect(g.closed).toBe(1);
    expect(useShell.getState().micLive).toBe(false);
    expect(useShell.getState().closeMic).toBeNull();
    expect(released).toBe(1);
    g.emit("live");
    g.emit("denied");
    expect(useShell.getState().micLive).toBe(false);
    expect(released).toBe(2);
    off();
  });
});
