// The Workbench's harmony (Wave 4, docs/design/wave4.md §3.2, §4.3, §4.4): what the chord band, the chord lenses,
// the function bands, the chord-tone lens, the range lens and the lead sheet read. Every chord name, numeral and
// function comes from the grader's `harmonyView` (the same chord slots the rubric grades), never from a table
// here. When the learner plays no chords over a Band that does, the Band's chords and bass are read instead, so
// a melody over the Band still shows what it sits on. Pure: tested in harmony.test.ts.
import type { KeySpec, MeterId, NEvent, PickupSpec } from "@oak/content-kit";
import { R } from "@oak/content-kit";
import { type HarmonyView, harmonyView, type MelodyNoteRole, type Normalized } from "@oak/grader";
import type { ChordLabel, ChordLabelSet } from "@oak/notation";
import { chordOfRoman, chordPcs, displayRN, METERS, parseRN, toLeadSheet } from "@oak/theory";

export type ChordFunction = "T" | "PD" | "D" | "chromatic";

/** One chord on the band: a run of the same chord merged into one region. */
export interface ChordRegion {
  /** First `HarmonyView.slots` index of the region. */
  slot: number;
  /** [from, to) in cycles. */
  from: number;
  to: number;
  /** Lead-sheet symbol ("G/B", "B°"). */
  symbol: string;
  /** The numeral as the views print it ("V6", "vii°"); null without a key. */
  rn: string | null;
  fn: ChordFunction | null;
  inversion: 0 | 1 | 2 | 3;
}

export interface MelodyMark {
  id: string;
  role: MelodyNoteRole;
  strongBeat: boolean;
}

export interface WorkbenchHarmony {
  view: HarmonyView;
  /** Whose chords these are: the learner's code, or the Band's under a learner melody. */
  source: "learner" | "band";
  /** The piece the chords were read from (the Band's bass or chords read as the learner's, where that applied). */
  piece: Normalized;
  regions: ChordRegion[];
  /** One label per region (bar = 0-based cycle, beat 1-based in tempo units), for the staff and the lead sheet. */
  labels: ChordLabel[];
  /** The melody line's notes against their chords (the chord-tone lens). */
  melody: ReadonlyMap<string, MelodyMark>;
  /** Strong-beat melody notes under a chord, and how many of them are chord tones. */
  strong: { total: number; chordTones: number };
}

export interface HarmonyContext {
  meter: MeterId;
  key: KeySpec | null;
  bars: number;
  pickup?: PickupSpec;
  /**
   * Wave 6 (contracts §6.8, wave6.md §3.2): the key in force along the piece, in cycles, when it changes key (a
   * patterned `.scale()`). Each chord's numeral, function and spelling is then read in the key at its bar, so a
   * piece lifted from C to D keeps I IV V I after the lift. Absent or one span: the piece's one key.
   */
  keyPlan?: readonly { from: number; to: number; key: KeySpec }[];
}

/** The numeral as printed: Oak's dialect ("viio", "bVII") in display form ("vii°", "♭VII"), through theory. */
export function rnDisplay(rn: string | null, key: KeySpec | null): string | null {
  if (!rn) return null;
  if (!key) return rn;
  const parsed = parseRN(rn, key);
  // An applied chord ("V7/V") keeps its written form; theory's display covers the primary numeral only.
  if (!parsed || rn.includes("/")) return rn.replace(/o/g, "°");
  return displayRN(parsed);
}

function view(n: Normalized, ctx: HarmonyContext): HarmonyView | null {
  try {
    return harmonyView(n, {
      meter: ctx.meter,
      ...(ctx.key ? { key: ctx.key } : {}),
      bars: Math.max(1, ctx.bars),
      ...(ctx.pickup ? { pickup: ctx.pickup } : {}),
    });
  } catch {
    // A view is an aid: a piece the analysis cannot read simply has no chord band.
    return null;
  }
}

const byOnset = (a: NEvent, b: NEvent) => R.cmp(a.onset, b.onset) || (a.midi ?? -1) - (b.midi ?? -1);

/**
 * The learner piece with the Band's chord and bass tracks read as the learner's own (`chords`, `bass`), for a
 * melody written over the Band. Only tracks the learner does not have themselves.
 */
export function withBandHarmony(n: Normalized): Normalized | null {
  const take = (from: string, as: string): NEvent[] =>
    n.byTrack[as] ? [] : n.band.filter((e) => e.track === from).map((e) => ({ ...e, track: as }));
  const chords = take("band.chords", "chords");
  if (chords.length === 0) return null;
  const bass = take("band.bass", "bass");
  const byTrack: Record<string, NEvent[]> = { ...n.byTrack, chords };
  if (bass.length) byTrack.bass = bass;
  return { ...n, all: [...n.all, ...chords, ...bass].sort(byOnset), byTrack };
}

/**
 * The learner piece with the Band's bass read as the learner's `bass`, when the learner plays no bass of their own:
 * the bass you hear decides the inversion (chords over the Band's roots, U05.L01/L04/L07/L08).
 */
export function withBandBass(n: Normalized): Normalized {
  if (n.byTrack.bass || n.roles.bass) return n;
  const bass = n.band.filter((e) => e.track === "band.bass").map((e) => ({ ...e, track: "bass" }));
  if (bass.length === 0) return n;
  return { ...n, all: [...n.all, ...bass].sort(byOnset), byTrack: { ...n.byTrack, bass } };
}

/**
 * The lead-sheet symbol spelled in the key (Wave 4 review): the grader's view spells a chord read from notes by
 * its pitch classes alone, so iii in A major came out "D♭m" and vii° in D major "D♭°". A chord with a numeral in
 * the key takes the numeral's spelling (C♯m, C♯°, F♭ in C♭ major) when it is the same chord over the same bass; a
 * symbol the learner wrote in `chord("…")` is kept as written.
 */
export function spelledSymbol(
  s: Pick<HarmonyView["slots"][number], "symbol" | "rn" | "pcs" | "bassPc" | "written">,
  key: KeySpec | null,
): string {
  if (s.written || !key || !s.rn) return s.symbol;
  const chord = chordOfRoman(s.rn, key);
  if (!chord || chord.bassPc !== s.bassPc) return s.symbol;
  const want = new Set(chordPcs(chord));
  const have = new Set(s.pcs);
  if (want.size !== have.size || [...want].some((pc) => !have.has(pc))) return s.symbol;
  return toLeadSheet(chord);
}

/** The harmony the Workbench shows for a normalized piece, or null when it has no chords at all. */
export function workbenchHarmony(n: Normalized, ctx: HarmonyContext): WorkbenchHarmony | null {
  let piece = withBandBass(n);
  let v = view(piece, ctx);
  let source: WorkbenchHarmony["source"] = "learner";
  if (!v || v.slots.length === 0) {
    const withBand = withBandHarmony(n);
    const bandView = withBand ? view(withBand, ctx) : null;
    if (withBand && bandView && bandView.slots.length > 0) {
      v = bandView;
      piece = withBand;
      source = "band";
    }
  }
  if (!v || v.slots.length === 0) return null;
  const main = v;
  // A piece that changes key: the same chords read again in each other key of the plan (same slots, other
  // numerals and functions). A reading that does not line up with the first is not used.
  const plan = ctx.keyPlan ?? [];
  const others = new Map<string, HarmonyView | null>();
  const viewAt = (cycle: number): HarmonyView => {
    let k: KeySpec | null = null;
    for (const s of plan) if (s.from <= cycle + 1e-9) k = s.key;
    if (!k || !main.key || (k.tonic === main.key.tonic && k.mode === main.key.mode)) return main;
    const id = `${k.tonic}:${k.mode}`;
    if (!others.has(id)) {
      const other = view(piece, { ...ctx, key: k });
      others.set(id, other && other.slots.length === main.slots.length ? other : null);
    }
    return others.get(id) ?? main;
  };
  const units = METERS[ctx.meter].unitsPerBar;
  const regions: ChordRegion[] = [];
  for (const [i, s0] of main.slots.entries()) {
    const from = R.toNum(s0.span[0]);
    const to = R.toNum(s0.span[1]);
    const sv = plan.length > 1 ? viewAt(from) : main;
    const s = sv.slots[i] ?? s0;
    const key = sv.key;
    const symbol = spelledSymbol(s, key);
    const last = regions[regions.length - 1];
    if (last && last.symbol === symbol && Math.abs(last.to - from) < 1e-9) {
      last.to = to;
      continue;
    }
    regions.push({
      slot: s.slot,
      from,
      to,
      symbol,
      rn: rnDisplay(s.rn, key),
      fn: s.function,
      inversion: s.inversion,
    });
  }
  const labels: ChordLabel[] = regions.map((r) => {
    const bar = Math.floor(r.from + 1e-9);
    const beat = Math.round(((r.from - bar) * units + 1) * 1000) / 1000;
    return { bar, beat, symbol: r.symbol, rn: r.rn };
  });
  const melody = new Map<string, MelodyMark>();
  let total = 0;
  let chordTones = 0;
  for (const m of v.melody) {
    melody.set(m.id, { id: m.id, role: m.role, strongBeat: m.strongBeat });
    if (m.strongBeat && m.role !== "no-chord") {
      total++;
      if (m.role === "chord-tone") chordTones++;
    }
  }
  return { view: v, source, piece, regions, labels, melody, strong: { total, chordTones } };
}

/** The share of strong-beat melody notes that are chord tones, 0–100, or null when there are none. */
export function chordTonePercent(h: Pick<WorkbenchHarmony, "strong"> | null): number | null {
  if (!h || h.strong.total === 0) return null;
  return Math.round((h.strong.chordTones / h.strong.total) * 100);
}

/** The short tag a melody note carries under the chord-tone lens: nothing for a chord tone. */
export const ROLE_TAG: Readonly<Record<MelodyNoteRole, string>> = {
  "chord-tone": "",
  passing: "P",
  neighbour: "N",
  appoggiatura: "App",
  suspension: "Sus",
  anticipation: "Ant",
  escape: "Esc",
  other: "NCT",
  "no-chord": "",
};

/** Words for a role (hover text and the accessible summary). */
export const ROLE_WORDS: Readonly<Record<MelodyNoteRole, string>> = {
  "chord-tone": "chord tone",
  passing: "passing tone",
  neighbour: "neighbour tone",
  appoggiatura: "appoggiatura",
  suspension: "suspension",
  anticipation: "anticipation",
  escape: "escape tone",
  other: "non-chord tone",
  "no-chord": "no chord under it",
};

/** Chord labels the staff and the lead sheet show for the lenses that are on (none when both are off). */
export function staffChordLabels(
  h: Pick<WorkbenchHarmony, "labels"> | null,
  which: ChordLabelSet,
): ChordLabel[] | undefined {
  if (!h || (!which.symbols && !which.romans)) return undefined;
  return h.labels;
}

// --- the range lens --------------------------------------------------------------------------------

export interface RangeLine {
  track: string;
  low: { id: string; midi: number };
  high: { id: string; midi: number; bar: number };
  /** Half steps from the lowest to the highest note. */
  span: number;
}

interface RangeEvent {
  id: string;
  track: string;
  band: boolean;
  midi: number | null;
  onset: number;
  bar: number;
}

/**
 * The range of each melody line: every learner track that mostly plays one note at a time (a chord track is
 * not a line). The high point is the first time the highest note sounds.
 */
export function rangeLines(events: readonly RangeEvent[]): RangeLine[] {
  const byTrack = new Map<string, RangeEvent[]>();
  for (const e of events) {
    if (e.band || e.midi === null) continue;
    const list = byTrack.get(e.track) ?? [];
    list.push(e);
    byTrack.set(e.track, list);
  }
  const out: RangeLine[] = [];
  for (const [track, list] of byTrack) {
    const onsets = new Map<number, number>();
    for (const e of list) onsets.set(e.onset, (onsets.get(e.onset) ?? 0) + 1);
    const stacked = [...onsets.values()].filter((c) => c > 1).length;
    if (onsets.size === 0 || stacked / onsets.size > 0.5) continue;
    const sorted = [...list].sort((a, b) => a.onset - b.onset);
    let low = sorted[0] as RangeEvent;
    let high = sorted[0] as RangeEvent;
    for (const e of sorted) {
      if ((e.midi as number) < (low.midi as number)) low = e;
      if ((e.midi as number) > (high.midi as number)) high = e;
    }
    out.push({
      track,
      low: { id: low.id, midi: low.midi as number },
      high: { id: high.id, midi: high.midi as number, bar: high.bar },
      span: Math.round((high.midi as number) - (low.midi as number)),
    });
  }
  return out;
}

// --- a voicing in code ------------------------------------------------------------------------------

/**
 * The same changes as `chord("<…>").voicing()` mini-notation, one entry per bar (a bar with several chords is a
 * subdivision weighted by beats: "[C@3 F]"). Spellings are Oak's code spellings (no slash chords in code).
 */
export function changesAsChordPattern(h: Pick<WorkbenchHarmony, "view">, bars: number): string | null {
  const v = h.view;
  const perBar: string[] = [];
  for (let b = 0; b < bars; b++) {
    const beats = v.beats.filter((x) => x.bar - (v.pickup ? 0 : 1) === b);
    const runs: { code: string; n: number }[] = [];
    for (const beat of beats) {
      const code = beat.chord === null ? "~" : (v.slots[beat.chord]?.code ?? "~");
      const last = runs[runs.length - 1];
      if (last && last.code === code) last.n++;
      else runs.push({ code, n: 1 });
    }
    if (runs.length === 0) continue;
    perBar.push(
      runs.length === 1
        ? (runs[0] as { code: string }).code
        : `[${runs.map((r) => (r.n > 1 ? `${r.code}@${r.n}` : r.code)).join(" ")}]`,
    );
  }
  if (perBar.length === 0 || perBar.every((p) => p === "~")) return null;
  return perBar.length === 1 ? (perBar[0] as string) : `<${perBar.join(" ")}>`;
}
