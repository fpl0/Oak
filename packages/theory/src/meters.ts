// METERS is the only implementation of the meter table of contracts §6.9. 1 cycle = 1 bar, always;
// `cpm = bpm / unitsPerBar`, where `bpm` counts the meter's tempo unit.
import type { MeterId, MeterSpec } from "@oak/content-kit";

export const METERS: Readonly<Record<MeterId, MeterSpec>> = {
  "4/4": { id: "4/4", num: 4, den: 4, tempoUnit: "quarter", unitsPerBar: 4, grouping: [1, 1, 1, 1] },
  "3/4": { id: "3/4", num: 3, den: 4, tempoUnit: "quarter", unitsPerBar: 3, grouping: [1, 1, 1] },
  "2/4": { id: "2/4", num: 2, den: 4, tempoUnit: "quarter", unitsPerBar: 2, grouping: [1, 1] },
  "6/8": { id: "6/8", num: 6, den: 8, tempoUnit: "dottedQuarter", unitsPerBar: 2, grouping: [3, 3] },
  "9/8": { id: "9/8", num: 9, den: 8, tempoUnit: "dottedQuarter", unitsPerBar: 3, grouping: [3, 3, 3] },
  "12/8": { id: "12/8", num: 12, den: 8, tempoUnit: "dottedQuarter", unitsPerBar: 4, grouping: [3, 3, 3, 3] },
  // Declared groupings: the first legal one is the default; a lesson may declare another.
  "5/4": { id: "5/4", num: 5, den: 4, tempoUnit: "quarter", unitsPerBar: 5, grouping: [3, 2] },
  "5/8": { id: "5/8", num: 5, den: 8, tempoUnit: "eighth", unitsPerBar: 5, grouping: [2, 3] },
  "7/8": { id: "7/8", num: 7, den: 8, tempoUnit: "eighth", unitsPerBar: 7, grouping: [2, 2, 3] },
  "9/8i": { id: "9/8i", num: 9, den: 8, tempoUnit: "eighth", unitsPerBar: 9, grouping: [2, 2, 2, 3] },
};

/** Groupings a lesson may declare for the meters whose grouping is not fixed. */
export const DECLARABLE_GROUPINGS: Readonly<Partial<Record<MeterId, number[][]>>> = {
  "5/4": [
    [3, 2],
    [2, 3],
  ],
  "5/8": [
    [2, 3],
    [3, 2],
  ],
  "7/8": [
    [2, 2, 3],
    [2, 3, 2],
    [3, 2, 2],
  ],
  "9/8i": [
    [2, 2, 2, 3],
    [2, 2, 3, 2],
    [2, 3, 2, 2],
    [3, 2, 2, 2],
  ],
};

/** The meter with a declared grouping. Throws when the grouping is not legal for the meter. */
export function meterWith(id: MeterId, grouping?: number[]): MeterSpec {
  const base = METERS[id];
  if (!grouping) return base;
  const legal = DECLARABLE_GROUPINGS[id] ?? [base.grouping];
  if (!legal.some((g) => g.length === grouping.length && g.every((x, i) => x === grouping[i]))) {
    throw new RangeError(`${grouping.join("+")} is not a grouping of ${id}`);
  }
  return { ...base, grouping: [...grouping] };
}

const spec = (meter: MeterId | MeterSpec): MeterSpec => (typeof meter === "string" ? METERS[meter] : meter);

/** `setcpm(bpm / unitsPerBar)`: 120 BPM in 4/4 is 30 cycles per minute. */
export function bpmToCpm(bpm: number, meter: MeterId | MeterSpec): number {
  return bpm / spec(meter).unitsPerBar;
}
export function cpmToBpm(cpm: number, meter: MeterId | MeterSpec): number {
  return cpm * spec(meter).unitsPerBar;
}
export function bpmToCps(bpm: number, meter: MeterId | MeterSpec): number {
  return bpmToCpm(bpm, meter) / 60;
}
/** `bpm = cps · 60 · unitsPerBar`. */
export function cpsToBpm(cps: number, meter: MeterId | MeterSpec): number {
  return cps * 60 * spec(meter).unitsPerBar;
}
/** The tempo line as Oak always writes it: a division that shows the BPM. */
export function tempoLine(bpm: number, meter: MeterId | MeterSpec): string {
  return `setcpm(${bpm}/${spec(meter).unitsPerBar})`;
}
/** Compound meters (6/8, 9/8, 12/8) never swing; eighth swing is `.swingBy(1/3, unitsPerBar)`, sixteenth swing `2 * unitsPerBar`. */
export function swingByArgs(meter: MeterId | MeterSpec, subdivision: 8 | 16): number | null {
  const m = spec(meter);
  if (m.tempoUnit !== "quarter") return null;
  return subdivision === 8 ? m.unitsPerBar : 2 * m.unitsPerBar;
}
/** Seconds one bar lasts at `bpm`. */
export function barSeconds(bpm: number, meter: MeterId | MeterSpec): number {
  return (60 / bpm) * spec(meter).unitsPerBar;
}
