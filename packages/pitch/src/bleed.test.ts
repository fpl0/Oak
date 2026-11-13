// Runtime bleed detection (contracts §8.6): the rule over listed notes and over frames annotated with what Oak's
// output played; the playback-only spans; the sung grade failing with `sing.bleed`; the one-frame watch.
import { describe, expect, test } from "bun:test";
import {
  annotatePlayback,
  BleedWatch,
  bleedReport,
  PLAYBACK_LAG_SEC,
  PlaybackHistory,
  playbackPitch,
} from "./bleed.ts";
import { frames, PROFILE, SING_TOL } from "./fixtures.test-data.ts";
import { midiToHz } from "./math.ts";
import { detectBleed, gradeSung } from "./sung.ts";
import type { PitchFrame } from "./types.ts";

/** Output frames: a clear pitch over `[from, to)` (frame time = window end, like the worklet). */
function output(midi: number, from: number, to: number, until: number): PitchFrame[] {
  return frames([{ midi, from, to, rms: 0.2 }], until);
}

describe("playback history", () => {
  test("a clear, audible output frame has a pitch; quiet or unclear ones do not", () => {
    expect(playbackPitch({ t: 1, hz: midiToHz(60), clarity: 0.95, rms: 0.1 })).toBeCloseTo(60, 6);
    expect(playbackPitch({ t: 1, hz: midiToHz(60), clarity: 0.5, rms: 0.1 })).toBeNull();
    expect(playbackPitch({ t: 1, hz: midiToHz(60), clarity: 0.95, rms: 1e-5 })).toBeNull();
    expect(playbackPitch({ t: 1, hz: 0, clarity: 0, rms: 0.1 })).toBeNull();
  });
  test("at(t): the distinct pitches of the last lag, newest first", () => {
    const h = new PlaybackHistory();
    for (const f of output(60, 0, 1, 1)) h.push(f);
    for (const f of output(67, 1, 2, 2).filter((f) => f.t > 1.05)) h.push(f);
    const now = h.at(1.15);
    expect(now.length).toBe(2);
    expect(now[0]).toBeCloseTo(67, 6);
    expect(now[1]).toBeCloseTo(60, 6);
    expect(h.at(1.9)).toHaveLength(1);
    expect(h.at(5)).toEqual([]);
    expect(h.pitchedSec(0, 2)).toBeGreaterThan(1.5);
  });
  test("annotatePlayback fills `playing` from the output frames, with the lag", () => {
    const mic = frames([{ midi: null, from: 0, to: 2 }], 2);
    const out = annotatePlayback(mic, output(62, 0.5, 1, 2));
    const at = (t: number) => out.find((f) => f.t >= t)?.playing ?? null;
    expect(at(0.3)).toEqual([]);
    expect(at(0.8)?.[0]).toBeCloseTo(62, 6);
    // The output stopped at 1 s; the mic still counts it for the lag (the speakers are late).
    expect(at(1.1 + PLAYBACK_LAG_SEC / 2)?.length).toBe(1);
    expect(at(1.6 + PLAYBACK_LAG_SEC)).toEqual([]);
  });
});

describe("the bleed rule", () => {
  const playing = [{ midi: 60, on: 0, off: 2 }];
  test("listed notes: more than 300 ms on the note is bleed, less is not, another note is not", () => {
    expect(detectBleed(frames([{ midi: 60.1, from: 0.2, to: 0.7 }], 2), playing)).toBe(true);
    expect(detectBleed(frames([{ midi: 60.1, from: 0.2, to: 0.45 }], 2), playing)).toBe(false);
    expect(detectBleed(frames([{ midi: 64, from: 0.2, to: 1.5 }], 2), playing)).toBe(false);
    // Any octave: leaky headphones carry the bass an octave or two down.
    expect(detectBleed(frames([{ midi: 48.2, from: 0.2, to: 1 }], 2), playing)).toBe(true);
  });
  test("annotated frames work without a note list", () => {
    const mic = annotatePlayback(frames([{ midi: 55, from: 0, to: 2 }], 2), output(55, 0, 2, 2));
    const r = bleedReport(mic);
    expect(r.bleed).toBe(true);
    expect(r.heardSec).toBeGreaterThan(1.5);
    expect(r.at).not.toBeNull();
  });
  test("singing windows are never playback-only: singing along in tune is not bleed", () => {
    const mic = annotatePlayback(frames([{ midi: 60, from: 0.5, to: 1.5 }], 2), output(60, 0.5, 1.5, 2));
    expect(bleedReport(mic, { singing: [{ on: 0.5, off: 1.5 }] }).bleed).toBe(false);
    expect(bleedReport(mic).bleed).toBe(true);
  });
  test("silence on the output is not a playback-only span", () => {
    const mic = annotatePlayback(frames([{ midi: 60, from: 0, to: 2 }], 2), []);
    const r = bleedReport(mic);
    expect(r).toEqual({ bleed: false, heardSec: 0, playbackOnlySec: 0, at: null });
  });
  test("the watch trips once and keeps its report", () => {
    const w = new BleedWatch();
    const mic = annotatePlayback(frames([{ midi: 57, from: 0, to: 1 }], 1), output(57, 0, 1, 1));
    let tripped = false;
    for (const f of mic) tripped = w.push(f);
    expect(tripped).toBe(true);
    expect(w.report.heardSec).toBeGreaterThan(0.6);
    w.reset();
    expect(w.report.bleed).toBe(false);
    // While the learner is asked to sing, nothing counts.
    for (const f of mic) w.push(f, true);
    expect(w.report.bleed).toBe(false);
  });
});

describe("gradeSung with what played", () => {
  const target = [{ midi: 60, on: 2.5, off: 3.5 }];
  const profile = { ...PROFILE, singLatencyMs: 0 };
  test("a silent learner whose mic hears the cue fails with sing.bleed, scores 0 and feeds no ladder", () => {
    // The cue (C4 for 1.5 s) leaks before the window; the leak's tail sounds like a sung 1 in it.
    const mic = frames([{ midi: 60, from: 0.2, to: 3.6 }], 4);
    const plain = gradeSung(mic, target, SING_TOL, "pitch", profile);
    expect(plain.pass).toBe(true);
    const listed = gradeSung(mic, target, SING_TOL, "pitch", profile, {
      playing: [{ midi: 60, on: 0.2, off: 1.7 }],
    });
    expect(listed.pass).toBe(false);
    expect(listed.score).toBe(0);
    expect(listed.medianAbsCents).toBeNull();
    expect(listed.diagnostics[0]?.id).toBe("sing.bleed");
    const annotated = annotatePlayback(mic, output(60, 0.2, 1.7, 4));
    const r = gradeSung(annotated, target, SING_TOL, "pitch", profile);
    expect(r.pass).toBe(false);
    expect(r.diagnostics.map((d) => d.id)).toContain("sing.bleed");
  });
  test("a learner who sings only in the window, with headphones that keep the cue out, passes", () => {
    const mic = frames([{ midi: 60.2, from: 2.45, to: 3.55 }], 4);
    const annotated = annotatePlayback(mic, output(60, 0.2, 1.7, 4));
    const r = gradeSung(annotated, target, SING_TOL, "pitch", profile);
    expect(r.pass).toBe(true);
    expect(r.diagnostics.map((d) => d.id)).not.toContain("sing.bleed");
  });
  test("frames nobody annotated grade exactly as before", () => {
    const mic = frames([{ midi: 60, from: 2.45, to: 3.55 }], 4);
    expect(gradeSung(mic, target, SING_TOL, "pitch", profile)).toEqual(
      gradeSung(mic, target, SING_TOL, "pitch", profile, {}),
    );
  });
});
