// Tap and sing capture logic: the reports come from the one grading rule of @oak/pitch.
import { describe, expect, test } from "bun:test";
import type { LearnerProfile } from "@oak/content-kit";
import type { PitchFrame } from "@oak/pitch";
import {
  centsText,
  DEFAULT_SING_TOL,
  fitNotes,
  foldTo,
  gradeLive,
  gradeTake,
  needleWords,
  noteMarkText,
  type SingNote,
  singFeedback,
  summarize,
  takeProblem,
  takeSeconds,
  traceOf,
} from "./sing.ts";
import { offsetWords, padPoint, tapReport, targetSeconds } from "./tap.ts";

const PROFILE: LearnerProfile = {
  rangeLow: 48,
  rangeHigh: 72,
  comfLow: 52,
  comfHigh: 67,
  tapLatencyMs: 0,
  tapJitterMs: 10,
  singLatencyMs: 0,
  singTolCents: 70,
  singTolMode: "auto",
  noiseFloorDb: -60,
  outputKind: "wired",
  inputKind: "builtin",
  quiet: false,
};

describe("tap pad geometry", () => {
  test("seconds to bar and position", () => {
    // 120 BPM in 4/4: one bar = 2 s, cps 0.5.
    expect(padPoint(10, 10, 0.5, 2)).toEqual({ bar: 0, pos: 0 });
    expect(padPoint(11, 10, 0.5, 2)).toEqual({ bar: 0, pos: 0.5 });
    expect(padPoint(12.5, 10, 0.5, 2)).toEqual({ bar: 1, pos: 0.25 });
    expect(padPoint(9.8, 10, 0.5, 2)).toEqual({ bar: 0, pos: 0 });
    expect(padPoint(9, 10, 0.5, 2)).toBeNull();
    expect(padPoint(15, 10, 0.5, 2)).toBeNull();
    expect(targetSeconds([0.5, 0, 0.25], 10, 0.5)).toEqual([10, 10.5, 11]);
  });
  test("offset words", () => {
    expect(offsetWords(4)).toBe("on the beat");
    expect(offsetWords(-32)).toBe("32 ms early");
    expect(offsetWords(41.4)).toBe("41 ms late");
  });
});

describe("tapReport (gradeTaps)", () => {
  // Quarter notes at 100 BPM for one bar, from t = 5 s.
  const targets = [0, 0.6, 1.2, 1.8].map((x) => 5 + x);

  test("a clean take passes with per-beat marks", () => {
    const offsets = [0.01, -0.012, 0.004, 0.008];
    const taps = targets.map((t, i) => t + (offsets[i] ?? 0));
    const r = tapReport(taps, targets, PROFILE);
    expect(r.result.pass).toBe(true);
    expect(r.feedback.state).toBe("correct");
    expect(r.pairs.map((p) => p.errorMs)).toEqual([10, -12, 4, 8]);
    expect(r.feedback.state === "correct" ? r.feedback.marks?.every((m) => m.ok) : false).toBe(true);
  });

  test("a missed beat and an extra tap are marked, and the line says how many matched", () => {
    const [t0 = 0, t1 = 0, , t3 = 0] = targets;
    const taps = [t0, t1, t1 + 0.3, t3];
    const r = tapReport(taps, targets, PROFILE);
    expect(r.result.pass).toBe(false);
    expect(r.missed).toEqual([2]);
    expect(r.extra).toEqual([2]);
    if (r.feedback.state !== "wrong") throw new Error("expected wrong");
    expect(r.feedback.message).toBe("3 of 4 beats matched, 1 extra.");
    expect(r.feedback.marks?.find((m) => m.part === 2)).toEqual({ part: 2, ok: false, note: "no tap here" });
    expect(r.feedback.marks?.find((m) => m.part === "extra:2")?.ok).toBe(false);
  });

  test("no taps at all", () => {
    const r = tapReport([], targets, PROFILE);
    expect(r.feedback).toMatchObject({
      state: "wrong",
      message: "No taps reached Oak. Tap with Space, or click the pad.",
    });
  });
});

/** Frames of a steady sung pitch: 512-sample hops at 48 kHz, as the worklet posts them. */
function steady(hz: number, from: number, to: number): PitchFrame[] {
  const hop = 512 / 48000;
  const out: PitchFrame[] = [];
  for (let t = from; t <= to; t += hop) out.push({ t, hz, clarity: 0.97, rms: 0.1 });
  return out;
}
const semis = (hz: number, n: number) => hz * 2 ** (n / 12);

describe("sing capture (gradeSung)", () => {
  const a4: SingNote[] = [{ midi: 69, at: 0.5, dur: 1.5, label: "A" }];

  test("targets move into the comfort range by whole octaves", () => {
    const { notes, shift } = fitNotes(a4, PROFILE);
    expect(shift).toBe(-12);
    expect(notes[0]?.midi).toBe(57);
    expect(takeSeconds(a4)).toBe(2);
  });

  test("440 Hz passes on A (folded per note); a semitone sharp fails", () => {
    const { notes } = fitNotes(a4, PROFILE);
    const start = 10;
    const pass = gradeTake(steady(440, start, start + 2.2), notes, start, DEFAULT_SING_TOL, "pitch", PROFILE);
    expect(pass.pass).toBe(true);
    expect(pass.notes[0]?.credit).toBe(1);
    expect(Math.abs(pass.notes[0]?.cents ?? 99)).toBeLessThan(5);
    const s = summarize(pass);
    expect(s).toHaveLength(1);
    expect(s[0]?.credit).toBe(1);
    expect(singFeedback(pass, ["A"]).state).toBe("correct");

    const sharp = gradeTake(
      steady(semis(440, 1), start, start + 2.2),
      notes,
      start,
      DEFAULT_SING_TOL,
      "pitch",
      PROFILE,
    );
    expect(sharp.pass).toBe(false);
    expect(sharp.notes[0]?.credit).toBe(0.5);
    expect(sharp.notes[0]?.feedback).toBe("sing.sharp");
    const fb = singFeedback(sharp, ["A"]);
    expect(fb).toMatchObject({ state: "wrong", message: "1 note was outside ±70¢." });
    expect(fb.state === "wrong" ? fb.marks?.[0]?.note : "").toBe("A: high, +100¢");
  });

  test("silence: Oak says it heard no voice", () => {
    const { notes } = fitNotes(a4, PROFILE);
    const quiet = steady(440, 0, 2.2).map((f) => ({ ...f, clarity: 0.2, rms: 0.0001 }));
    const r = gradeTake(quiet, notes, 0, DEFAULT_SING_TOL, "pitch", PROFILE);
    const fb = singFeedback(r);
    expect(fb.state).toBe("wrong");
    expect(fb.state === "wrong" ? fb.message : "").toMatch(/^Oak didn't hear a voice\..*Quiet mode/);
  });

  test("every take the tracker could not judge says why, and what to do next", () => {
    const say = (params: Record<string, unknown>) =>
      takeProblem([{ id: "sing.no-voice", params: { db: -70, ...params } }]);
    expect(say({ reason: "none" })).toMatchObject({ kind: "no-voice" });
    expect(say({ reason: "noisy" })).toMatchObject({
      kind: "too-noisy",
      text: expect.stringMatching(/quieter/),
    });
    expect(say({ reason: "short", ms: 140 })).toMatchObject({
      kind: "too-short",
      text: expect.stringMatching(/Hold each note/),
    });
    expect(takeProblem([{ id: "sing.clipped", params: { n: 40 } }])).toMatchObject({
      kind: "clipped",
      text: expect.stringMatching(/Turn the input down/),
    });
    expect(takeProblem([{ id: "sing.wrong-note", params: {} }])).toBeNull();
    for (const r of ["none", "noisy", "short"])
      expect(say({ reason: r })?.text).toMatch(/then try again|instead/);
  });

  test("live grading credits only the windows that have closed", () => {
    const notes: SingNote[] = [
      { midi: 57, at: 0.2, dur: 0.8 },
      { midi: 61, at: 1.0, dur: 0.8 },
    ];
    const frames = steady(220, 0, 1.0);
    const live = gradeLive(frames, notes, 0, DEFAULT_SING_TOL, "pitch", PROFILE, 1.0);
    expect(live.pass).toBe(false);
    expect(live.notes[0]?.credit).toBe(1);
    expect(live.notes[1]?.feedback).not.toBe("sing.missed");
  });

  test("the trace folds onto the active target and marks the octave", () => {
    const notes: SingNote[] = [{ midi: 57, at: 0, dur: 1 }];
    const trace = traceOf(steady(440, 0, 0.5), notes, 0, PROFILE);
    const voiced = trace.filter((p) => p.midi !== null);
    expect(voiced.length).toBeGreaterThan(10);
    expect(Math.abs((voiced.at(-1)?.midi ?? 0) - 57)).toBeLessThan(0.05);
    expect(voiced.at(-1)?.folded).toBe(-1);
  });

  test("a sung pattern folds the whole take once: a held 1 stays under 3 and 5, never above them", () => {
    // 1 3 5 in C4: a voice holding C4 the whole time.
    const notes: SingNote[] = [
      { midi: 60, at: 0, dur: 0.5 },
      { midi: 64, at: 0.5, dur: 0.5 },
      { midi: 67, at: 1, dur: 0.5 },
    ];
    const frames = steady(261.63, 0, 1.5);
    const perNote = traceOf(frames, notes, 0, PROFILE).filter((p) => p.midi !== null);
    const global = traceOf(frames, notes, 0, PROFILE, "global").filter((p) => p.midi !== null);
    // Per-target folding drew the held C4 at C5, a fourth above the 5.
    expect(Math.max(...perNote.map((p) => p.midi as number))).toBeGreaterThan(70);
    for (const p of global) expect(Math.abs((p.midi as number) - 60)).toBeLessThan(0.1);
  });

  test("a mark a semitone or more away says 'another note', not folded cents", () => {
    expect(noteMarkText(440)).toBe("another note");
    expect(noteMarkText(-460)).toBe("another note");
    expect(noteMarkText(-60)).toBe("−60¢");
    expect(noteMarkText(null)).toBe("not heard");
  });

  test("folding, needle words and cents text", () => {
    expect(foldTo(69, 57)).toEqual({ midi: 57, octaves: -1 });
    expect(foldTo(45, 57)).toEqual({ midi: 57, octaves: 1 });
    expect(foldTo(63, 57)).toEqual({ midi: 63, octaves: 0 });
    expect(needleWords(null, 50)).toEqual({ words: "listening", arrow: "" });
    expect(needleWords(4, 50).words).toBe("spot on");
    expect(needleWords(-30, 50)).toEqual({ words: "a little low", arrow: "↑" });
    expect(needleWords(80, 50)).toEqual({ words: "high", arrow: "↓" });
    expect(centsText(12.4)).toBe("+12¢");
    expect(centsText(-30)).toBe("−30¢");
    expect(centsText(0.2)).toBe("0¢");
  });
});
