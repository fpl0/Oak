// Transport-bar numbers (ux §3.4 "Transport bar"): the bar.beat counter, the tempo shown from the code's
// own setcpm, the time to the next downbeat (A/B switches there), and the practice-tempo ladder. Pure.
import type { MeterSpec } from "@oak/content-kit";
import { cpsToBpm } from "@oak/theory";

/** "2.3 / 4": 1-based bar inside the loop, 1-based beat (tempo units), loop length. */
export function barBeat(
  cycle: number,
  meter: MeterSpec,
  loopBars: number,
): { bar: number; beat: number; text: string } {
  if (!Number.isFinite(cycle) || cycle < 0) return { bar: 1, beat: 1, text: `1.1 / ${loopBars}` };
  const inLoop = loopBars > 0 ? cycle % loopBars : cycle;
  const bar = Math.floor(inLoop + 1e-9) + 1;
  const beat = Math.floor((inLoop - (bar - 1)) * meter.unitsPerBar + 1e-9) + 1;
  return { bar, beat, text: `${bar}.${beat} / ${loopBars}` };
}

/** BPM shown for a cps, rounded to 0.1 and printed without a trailing ".0". */
export function bpmText(cps: number, meter: MeterSpec): string {
  const bpm = Math.round(cpsToBpm(cps, meter) * 10) / 10;
  return Number.isInteger(bpm) ? String(bpm) : bpm.toFixed(1);
}

/** Milliseconds until the next integer cycle at `cps`. 0 exactly on a downbeat. */
export function msToNextDownbeat(cycle: number, cps: number): number {
  if (!(cps > 0) || !Number.isFinite(cycle)) return 0;
  const frac = cycle - Math.floor(cycle);
  if (frac < 1e-6) return 0;
  return ((1 - frac) / cps) * 1000;
}

export const PRACTICE_TEMPI = [1, 0.85, 0.7, 0.5] as const;
export type PracticeTempo = (typeof PRACTICE_TEMPI)[number];
/** 100 → 85 → 70 → 50 → 100. */
export function nextPracticeTempo(t: PracticeTempo): PracticeTempo {
  const i = PRACTICE_TEMPI.indexOf(t);
  return PRACTICE_TEMPI[(i + 1) % PRACTICE_TEMPI.length] as PracticeTempo;
}

/** Mute/solo chip states for the transport bar, from the adapter's MuteMap. */
export function chipState(
  label: string,
  mutes: { muted: ReadonlySet<string>; solo: string | null },
): "on" | "muted" | "solo" | "silenced" {
  if (mutes.solo === label) return "solo";
  if (mutes.solo !== null) return "silenced";
  return mutes.muted.has(label) ? "muted" : "on";
}

/** Toggle one label's mute. */
export function toggleMute(
  mutes: { muted: ReadonlySet<string>; solo: string | null },
  label: string,
): { muted: ReadonlySet<string>; solo: string | null } {
  const muted = new Set(mutes.muted);
  if (muted.has(label)) muted.delete(label);
  else muted.add(label);
  return { muted, solo: mutes.solo };
}

/** Toggle solo on one label (solo again = unsolo). */
export function toggleSolo(
  mutes: { muted: ReadonlySet<string>; solo: string | null },
  label: string,
): { muted: ReadonlySet<string>; solo: string | null } {
  return { muted: mutes.muted, solo: mutes.solo === label ? null : label };
}

/** True when a track is silent under the mute map (what the roll dims). */
export function isSilenced(
  mutes: { muted: ReadonlySet<string>; solo: string | null },
  label: string,
): boolean {
  if (mutes.solo !== null) return mutes.solo !== label;
  return mutes.muted.has(label);
}
