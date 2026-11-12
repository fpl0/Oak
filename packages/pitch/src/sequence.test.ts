// Sung sequences on realistic audio (the corpus singer through the worklet DSP path): degree patterns and
// sight-singing with a late start, legato echoes with glides, latency compensation from the calibration, and the
// lenient first sung note (contracts §8.1 item 8).
import { describe, expect, test } from "bun:test";
import type { LearnerProfile, SingTolerance } from "@oak/content-kit";
import { type ClipPart, type NoteSpec, renderClip } from "./corpus.ts";
import { analyze, PROFILE, SING_TOL } from "./fixtures.test-data.ts";
import { gradeSung, gradeSungLive } from "./sung.ts";
import type { PitchFrame, SungTarget } from "./types.ts";

const tol = (over: Partial<SingTolerance> = {}): SingTolerance => ({ ...SING_TOL, ...over });
const profile = (over: Partial<LearnerProfile> = {}): LearnerProfile => ({ ...PROFILE, ...over });

/** 1 2 3 5 1′ in C (C4 = 60), half a second each, from 0.5 s. */
const PATTERN = [60, 62, 64, 67, 72];
const targetsOf = (midis: readonly number[], start = 0.5, dur = 0.5): SungTarget[] =>
  midis.map((midi, i) => ({ midi, on: start + i * dur, off: start + (i + 1) * dur }));

/** The corpus singer (a tenor on "ah") sings `notes`, starting at `start` seconds; `legato` in one breath. */
function sing(
  notes: readonly (Partial<NoteSpec> & { midi: number; dur: number })[],
  start: number,
  o: { legato?: boolean; tail?: number } = {},
): PitchFrame[] {
  const parts: ClipPart[] = [{ kind: "gap", sec: start }];
  if (o.legato) parts.push({ kind: "phrase", legato: true, glideSec: 0.07, notes: [...notes] });
  else for (const n of notes) parts.push({ kind: "phrase", notes: [n] });
  parts.push({ kind: "gap", sec: o.tail ?? 0.6 });
  const clip = renderClip({
    id: `seq/${start}/${notes.map((n) => n.midi).join("-")}/${o.legato ? "l" : "s"}`,
    cls: "glide-legato",
    rangeLow: 48,
    timbre: { vowel: "a" },
    parts,
  });
  return analyze(clip.samples, clip.sampleRate);
}

describe("degree patterns and sight-singing (timed modes)", () => {
  const notes = PATTERN.map((midi) => ({ midi, dur: 0.5, vibrato: { rateHz: 5.5, cents: 25 } }));

  test("on time: every note in tune, no shift", () => {
    const r = gradeSung(sing(notes, 0.5, { legato: true }), targetsOf(PATTERN), tol(), "degree", PROFILE);
    expect(r.notes.map((n) => n.credit)).toEqual([1, 1, 1, 1, 1]);
    expect(r.pass).toBe(true);
    expect(r.startShiftSec).toBe(0);
  });

  test("a late start (0.3 s, legato) keeps the pitch credit of every note", () => {
    const frames = sing(notes, 0.8, { legato: true });
    const r = gradeSung(frames, targetsOf(PATTERN), tol(), "degree", PROFILE);
    expect(r.notes.map((n) => n.credit)).toEqual([1, 1, 1, 1, 1]);
    expect(r.pass).toBe(true);
    expect(r.startShiftSec ?? 0).toBeGreaterThan(0.25);
    expect(r.startShiftSec ?? 0).toBeLessThan(0.35);
  });

  test("sight-singing late: pitch credited, timing still judged from the beat", () => {
    const frames = sing(notes, 0.8, { legato: true });
    const r = gradeSung(frames, targetsOf(PATTERN), tol({ onsetMs: 100 }), "sight", PROFILE);
    expect(r.notes.map((n) => n.credit)).toEqual([1, 1, 1, 1, 1]);
    // Every onset is about 300 ms late: no timing credit, and the learner is told.
    expect(r.notes.every((n) => n.timingCredit === 0)).toBe(true);
    const late = r.diagnostics.filter((d) => d.id === "sing.late");
    expect(late.length).toBe(5);
    expect(Number(late[0]?.params?.ms)).toBeGreaterThan(220);
    expect(r.score).toBeCloseTo(0.75, 2);
    // On time, the same take earns the timing too.
    const onTime = gradeSung(
      sing(notes, 0.5, { legato: true }),
      targetsOf(PATTERN),
      tol({ onsetMs: 100 }),
      "sight",
      PROFILE,
    );
    expect(onTime.dims.timing?.score ?? 0).toBeGreaterThanOrEqual(0.9);
  });

  test("a wrong note stays wrong after the shift (the shift never buys credit for a wrong pitch)", () => {
    const wrong = notes.map((n, i) => (i === 2 ? { ...n, midi: 67 } : n)); // 5 instead of 3
    const r = gradeSung(sing(wrong, 0.8, { legato: true }), targetsOf(PATTERN), tol(), "degree", PROFILE);
    expect(r.notes.map((n) => n.credit)).toEqual([1, 1, 0, 1, 1]);
    expect(r.notes[2]?.feedback).toBe("sing.wrong-note");
  });

  test("the calibrated sing latency is removed before anything else", () => {
    // The learner's voice reaches the mic 150 ms after they mean it (Bluetooth): with the calibration it is on time.
    const frames = sing(notes, 0.65, { legato: true });
    const r = gradeSung(
      frames,
      targetsOf(PATTERN),
      tol({ onsetMs: 100 }),
      "sight",
      profile({ singLatencyMs: 150 }),
    );
    expect(r.startShiftSec).toBe(0);
    expect(r.dims.timing?.score ?? 0).toBeGreaterThanOrEqual(0.9);
    expect(r.pass).toBe(true);
  });

  test("live: the per-note credit grows with the take and agrees with the final grade", () => {
    const frames = sing(notes, 0.8, { legato: true });
    const final = gradeSung(frames, targetsOf(PATTERN), tol(), "degree", PROFILE);
    const mid = gradeSungLive(
      frames.filter((f) => f.t <= 2.0),
      targetsOf(PATTERN),
      tol(),
      "degree",
      PROFILE,
      2.0,
    );
    expect(mid.notes.slice(0, 2).map((n) => n.credit)).toEqual([1, 1]);
    expect(mid.notes.slice(3).every((n) => n.feedback === null)).toBe(true);
    expect(mid.pass).toBe(false);
    expect(final.pass).toBe(true);
  });
});

describe("free modes: legato echo with glides", () => {
  test("a legato echo with portamento segments into its notes and passes", () => {
    const melody = [60, 64, 62, 65, 64, 60];
    const frames = sing(
      melody.map((midi) => ({ midi, dur: 0.4 })),
      0.4,
      { legato: true },
    );
    const r = gradeSung(frames, targetsOf(melody, 0.4, 0.4), tol(), "echo", PROFILE);
    expect(r.notes.map((n) => n.credit)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(r.pass).toBe(true);
  });

  test("repeated notes on 'da' are counted as separate notes", () => {
    const melody = [62, 62, 64, 64];
    const frames = sing(
      melody.map((midi) => ({ midi, dur: 0.32, consonant: "d" as const })),
      0.4,
    );
    const r = gradeSung(frames, targetsOf(melody, 0.45, 0.37), tol(), "echo", PROFILE);
    expect(r.notes.map((n) => n.credit)).toEqual([1, 1, 1, 1]);
  });
});

describe("the lenient first sung note", () => {
  const LENIENT = tol({ lenient: true, cents: "learner" });
  const T: SungTarget[] = [{ midi: 60, on: 0.3, off: 1.9 }];

  test("any sustained pitch within ±100¢, any octave, passes; the ladder is ignored", () => {
    for (const [midi, ok] of [
      [60, true],
      [60.8, true], // 80 cents sharp: outside every rung of the ladder, inside the lenient band
      [72, true], // an octave up
      [48.3, true],
      [62, false], // a whole tone off
    ] as const) {
      const r = gradeSung(
        sing([{ midi, dur: 1.2 }], 0.5),
        T,
        LENIENT,
        "pitch",
        profile({ singTolCents: 25 }),
      );
      expect({ midi, pass: r.pass }).toEqual({ midi, pass: ok });
      if (!ok) expect(r.notes[0]?.feedback).toBe("sing.wrong-note");
      expect(r.medianAbsCents).toBeNull();
    }
  });

  test("a late start passes; a short blip does not", () => {
    const late = gradeSung(sing([{ midi: 60, dur: 0.9 }], 2.1, { tail: 0.3 }), T, LENIENT, "pitch", PROFILE);
    expect(late.pass).toBe(true);
    // "Sustained" is a voiced share of at least `minCoverage` (0.4) over 600 ms: 0.15 s is not.
    const blip = gradeSung(sing([{ midi: 60, dur: 0.15 }], 0.6), T, LENIENT, "pitch", PROFILE);
    expect(blip.pass).toBe(false);
    expect(blip.notes[0]?.feedback).toBe("sing.missed");
  });

  test("silence: missed, and the no-voice diagnostic says so", () => {
    const r = gradeSung(sing([], 2), T, LENIENT, "pitch", PROFILE);
    expect(r.pass).toBe(false);
    expect(r.diagnostics[0]?.id).toBe("sing.no-voice");
  });
});
