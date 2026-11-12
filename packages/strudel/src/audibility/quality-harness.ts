// The sound-quality harness (Wave 3), a browser test utility next to the audibility harness: renders a note
// or a plan offline through the production prebake and measures it (`quality.ts`). Driven by
// `e2e/quality.pw.ts`, which writes `packages/strudel/sound-quality.json`.
import type { AudioPlan } from "@oak/drills";
import { createHarness } from "./harness.ts";
import { round } from "./metrics.ts";
import {
  cents,
  fundamental,
  fundamentalShare,
  levelSpreadDb,
  loudness,
  midiToHz,
  mono,
  partialHz,
  peakDb,
  scanClicks,
  strongestHarmonic,
} from "./quality.ts";

export interface TuningRow {
  midi: number;
  expectedHz: number;
  hz: number | null;
  /** Signed error against the equal-tempered pitch, octaves folded out (see `octave`). */
  cents: number | null;
  /** Whole octaves between what sounds and what the note asks for: 0 is right. */
  octave: number | null;
  clarity: number | null;
  /** The share of the asked-for pitch among its first eight harmonics (an octave-ambiguous tone reads low). */
  share: number | null;
}

export interface ClickRow {
  midi: number;
  /** The worst HF jump after the attack, dB (a clean release reads well under +12). */
  worstDb: number;
  atSec: number;
}

export interface LoudnessRow {
  code: string;
  lufs: number;
  peakDb: number;
}

export interface DroneRow {
  midi: number;
  hz: number | null;
  cents: number | null;
  octave: number | null;
  /** Short-term level spread while held, dB. */
  spreadDb: number;
  /** The fundamental's share of the first eight harmonics. */
  fundamentalShare: number;
  clickDb: number;
  lufs: number;
}

const r1 = (x: number | null): number | null => (x === null ? null : round(x, 1));

export function createQualityHarness(frameUrl = "/render.html") {
  const h = createHarness({ frameUrl, seconds: 3 });
  const fs = h.sampleRate;

  function tuningOf(x: Float32Array, midi: number, fromSec: number): Omit<TuningRow, "midi"> {
    const expectedHz = midiToHz(midi);
    const e = fundamental(x, fs, fromSec, { windows: 5, windowSec: 0.1, hopSec: 0.06, minHz: 25 });
    const share = round(fundamentalShare(x, fs, expectedHz, fromSec, 1), 3);
    if (!e)
      return { expectedHz: round(expectedHz, 2), hz: null, cents: null, octave: null, clarity: null, share };
    const octave = Math.round(cents(e.hz, expectedHz) / 1200);
    // The YIN period finds the octave; the strongest of the first four partials in that octave gives the
    // tuning (the first partial itself unless it is buried, as in a distorted guitar).
    const f0 = expectedHz * 2 ** octave;
    const k = strongestHarmonic(x, fs, f0, fromSec, 4);
    const hz = (partialHz(x, fs, f0 * k, fromSec, 1) ?? e.hz * k) / k;
    return {
      expectedHz: round(expectedHz, 2),
      hz: round(hz, 2),
      cents: r1(cents(hz, expectedHz) - octave * 1200),
      octave,
      clarity: round(e.clarity, 3),
      share,
    };
  }

  /** One note held for 2 s (cps 0.5), its fundamental from 0.3 s on. */
  async function tuning(sound: string, midi: number): Promise<TuningRow> {
    const r = await h.renderInFrame(`note(${midi}).s("${sound}")`, 1, 0.5);
    return { midi, ...tuningOf(mono(r), midi, 0.3) };
  }

  /**
   * One note of `1/cps` s (0.5 s by default): the release lands inside the sample, where a cut would click.
   * The scan starts 120 ms in, after the attack (a tongued or picked attack is not a click).
   */
  async function clicks(sound: string, midi: number, cps = 2): Promise<ClickRow> {
    const r = await h.renderInFrame(`note(${midi}).s("${sound}")`, 1, cps);
    const scan = scanClicks(mono(r), fs, 0.12);
    return { midi, worstDb: round(scan.worstDb, 1), atSec: round(scan.atSec, 3) };
  }

  /** A phrase (cps 0.5 by default) as one loudness figure. */
  async function phraseLoudness(code: string, cps = 0.5): Promise<LoudnessRow> {
    const r = await h.renderInFrame(code, 1, cps);
    return { code, lufs: round(loudness(r, fs), 1), peakDb: round(peakDb(r), 1) };
  }

  /** A plan rendered as `playEvents` triggers it; measured as a held tone at `midi`. */
  async function plan(p: AudioPlan, midi: number): Promise<DroneRow> {
    const r = await h.renderEvents(p.events as { at: number; dur: number; value: Record<string, unknown> }[]);
    const x = mono(r);
    const held = Math.min(2.5, Math.max(...p.events.map((e) => e.at + e.dur)));
    const t = tuningOf(x, midi, 0.4);
    return {
      midi,
      hz: t.hz,
      cents: t.cents,
      octave: t.octave,
      spreadDb: round(levelSpreadDb(x, fs, 0.3, held - 0.1), 2),
      fundamentalShare: round(fundamentalShare(x, fs, midiToHz(midi), 0.4, 0.5), 3),
      clickDb: round(scanClicks(x, fs, 0.03).worstDb, 1),
      lufs: round(loudness(r, fs), 1),
    };
  }

  /** A plan's loudness only (a cadence). */
  async function planLoudness(p: AudioPlan): Promise<number> {
    const r = await h.renderEvents(p.events as { at: number; dur: number; value: Record<string, unknown> }[]);
    return round(loudness(r, fs), 1);
  }

  /** Two codes render differently (dB of the difference against the first), for "jazzkit is not the pop kit". */
  async function differenceDb(a: string, b: string): Promise<number> {
    const [ra, rb] = [await h.renderInFrame(a), await h.renderInFrame(b)];
    let d = 0;
    let s = 0;
    for (let i = 0; i < ra.left.length; i++) {
      d += ((ra.left[i] as number) - (rb.left[i] as number)) ** 2;
      s += (ra.left[i] as number) ** 2;
    }
    return s > 0 ? round(10 * Math.log10(d / s), 1) : Number.NEGATIVE_INFINITY;
  }

  return { tuning, clicks, phraseLoudness, plan, planLoudness, differenceDb, render: h.renderInFrame };
}
