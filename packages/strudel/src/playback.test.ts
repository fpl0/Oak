// `playEvents` resolves `done` for every plan, including one whose events all fit in the first look-ahead
// (a single note or chord: sing cues, one-note listen blocks). superdough is mocked; no audio runs.
import { describe, expect, mock, test } from "bun:test";

mock.module("@strudel/webaudio", () => ({ superdough: () => Promise.resolve() }));

const { playEvents } = await import("./playback.ts");

function fakeRuntime() {
  const ctx = { currentTime: 0 };
  const triggered: unknown[] = [];
  const rt = {
    ctx,
    coordinator: { claim: () => () => undefined },
    preload: async () => undefined,
    unlock: async () => true,
    noteTrigger: (v: unknown) => triggered.push(v),
  };
  return { rt, ctx, triggered };
}

describe("playEvents done", () => {
  test("a one-note plan resolves done after its end", async () => {
    const { rt, triggered } = fakeRuntime();
    const plan = {
      events: [{ at: 0, dur: 0.05, value: { note: 60, s: "piano" } }],
      durationSec: 0.05,
      preload: [],
    };
    // biome-ignore lint/suspicious/noExplicitAny: a minimal runtime stand-in for the test
    const h = playEvents(rt as any, plan as any, { at: 0 });
    const settled = await Promise.race([
      h.done.then(() => "done"),
      new Promise((r) => setTimeout(() => r("hung"), 1000)),
    ]);
    expect(settled).toBe("done");
    expect(triggered).toHaveLength(1);
  });

  test("stop resolves done at once", async () => {
    const { rt } = fakeRuntime();
    const plan = { events: [{ at: 5, dur: 1, value: { note: 60 } }], durationSec: 6, preload: [] };
    // biome-ignore lint/suspicious/noExplicitAny: a minimal runtime stand-in for the test
    const h = playEvents(rt as any, plan as any, { at: 0 });
    h.stop();
    await h.done;
    expect(true).toBe(true);
  });
});
