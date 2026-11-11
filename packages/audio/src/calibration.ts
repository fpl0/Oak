// The measurements of the voice set-up wizard (contracts §8.6; U00.L02 and /settings/voice/setup):
// output check (L/R), devices, noise floor, bleed test, tap latency (16 clicks), sing latency (8 clicks),
// range sweep and pitch-match trials. The maths lives in @oak/pitch; this file schedules sound, opens the
// mic for exactly as long as a step needs and closes it again.
import type { PitchFrame, SungTarget } from "@oak/pitch";
import {
  calibrateTapLatency,
  centsFrom,
  detectBleed,
  estimateRange,
  median,
  PitchTracker,
  pitchFramesToNotes,
  rmsDb,
  WINDOW_SIZE,
} from "@oak/pitch";
import { detectDevices } from "./devices.ts";
import type { Calibration, CalibrationDeps, MicSession, RangeResult, TapLatencyResult } from "./types.ts";

/** Step lengths and counts (seconds unless stated). Exposed for the wizard's progress copy and for tests. */
export const CALIBRATION = {
  leadIn: 1,
  tapClicks: 16,
  tapSpacing: 0.6,
  singClicks: 8,
  singSpacing: 0.75,
  noiseFloorSec: 3,
  bleedTones: [81, 86, 91] as const, // A5 880 Hz, D6 1175 Hz, G6 1568 Hz
  bleedToneSec: 0.6,
  rangeSweepSec: 10,
  pitchMatchToneSec: 1,
  pitchMatchSingSec: 2.5,
  /** Above this the tap-latency card says timing grades will be more forgiving. */
  highTapLatencyMs: 120,
} as const;

/** Waits until the context clock reaches `t` (polling: AudioContext has no timer of its own). */
export async function waitUntil(
  ctx: Pick<BaseAudioContext, "currentTime">,
  t: number,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<void> {
  for (let guard = 0; ctx.currentTime < t && guard < 100_000; guard++) {
    await sleep(Math.min(50, Math.max(5, (t - ctx.currentTime) * 1000)));
  }
}

/** Plays a sine at `hz`, panned fully left (−1) or right (1), straight to the destination at −18 dBFS. */
export function playPannedTone(ctx: AudioContext, hz: number, pan: -1 | 1, at: number, dur: number): void {
  const osc = ctx.createOscillator();
  osc.frequency.value = hz;
  const gain = ctx.createGain();
  const peak = 10 ** (-18 / 20);
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(peak, at + 0.02);
  gain.gain.setValueAtTime(peak, at + dur - 0.05);
  gain.gain.linearRampToValueAtTime(0, at + dur);
  const panner = ctx.createStereoPanner();
  panner.pan.value = pan;
  osc.connect(gain).connect(panner).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + dur + 0.01);
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
    panner.disconnect();
  };
}

/** Median MIDI of the voiced frames whose window centre lies inside [from, to], or null with fewer than 10. */
function medianMidiIn(
  frames: readonly PitchFrame[],
  from: number,
  to: number,
  sampleRate: number,
): number | null {
  const tracker = new PitchTracker();
  const half = WINDOW_SIZE / 2 / sampleRate;
  const voiced: number[] = [];
  for (const f of frames) {
    const m = tracker.push(f).midi;
    const tc = f.t - half;
    if (m !== null && tc >= from && tc <= to) voiced.push(m);
  }
  return voiced.length >= 10 ? median(voiced) : null;
}

export interface CalibrationExtras {
  /** For tests: replaces `setTimeout` polling. */
  sleep?: (ms: number) => Promise<void>;
  /** Plays the panned L/R tones; default `playPannedTone` on `deps.ctx`. */
  playPanned?: (hz: number, pan: -1 | 1, at: number, dur: number) => void;
}

export function createCalibration(deps: CalibrationDeps & CalibrationExtras): Calibration {
  const { ctx, mic } = deps;
  const sleep = deps.sleep;
  const wait = (t: number) => waitUntil(ctx, t, sleep);
  const panned = deps.playPanned ?? ((hz, pan, at, dur) => playPannedTone(ctx, hz, pan, at, dur));

  /** Opens the mic, runs `body`, always closes it. */
  async function withMic<T>(body: (s: MicSession) => Promise<T>): Promise<T> {
    await mic.prepare();
    const s = await mic.open();
    try {
      return await body(s);
    } finally {
      s.close();
    }
  }

  return {
    async outputCheck() {
      const t = ctx.currentTime + 0.1;
      panned(440, -1, t, 0.8);
      panned(660, 1, t + 1.2, 0.8);
      await wait(t + 2.1);
    },

    devices: () => detectDevices(ctx),

    async noiseFloor(seconds = CALIBRATION.noiseFloorSec) {
      return withMic(async (s) => {
        const from = ctx.currentTime + 0.2; // skip the first window after the stream opens
        await wait(from + seconds);
        const levels = s
          .frames()
          .filter((f) => f.t >= from)
          .map((f) => rmsDb(f.rms))
          .filter(Number.isFinite);
        return levels.length > 0 ? median(levels) : -120;
      });
    },

    async bleedTest() {
      return withMic(async (s) => {
        const start = ctx.currentTime + 0.3;
        const playing: SungTarget[] = CALIBRATION.bleedTones.map((midi, i) => ({
          midi,
          on: start + i * (CALIBRATION.bleedToneSec + 0.2),
          off: start + i * (CALIBRATION.bleedToneSec + 0.2) + CALIBRATION.bleedToneSec,
        }));
        for (const p of playing) deps.playTone(p.midi, p.on, p.off - p.on);
        await wait((playing[playing.length - 1] as SungTarget).off + 0.3);
        return detectBleed(s.frames(), playing);
      });
    },

    async tapLatency(taps, onClick) {
      const start = ctx.currentTime + CALIBRATION.leadIn;
      const clicks = Array.from(
        { length: CALIBRATION.tapClicks },
        (_, i) => start + i * CALIBRATION.tapSpacing,
      );
      for (const at of clicks) deps.playClick(at);
      const end = (clicks[clicks.length - 1] as number) + 0.6;
      const got: number[] = [];
      const it = taps[Symbol.asyncIterator]();
      let reported = -1;
      const progress = () => {
        if (!onClick) return;
        while (reported + 1 < clicks.length && (clicks[reported + 1] as number) <= ctx.currentTime)
          onClick(++reported);
      };
      // Consume taps until the last click has passed, reporting click progress on the way.
      for (;;) {
        progress();
        if (ctx.currentTime >= end) break;
        const next = await Promise.race([
          it.next(),
          (sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms))))(50).then(() => null),
        ]);
        if (next === null) continue;
        if (next.done) {
          await wait(end);
          break;
        }
        got.push(next.value);
      }
      await it.return?.();
      progress();
      const r = calibrateTapLatency(got, clicks);
      const result: TapLatencyResult = {
        latencyMs: r.latencyMs,
        jitterMs: r.jitterMs,
        taps: got.length,
        high: r.latencyMs > CALIBRATION.highTapLatencyMs,
      };
      return result;
    },

    async singLatency(onClick) {
      return withMic(async (s) => {
        const start = ctx.currentTime + CALIBRATION.leadIn;
        const clicks = Array.from(
          { length: CALIBRATION.singClicks },
          (_, i) => start + i * CALIBRATION.singSpacing,
        );
        for (const at of clicks) deps.playClick(at);
        let reported = -1;
        const end = (clicks[clicks.length - 1] as number) + 0.7;
        while (ctx.currentTime < end) {
          await wait(Math.min(end, ctx.currentTime + 0.05));
          while (
            onClick &&
            reported + 1 < clicks.length &&
            (clicks[reported + 1] as number) <= ctx.currentTime
          ) {
            onClick(++reported);
          }
        }
        // Note starts are already at the window centre; their offset from the clicks is the sing latency.
        const notes = pitchFramesToNotes(s.frames(), {
          minNoteSec: 0.07,
          windowSec: WINDOW_SIZE / s.sampleRate,
        });
        return calibrateTapLatency(
          notes.map((n) => n.start),
          clicks,
        ).latencyMs;
      });
    },

    async rangeSweep(onFrame) {
      return withMic(async (s) => {
        const off = onFrame ? s.onFrame(onFrame) : null;
        await wait(ctx.currentTime + CALIBRATION.rangeSweepSec);
        off?.();
        const r = estimateRange(s.frames());
        if (!r) throw new RangeError("@oak/audio: the range sweep heard no sustained voice");
        const result: RangeResult = {
          lowMidi: r.low,
          highMidi: r.high,
          comfortLowMidi: r.comfLow,
          comfortHighMidi: r.comfHigh,
        };
        return result;
      });
    },

    async pitchMatch(targets) {
      return withMic(async (s) => {
        const errors: number[] = [];
        for (const midi of targets) {
          const t = ctx.currentTime + 0.3;
          deps.playTone(midi, t, CALIBRATION.pitchMatchToneSec);
          const singFrom = t + CALIBRATION.pitchMatchToneSec + 0.3;
          const singTo = singFrom + CALIBRATION.pitchMatchSingSec;
          await wait(singTo + 0.1);
          const sung = medianMidiIn(s.frames(), singFrom, singTo, s.sampleRate);
          errors.push(sung === null ? Number.NaN : centsFrom(sung, midi, true));
        }
        return errors;
      });
    },
  };
}
