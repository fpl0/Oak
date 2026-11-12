// Why a take could not be graded (Wave 3 review): a voice the room drowned read as "no voice", and 150 ms
// blips gave the same "sing closer to the microphone" advice as silence. `takeQuality` names the three
// cases apart, and flags clipped input, without touching the voicing gate (the corpus gate in
// corpus.test.ts and adversarial.test.ts still holds the accuracy numbers).
import { describe, expect, test } from "bun:test";
import type { LearnerProfile, SingTolerance } from "@oak/content-kit";
import { type ClipPart, type ClipSpec, type CorpusClip, renderClip, renderCorpus } from "./corpus.ts";
import { PROFILE, SING_TOL } from "./fixtures.test-data.ts";
import { analyzeClip, clipTrackerProfile, isWithheld } from "./gate.ts";
import { gradeSung } from "./sung.ts";
import { HOLD_SEC, takeQuality } from "./take.ts";
import type { PitchFrame, SungTarget } from "./types.ts";
import { WINDOW_SIZE } from "./types.ts";

const gap = (sec: number): ClipPart => ({ kind: "gap", sec });
const note = (midi: number, dur: number): ClipPart => ({ kind: "phrase", notes: [{ midi, dur }] });
const clip = (id: string, o: Partial<ClipSpec>): CorpusClip =>
  renderClip({ id, cls: "steady", rangeLow: 48, timbre: { vowel: "a" }, seed: 3, parts: [gap(1)], ...o });
const profileOf = (c: CorpusClip, floorDb = c.profile.noiseFloorDb): LearnerProfile => ({
  ...PROFILE,
  rangeLow: 48,
  noiseFloorDb: floorDb,
});
const heard = (c: CorpusClip, floorDb?: number) => takeQuality(analyzeClip(c), profileOf(c, floorDb));

/** Two held notes, A3 then C4. */
const PHRASE = [gap(0.3), note(57, 1.5), gap(0.3), note(60, 1), gap(0.3)];
/** Three 150 ms blips, 0.9 s apart (one to each target window below). */
const BLIPS = [gap(0.3), note(57, 0.15), gap(0.75), note(60, 0.15), gap(0.75), note(62, 0.15), gap(0.3)];

/** Targets on the frames' clock: each window starts where the clip's note does. */
function targetsAt(starts: number[], midis: number[], dur: number): SungTarget[] {
  const centre = WINDOW_SIZE / 2 / 48000;
  return midis.map((midi, i) => ({
    midi,
    on: (starts[i] as number) + centre,
    off: (starts[i] as number) + centre + dur,
  }));
}
const TIMED: SingTolerance = { ...SING_TOL, cents: 50 };

/** A take recorded too hot: amplified and hard-clipped at full scale. */
function hot(c: CorpusClip, gainDb: number): CorpusClip {
  const k = 10 ** (gainDb / 20);
  return { ...c, samples: c.samples.map((v) => Math.max(-1, Math.min(1, v * k))) };
}

describe("takeQuality: why nothing could be graded", () => {
  test("a clean voice is a voice, and not clipped", () => {
    const q = heard(clip("clean", { parts: PHRASE }));
    expect(q.heard).toBe("voice");
    expect(q.longestVoicedSec).toBeGreaterThan(1);
    expect(q.clipped).toBe(false);
  });

  test("a voice 6 dB above a calibrated room (white or pink noise) is too noisy, not 'no voice'", () => {
    for (const kind of ["white", "pink"] as const) {
      const q = heard(
        clip(`noisy-${kind}`, { levelDb: -20, parts: PHRASE, background: [{ kind, db: -26 }] }),
      );
      expect([kind, q.heard]).toEqual([kind, "too-noisy"]);
      expect(q.voicedFrames).toBe(0);
      expect(q.unclearVoiceSec).toBeGreaterThan(1);
    }
  });

  test("a room far louder than the stored floor, with no pitch in it, is too noisy", () => {
    const fan = clip("fan", { parts: [gap(2)], background: [{ kind: "fan", db: -40 }] });
    expect(heard(fan, -60).heard).toBe("too-noisy");
  });

  test("150 ms blips are too short (hold each note), not 'no voice'", () => {
    const q = heard(clip("blips", { parts: BLIPS }));
    expect(q.heard).toBe("too-short");
    expect(q.longestVoicedSec).toBeLessThan(HOLD_SEC);
    expect(q.voicedFrames).toBeGreaterThan(10);
  });

  test("silence, the calibrated room, breaths and clicks are no voice", () => {
    const take = [gap(2)];
    expect(heard(clip("silence", { parts: take })).heard).toBe("no-voice");
    expect(heard(clip("room", { parts: take, background: [{ kind: "fan", db: -50 }] })).heard).toBe(
      "no-voice",
    );
    for (const floor of [undefined, -60])
      for (const background of [
        [{ kind: "breaths" as const, db: -35 }],
        [{ kind: "clicks" as const, db: -30, perSec: 4 }],
      ])
        expect(heard(clip("noises", { parts: take, background }), floor).heard).toBe("no-voice");
  });

  test("the voice 12 dB above white noise still passes the gate (the gate is not loosened or tightened)", () => {
    const q = heard(clip("snr12", { levelDb: -12, parts: PHRASE, background: [{ kind: "white", db: -24 }] }));
    expect(q.heard).toBe("voice");
  });

  test("input that hits full scale is flagged as clipped; the analyser reports each window's peak", () => {
    const c = clip("hot", { parts: PHRASE });
    const frames = analyzeClip(c);
    expect(frames.every((f) => typeof f.peak === "number" && f.peak >= 0 && f.peak <= 1)).toBe(true);
    for (const db of [12, 24]) {
      const q = takeQuality(analyzeClip(hot(c, db)), profileOf(c));
      expect([db, q.clipped, q.heard]).toEqual([db, true, "voice"]);
      expect(q.clippedFrames).toBeGreaterThan(50);
    }
    // Frames from an older analyser (no peak): a full-scale RMS still reads as clipped.
    const old: PitchFrame[] = frames.map(({ peak: _p, ...f }) => ({ ...f, rms: 0.7 }));
    expect(takeQuality(old, profileOf(c)).clipped).toBe(true);
  });
});

describe("takeQuality over the whole tuning corpus", () => {
  test("every gated voice is a voice, every withheld (SNR 10) voice too noisy, every room no voice", () => {
    const tally = new Map<string, number>();
    for (const c of renderCorpus()) {
      const q = takeQuality(analyzeClip(c), clipTrackerProfile(c));
      const truth = !c.f0.some((x) => x > 0) ? "room" : isWithheld(c) ? "withheld" : "voice";
      const key = `${truth} -> ${q.heard}${q.clipped ? " (clipped)" : ""}`;
      tally.set(key, (tally.get(key) ?? 0) + 1);
    }
    expect(Object.fromEntries([...tally].sort())).toEqual({
      "room -> no-voice": 9,
      "voice -> voice": 80,
      "withheld -> too-noisy": 6,
    });
  }, 60_000);
});

describe("gradeSung says why, with the same code (sing.no-voice is still 'not an attempt')", () => {
  test("too noisy: sing.no-voice with reason noisy and the advice", () => {
    const c = clip("noisy", { levelDb: -20, parts: PHRASE, background: [{ kind: "white", db: -26 }] });
    const r = gradeSung(analyzeClip(c), targetsAt([0.3, 2.1], [57, 60], 0.9), TIMED, "degree", profileOf(c));
    const d = r.diagnostics[0];
    expect(d?.id).toBe("sing.no-voice");
    expect(d?.params.reason).toBe("noisy");
    expect(String(d?.params.more)).toContain("too much noise");
    expect(r.take?.heard).toBe("too-noisy");
  });

  test("blips: every note missed, so sing.no-voice with reason short names the longest sound", () => {
    const c = clip("blips", { parts: BLIPS });
    const r = gradeSung(
      analyzeClip(c),
      targetsAt([0.3, 1.2, 2.1], [57, 60, 62], 0.9),
      TIMED,
      "degree",
      profileOf(c),
    );
    const d = r.diagnostics.find((x) => x.id === "sing.no-voice");
    expect(d?.params.reason).toBe("short");
    expect(Number(d?.params.ms)).toBeLessThan(HOLD_SEC * 1000);
    expect(String(d?.params.more)).toContain("hold each note");
    expect(r.notes.every((n) => n.feedback === "sing.missed")).toBe(true);
  });

  test("silence: sing.no-voice with reason none", () => {
    const c = clip("silence", { parts: [gap(2)] });
    const r = gradeSung(analyzeClip(c), targetsAt([0.3], [57], 1), TIMED, "degree", profileOf(c));
    expect(r.diagnostics[0]?.id).toBe("sing.no-voice");
    expect(r.diagnostics[0]?.params.reason).toBe("none");
  });

  test("a clipped take is still graded, with sing.clipped beside the result", () => {
    const c = clip("hot", { parts: PHRASE });
    const clean = gradeSung(
      analyzeClip(c),
      targetsAt([0.3, 2.1], [57, 60], 0.9),
      TIMED,
      "degree",
      profileOf(c),
    );
    const r = gradeSung(
      analyzeClip(hot(c, 12)),
      targetsAt([0.3, 2.1], [57, 60], 0.9),
      TIMED,
      "degree",
      profileOf(c),
    );
    expect(clean.pass).toBe(true);
    expect(clean.diagnostics.map((d) => d.id)).not.toContain("sing.clipped");
    expect(r.pass).toBe(true);
    expect(r.diagnostics.map((d) => d.id)).toContain("sing.clipped");
    expect(r.take?.clipped).toBe(true);
  });

  test("a sung note in a blip-free take is never called short", () => {
    const c = clip("held", { parts: PHRASE });
    const r = gradeSung(analyzeClip(c), targetsAt([0.3, 2.1], [57, 60], 0.9), TIMED, "degree", profileOf(c));
    expect(r.diagnostics.map((d) => d.id)).not.toContain("sing.no-voice");
    expect(r.take?.heard).toBe("voice");
  });
});
