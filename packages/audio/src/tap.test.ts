import { describe, expect, test } from "bun:test";
import { FakeContext } from "./fakes.test-data.ts";
import { createTapInput, eventTimeToContextTime, laneKeyCode, tapsToOnsets } from "./tap.ts";

function key(
  target: EventTarget,
  code: string,
  timeStamp: number,
  extra: Record<string, unknown> = {},
): boolean {
  let prevented = false;
  const e = new Event("keydown", { cancelable: true });
  const fields = { code, repeat: false, metaKey: false, ctrlKey: false, altKey: false, timeStamp, ...extra };
  for (const [k, v] of Object.entries(fields)) Object.defineProperty(e, k, { value: v });
  Object.defineProperty(e, "preventDefault", { value: () => (prevented = true) });
  target.dispatchEvent(e);
  return prevented;
}

describe("eventTimeToContextTime", () => {
  test("maps through the getOutputTimestamp pair", () => {
    const ctx = { currentTime: 3, getOutputTimestamp: () => ({ contextTime: 2.95, performanceTime: 5000 }) };
    expect(eventTimeToContextTime(ctx, 5100)).toBeCloseTo(3.05, 9);
    expect(eventTimeToContextTime(ctx, 4900)).toBeCloseTo(2.85, 9);
  });
  test("falls back to currentTime and performance.now() without a timestamp pair", () => {
    const ctx = { currentTime: 3, getOutputTimestamp: () => ({ contextTime: 0, performanceTime: 0 }) };
    expect(eventTimeToContextTime(ctx, 900, 1000)).toBeCloseTo(2.9, 9);
  });
});

describe("createTapInput", () => {
  test("Space taps only while armed, minus the latency; prevented so the page does not scroll", () => {
    const ctx = new FakeContext();
    ctx.currentTime = 2; // performanceTime 3000 ↔ contextTime 2
    const target = new EventTarget();
    const input = createTapInput(ctx as unknown as AudioContext, { target, latencyMs: 30 });
    expect(key(target, "Space", 3100)).toBe(false);
    expect(input.taps()).toEqual([]);
    const seen: number[] = [];
    input.onTap((t) => seen.push(t.time));
    input.arm();
    expect(key(target, "Space", 3100)).toBe(true);
    expect(key(target, "Space", 3200, { repeat: true })).toBe(false);
    expect(key(target, "KeyF", 3300)).toBe(false);
    expect(input.taps().length).toBe(1);
    expect(input.taps()[0]?.time).toBeCloseTo(2.1 - 0.03, 9);
    expect(seen.length).toBe(1);
    input.setLatency(0);
    input.tapAt(0, 3500);
    expect(input.taps()[1]?.time).toBeCloseTo(2.5, 9);
    input.disarm();
    expect(input.tapAt(0, 3600)).toBe(null);
    input.dispose();
  });

  test("two voices: F is voice 0, J is voice 1; Space is not a tap then", () => {
    const ctx = new FakeContext();
    const target = new EventTarget();
    const input = createTapInput(ctx as unknown as AudioContext, { target });
    input.arm({ twoVoices: true });
    key(target, "KeyF", 1100);
    key(target, "KeyJ", 1200);
    key(target, "Space", 1300);
    expect(input.taps().map((t) => t.voice)).toEqual([0, 1]);
    input.arm(); // re-arming clears
    expect(input.taps()).toEqual([]);
  });

  test("two lanes with their own keys (TapLane.key): those keys are the voices, F and J are not", () => {
    expect(laneKeyCode("d")).toBe("KeyD");
    expect(laneKeyCode("K")).toBe("KeyK");
    expect(laneKeyCode("4")).toBe("Digit4");
    expect(laneKeyCode("Semicolon")).toBe("Semicolon");
    expect(laneKeyCode(" ")).toBeNull();
    const ctx = new FakeContext();
    const target = new EventTarget();
    const input = createTapInput(ctx as unknown as AudioContext, { target });
    input.arm({ twoVoices: true, keys: ["d", "k"] });
    expect(key(target, "KeyD", 1100)).toBe(true);
    key(target, "KeyK", 1200);
    key(target, "KeyF", 1300);
    key(target, "KeyJ", 1400);
    expect(input.taps().map((t) => t.voice)).toEqual([0, 1]);
    // The same key twice, or Space, falls back to F and J.
    input.arm({ twoVoices: true, keys: ["f", "f"] });
    key(target, "KeyF", 1500);
    key(target, "KeyJ", 1600);
    expect(input.taps().map((t) => t.voice)).toEqual([0, 1]);
    input.arm({ twoVoices: true, keys: ["Space", "j"] });
    key(target, "Space", 1700);
    expect(input.taps()).toEqual([]);
    // One lane's keys are forgotten when the pad is armed for a single voice.
    input.arm();
    key(target, "KeyD", 1800);
    key(target, "Space", 1900);
    expect(input.taps().map((t) => t.voice)).toEqual([0]);
    input.dispose();
  });

  test("keys typed into a text field are not taps", () => {
    const ctx = new FakeContext();
    const target = new EventTarget();
    const input = createTapInput(ctx as unknown as AudioContext, { target });
    input.arm();
    expect(key(target, "Space", 1100, { target: { tagName: "TEXTAREA" } })).toBe(false);
    key(target, "Space", 1150, { target: { tagName: "DIV", isContentEditable: true } });
    expect(input.taps()).toEqual([]);
    key(target, "Space", 1200, { target: { tagName: "BUTTON" } });
    expect(input.taps().length).toBe(1);
  });
});

test("tapsToOnsets: seconds to cycles from the start, with latency and an optional grid", () => {
  // 120 BPM 4/4: cps 0.5; taps at the beats of bar 1, a little late.
  const taps = [10.02, 10.51, 11.03, 11.49];
  expect(tapsToOnsets(taps, { startTime: 10, cps: 0.5, latencyMs: 20, grid: 8 })).toEqual([
    0, 0.25, 0.5, 0.75,
  ]);
  expect(tapsToOnsets([10.5], { startTime: 10, cps: 0.5 })).toEqual([0.25]);
});
