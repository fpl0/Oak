// The preloader (architecture §6.4, spikes/s3-sounds/src/oak-audio.ts). It warms exactly the buffers
// superdough will need at trigger time: sample buffers through `getSampleBuffer` (pitched maps pick the
// closest note), soundfont zones through `getFontBufferSource` (cached per font and pitch).
import * as core from "@strudel/core";
import * as soundfonts from "@strudel/soundfonts";
import * as webaudio from "@strudel/webaudio";
import type { HapValue, SoundEntry } from "./pack.ts";
import type { PreloadReport, PreloadSpec } from "./types.ts";

export type WarmResult = "warmed" | "synth" | "missing";

const REST = new Set(["-", "~", "_"]);
/** Pitches a soundfont is warmed at when the spec names none: C2 to C6 by octave. */
const DEFAULT_FONT_NOTES = [36, 48, 60, 72, 84];

/** The registry key superdough looks a hap value up by: `bank_s`, lower-cased by `getSound`. */
export function soundKeyOf(value: { s?: unknown; bank?: unknown }): string | null {
  if (typeof value.s !== "string" || REST.has(value.s)) return null;
  return typeof value.bank === "string" && value.bank.length > 0 ? `${value.bank}_${value.s}` : value.s;
}

/** Warm the buffer one hap value will need. Mirrors what superdough does at trigger time. */
export async function warmValue(value: HapValue): Promise<WarmResult> {
  const key = soundKeyOf(value);
  if (key === null) return "synth";
  const sound = webaudio.getSound(key) as SoundEntry | undefined;
  if (!sound) return "missing";
  const { type, samples, fonts } = sound.data ?? {};
  if (type === "sample") {
    await webaudio.getSampleBuffer({ ...value, s: key }, samples);
    return "warmed";
  }
  if (type === "soundfont" && fonts && fonts.length > 0) {
    const font = fonts[core.getSoundIndex(value.n ?? 0, fonts.length)] as string;
    await soundfonts.getFontBufferSource(font, value, webaudio.getAudioContext());
    return "warmed";
  }
  return "synth";
}

/** Hap values to warm for one spec entry: every pitch it names, or the whole pitched map, or a default range. */
export function valuesOfSpec(spec: PreloadSpec["sounds"][number]): HapValue[] {
  const base: HapValue = { s: spec.s, n: spec.n ?? 0 };
  if (spec.bank !== undefined) base.bank = spec.bank;
  if (spec.notes && spec.notes.length > 0) return spec.notes.map((note) => ({ ...base, note }));
  const key = soundKeyOf(base);
  const sound = key ? (webaudio.getSound(key) as SoundEntry | undefined) : undefined;
  const data = sound?.data;
  if (
    data?.type === "sample" &&
    data.samples &&
    typeof data.samples === "object" &&
    !Array.isArray(data.samples)
  ) {
    // A pitched map ({ "c3": [...], "e3": [...] }): warm every file of it.
    return Object.keys(data.samples).map((note) => ({ ...base, note }));
  }
  if (data?.type === "soundfont") return DEFAULT_FONT_NOTES.map((note) => ({ ...base, note }));
  return [base];
}

const valueKey = (v: HapValue): string => JSON.stringify([v.bank, v.s, v.n, v.note, v.freq]);

/** Warms every distinct value, at most `concurrency` at a time. Never rejects: a failed load counts as missing. */
export async function warmAll(
  values: readonly HapValue[],
  onProgress?: (done: number, total: number) => void,
  concurrency = 6,
): Promise<PreloadReport> {
  const t0 = performance.now();
  const report: PreloadReport = { warmed: 0, synths: 0, missing: [], ms: 0 };
  const seen = new Set<string>();
  const unique = values.filter((v) => {
    const key = valueKey(v);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  let done = 0;
  const queue = [...unique];
  const missing = new Set<string>();
  const worker = async (): Promise<void> => {
    for (let v = queue.shift(); v !== undefined; v = queue.shift()) {
      let result: WarmResult;
      try {
        result = await warmValue(v);
      } catch {
        result = "missing";
      }
      if (result === "warmed") report.warmed++;
      else if (result === "synth") report.synths++;
      else missing.add(soundKeyOf(v) ?? String(v.s));
      done++;
      onProgress?.(done, unique.length);
    }
  };
  onProgress?.(0, unique.length);
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, unique.length)) }, worker));
  report.missing = [...missing].sort();
  report.ms = Math.round(performance.now() - t0);
  return report;
}

export function preloadSpec(
  spec: PreloadSpec,
  onProgress?: (done: number, total: number) => void,
): Promise<PreloadReport> {
  return warmAll(spec.sounds.flatMap(valuesOfSpec), onProgress);
}

interface QueryablePattern {
  queryArc(begin: number, end: number, controls?: Record<string, unknown>): Strudel.Hap[];
}

/** The exact (s, bank, n, note) values a pattern triggers in `[from, to)` cycles. */
export function valuesOfPattern(pattern: QueryablePattern, from: number, to: number): HapValue[] {
  const out: HapValue[] = [];
  for (const hap of pattern.queryArc(from, to)) {
    if (!hap.hasOnset()) continue;
    const v = hap.value;
    if (v && typeof v === "object" && !Array.isArray(v)) out.push(v as HapValue);
  }
  return out;
}

/** Exact preload: query the pattern and warm precisely the combinations it will trigger. */
export function preloadPattern(pattern: QueryablePattern, from = 0, to = 2): Promise<PreloadReport> {
  let values: HapValue[] = [];
  try {
    values = valuesOfPattern(pattern, from, to);
  } catch {
    // A query error is reported by the evaluation itself; nothing to warm.
  }
  return warmAll(values);
}
