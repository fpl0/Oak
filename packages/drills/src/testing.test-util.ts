// Test helpers (not a test file): compare a generated piece with what headless Strudel plays.
import type { NEvent } from "@oak/content-kit";
import { R } from "@oak/content-kit";
import { evalHeadless } from "@oak/grader/testing";

export interface Flat {
  track: string;
  begin: string;
  end: string;
  midi: number | null;
  s: string | null;
  bank: string | null;
  gain: number;
}
const key = (e: Flat): string => `${e.track}|${e.begin}|${e.end}|${e.midi}|${e.s}|${e.bank}|${e.gain}`;

export function flattenEvents(events: readonly NEvent[]): string[] {
  return events
    .map((e) =>
      key({
        track: e.track,
        begin: R.str(e.onset),
        end: R.str(R.add(e.onset, e.dur)),
        midi: e.midi,
        s: e.s ?? null,
        bank: e.bank ?? null,
        gain: e.gain,
      }),
    )
    .sort();
}
/** Evaluates `code` in headless Strudel and returns its events in the same flat form, plus the cps and the logs. */
export async function strudelEvents(
  code: string,
  bars: number,
): Promise<{ flat: string[]; cps: number; logs: string[]; scales: (string | null)[] }> {
  const res = await evalHeadless(code, bars);
  const flat = res.events
    .map((e) =>
      key({
        track: e.track,
        begin: e.begin,
        end: e.end,
        midi: e.midi,
        s: e.s,
        bank: typeof e.value.bank === "string" ? e.value.bank : null,
        gain: typeof e.value.gain === "number" ? e.value.gain : 0.8,
      }),
    )
    .sort();
  return { flat, cps: res.cps, logs: res.logs, scales: res.events.map((e) => e.scale) };
}
