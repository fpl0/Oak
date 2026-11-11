// Tracking and segmentation: voicing gate, median of 5, octave repair, onsets at the window centre.
import { describe, expect, test } from "bun:test";
import { analyze, frames, HALF_WINDOW, HOP, PROFILE, SR } from "./fixtures.test-data.ts";
import { midiName, midiToHz } from "./math.ts";
import { concat, SUNG_NOTES, silence, sungSequence, tone } from "./synth.ts";
import { isLowVoice, PitchTracker, pitchFramesToNotes, trackerOptionsFor } from "./tracker.ts";
import type { PitchFrame } from "./types.ts";

describe("sung A3 – C#4 – E4 through the real DSP path (spike S5 fixture)", () => {
  for (const legato of [false, true]) {
    test(legato ? "legato: split on the pitch jump alone" : "detached notes", () => {
      const notes = pitchFramesToNotes(analyze(sungSequence(SR, { legato })));
      expect(notes.map((n) => midiName(n.midi))).toEqual(["A3", "C#4", "E4"]);
      notes.forEach((n, i) => {
        const truth = SUNG_NOTES[i] as (typeof SUNG_NOTES)[number];
        expect(Math.abs(n.midi - truth.midi) * 100).toBeLessThan(5);
        // Onsets at the window centre: within one hop plus the median lag of a pitch-change split.
        if (!legato || i === 0) expect(Math.abs(n.start - truth.start)).toBeLessThan(0.03);
        else expect(Math.abs(n.start - truth.start)).toBeLessThan(0.06);
        expect(Math.abs(n.end - (truth.start + truth.dur))).toBeLessThan(legato && i < 2 ? 0.12 : 0.04);
      });
    });
  }

  test("the onset is the window centre, not the frame time (a raw frame time is ~43 ms late)", () => {
    const sig = concat([
      silence(0.5, SR, -60),
      tone({ hz: 220, seconds: 0.6, sampleRate: SR, wave: "voice", amp: 0.4 }),
    ]);
    const fr = analyze(sig);
    const [note] = pitchFramesToNotes(fr);
    expect(note).toBeDefined();
    expect(Math.abs((note?.start ?? 0) - 0.5)).toBeLessThan(0.025);
    const firstVoiced = fr.find((f) => f.clarity >= 0.9) as PitchFrame;
    expect(firstVoiced.t - 0.5).toBeGreaterThan(0.015);
  });
});

describe("PitchTracker", () => {
  test("vibrato of ±40¢ stays one note, read at its centre pitch", () => {
    const fr = frames(
      [{ midi: 60, from: 0.1, to: 1.1, wobble: (t) => 40 * Math.sin(2 * Math.PI * 5.5 * t) }],
      1.3,
    );
    const notes = pitchFramesToNotes(fr);
    expect(notes.length).toBe(1);
    expect(Math.abs((notes[0]?.midi ?? 0) - 60) * 100).toBeLessThan(8);
    expect(notes[0]?.centsSpread).toBeGreaterThan(20);
  });

  test("a 2-frame octave error is folded back; it does not split the note", () => {
    const fr = frames([{ midi: 57, from: 0.1, to: 0.8 }], 1);
    const i = 30;
    for (const k of [i, i + 1]) (fr[k] as PitchFrame).hz = midiToHz(69);
    const tracker = new PitchTracker();
    const tracked = fr.map((f) => tracker.push(f));
    for (const k of [i, i + 1]) expect(Math.abs((tracked[k]?.midi ?? 0) - 57)).toBeLessThan(0.01);
    const notes = tracker.flush();
    expect(notes.length).toBe(1);
    expect(Math.round(notes[0]?.midi ?? 0)).toBe(57);
  });

  test("an octave jump that stays is a real change of register: a new note at the new octave", () => {
    const fr = frames(
      [
        { midi: 57, from: 0.1, to: 0.6 },
        { midi: 69, from: 0.6, to: 1.2 },
      ],
      1.4,
    );
    const notes = pitchFramesToNotes(fr);
    expect(notes.map((n) => Math.round(n.midi))).toEqual([57, 69]);
    expect(Math.abs((notes[1]?.start ?? 0) - 0.6)).toBeLessThan(0.03);
  });

  test("octave repair can be turned off", () => {
    const fr = frames([{ midi: 57, from: 0.1, to: 0.8 }], 1);
    for (const k of [30, 31, 32]) (fr[k] as PitchFrame).hz = midiToHz(69);
    const tracker = new PitchTracker({ octaveRepairFrames: 0 });
    const tracked = fr.map((f) => tracker.push(f));
    expect(tracked.slice(30, 33).some((f) => (f.midi ?? 0) > 60)).toBe(true);
  });

  test("single-frame outliers do not split or shift a note (median of 5)", () => {
    const fr = frames([{ midi: 64, from: 0.1, to: 0.9 }], 1);
    for (const k of [20, 40, 60]) (fr[k] as PitchFrame).hz = midiToHz(71);
    const notes = pitchFramesToNotes(fr);
    expect(notes.length).toBe(1);
    expect(Math.abs((notes[0]?.midi ?? 0) - 64)).toBeLessThan(0.01);
  });

  test("quiet frames below the RMS gate and unclear frames are unvoiced", () => {
    const quiet = frames([{ midi: 60, from: 0.1, to: 0.9, rms: 10 ** (-50 / 20) }], 1);
    expect(pitchFramesToNotes(quiet)).toEqual([]);
    const murky = frames([{ midi: 60, from: 0.1, to: 0.9 }], 1).map((f) => ({
      ...f,
      clarity: f.hz ? 0.85 : 0.2,
    }));
    expect(pitchFramesToNotes(murky)).toEqual([]);
    // The low-voice gate (0.85) accepts it.
    expect(pitchFramesToNotes(murky, { clarityMin: 0.85 }).length).toBe(1);
  });

  test("the noise floor raises the RMS gate to floor + 12 dB", () => {
    expect(trackerOptionsFor({ ...PROFILE, noiseFloorDb: -50 }).rmsMinDb).toBe(-38);
    expect(trackerOptionsFor({ ...PROFILE, noiseFloorDb: -80 }).rmsMinDb).toBe(-45);
    expect(trackerOptionsFor({ ...PROFILE, rangeLow: 43 }).clarityMin).toBe(0.85);
    expect(isLowVoice({ rangeLow: 52 })).toBe(false);
  });

  test("re-articulated notes on one pitch ('da da da') come out as separate notes", () => {
    const segs = [0, 1, 2].map((k) => ({ midi: 62, from: 0.1 + k * 0.4, to: 0.1 + k * 0.4 + 0.3 }));
    const fr = frames(segs, 1.4);
    // Fill the 100 ms gaps with a soft but voiced decay (no unvoiced gap: only a level dip).
    for (const f of fr)
      if (f.hz === 0 && f.t > 0.2 && f.t < 1.2)
        Object.assign(f, { hz: midiToHz(62), clarity: 0.95, rms: 0.01 });
    const notes = pitchFramesToNotes(fr);
    expect(notes.length).toBe(3);
  });

  test("minimum note length drops blips", () => {
    const fr = frames(
      [
        { midi: 60, from: 0.1, to: 0.15 },
        { midi: 64, from: 0.4, to: 0.9 },
      ],
      1,
    );
    expect(pitchFramesToNotes(fr).map((n) => Math.round(n.midi))).toEqual([64]);
  });

  test("incremental: notes close as they finish; openNote reports the note in progress", () => {
    const fr = frames(
      [
        { midi: 60, from: 0.1, to: 0.5 },
        { midi: 62, from: 0.6, to: 1.0 },
      ],
      1.2,
    );
    const tr = new PitchTracker();
    let sawOpen = false;
    for (const f of fr) {
      tr.push(f);
      if (f.t - HALF_WINDOW > 0.8 && f.t - HALF_WINDOW < 0.9) {
        expect(tr.notes().length).toBe(1);
        sawOpen = Math.round(tr.openNote()?.midi ?? 0) === 62;
      }
    }
    expect(sawOpen).toBe(true);
    expect(tr.flush().length).toBe(2);
    tr.reset();
    expect(tr.notes()).toEqual([]);
  });

  test("the hop is learned from the frames (44.1 kHz)", () => {
    const sig = concat([
      silence(0.3, 44100, -60),
      tone({ hz: 330, seconds: 0.5, sampleRate: 44100, wave: "voice", amp: 0.4 }),
    ]);
    const [note] = pitchFramesToNotes(analyze(sig, 44100), { windowSec: 2048 / 44100 });
    expect(Math.abs((note?.start ?? 0) - 0.3)).toBeLessThan(0.025);
    expect(HOP).toBeCloseTo(512 / 48000, 9);
  });
});
