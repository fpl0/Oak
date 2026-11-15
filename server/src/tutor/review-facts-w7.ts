// Wave 7 review facts (wave7.md §3.2): what the advanced tracks' views found in a piece, reshaped for a review of
// JC1–JC4, RC1–RC2 and AC1–AC2. The ii–Vs and the keys they visit, the voicing type of every hand-voiced chord (a
// `voicing()` line is a dictionary voicing, never given a hand type), the walking bass's faults bar by bar, the
// comping figures, the jazz devices of a reharmonisation against the original, a contrafact against its model, the
// melody's tensions and held avoid notes, each part's distance from the grid in milliseconds, the clave and each
// part against it, register clashes, levels, a Euclidean part, a polyrhythm and density by section.
//
// Nothing here judges or names a chord itself: it only reshapes what @oak/grader's views return (the server passes
// them as they are; these interfaces are the parts read). `w7FactLines` renders the facts as `<oak_context>` lines.
// Pure.
import type {
  FactClave,
  FactClaveAlign,
  FactComping,
  FactContrafact,
  FactDensity,
  FactEuclid,
  FactFeel,
  FactLevel,
  FactPolyrhythm,
  FactRegisterClash,
  FactReharm,
  FactTensions,
  FactTwoFive,
  FactVoicing,
  FactWalking,
  ReviewFacts,
} from "./domain.ts";

/** A rational as @oak/content-kit writes it (`[n, d]`), or a plain number of cycles. */
export type RatLike = readonly [number, number] | number;
const num = (r: RatLike): number => (typeof r === "number" ? r : r[0] / r[1]);
/** The 1-based bar a cycle position falls in (0 is a pickup bar when the piece has one). */
const barOf = (r: RatLike, pickup: boolean) => Math.floor(num(r) + 1e-9) + (pickup ? 0 : 1);

export interface TwoFiveLike {
  bar: number;
  ii: string;
  v: string;
  target: string;
  resolved: boolean;
}
export interface VoicingViewLike {
  bar: number;
  chord: string;
  reading: { type: string };
  dictionary: boolean;
}
export interface WalkingBarLike {
  bar: number;
  quarters: boolean;
  rootOnOne: boolean;
  chordToneOnThree: boolean;
  approach: { fromMidi: number; toMidi: number; semis: number } | null;
}
export interface CompingBarLike {
  bar: number;
  figure: string;
}
export interface ReharmLike {
  melodyKept: boolean;
  devices: readonly { device: string; bar: number; was: string; now: string }[];
}
export interface ContrafactLike {
  changesRatio: number;
  sharedMelodyRatio: number;
  changedBars: readonly number[];
  sharedBars: readonly number[];
}
export interface TensionNoteLike {
  at: RatLike;
  midi: number;
  chord: string | null;
  role: string;
  avoid: boolean;
  structural: boolean;
}
export interface FeelLike {
  track: string;
  swingRatio: number | null;
  medianOffsetMs: number;
  onsets: number;
}
export interface ClaveViewLike {
  windows: readonly { bar: number; clave: { type: string; direction: string } | null }[];
  first: { type: string; direction: string } | null;
  coveredBars: number;
}
export interface ClaveAlignLike {
  bar: number;
  shared: number;
  crossed: number;
}
export interface RegisterClashLike {
  bar: number;
  low: number;
  high: number;
  interval: number;
}
export interface LevelLike {
  track: string;
  relDb: number;
  heard: boolean;
}
export interface EuclidBarLike {
  bar: number;
  euclid: { pulses: number; steps: number; rotation: number } | null;
}
export interface PolyrhythmBarLike {
  bar: number;
  a: number;
  b: number;
  together: boolean;
}
export interface DensityBarLike {
  bar: number;
  onsetsPerBar: number;
  parts: number;
}

/** The Wave 7 views as the server passes them (each optional; a view that is absent says nothing). */
export interface W7FactsInput {
  twoFives?: readonly TwoFiveLike[] | null;
  /** `voicingView` per chord track, keyed by the track's name. */
  voicings?: Readonly<Record<string, readonly VoicingViewLike[]>> | null;
  walking?: { track: string; bars: readonly WalkingBarLike[] } | null;
  comping?: { track: string; bars: readonly CompingBarLike[] } | null;
  reharm?: ReharmLike | null;
  /** `true` when the original's melody was given to `reharmView`, so `melodyKept` means something. */
  reharmMelodyGiven?: boolean;
  contrafact?: ContrafactLike | null;
  tensions?: readonly TensionNoteLike[] | null;
  feel?: readonly FeelLike[] | null;
  clave?: { track: string; view: ClaveViewLike } | null;
  claveAlign?: readonly { track: string; windows: readonly ClaveAlignLike[] }[] | null;
  registerClashes?: readonly RegisterClashLike[] | null;
  levels?: readonly LevelLike[] | null;
  euclid?: readonly { track: string; bars: readonly EuclidBarLike[] }[] | null;
  polyrhythm?: { a: string; b: string; bars: readonly PolyrhythmBarLike[] } | null;
  density?: readonly DensityBarLike[] | null;
}

/** At most this many clashes, avoid notes or fault bars are listed one by one; the rest are counted. */
export const MAX_W7_ITEMS = 12;

const NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const noteName = (m: number) =>
  `${NAMES[((Math.round(m) % 12) + 12) % 12]}${Math.floor(Math.round(m) / 12) - 1}`;
const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
const pct = (n: number) => `${Math.round(n * 100)}%`;
const uniq = (xs: readonly number[]) => [...new Set(xs)].sort((a, b) => a - b);

/** "1-4, 7, 9-10": bars as runs. */
export function barList(bars: readonly number[]): string {
  const xs = uniq(bars);
  const runs: string[] = [];
  for (let i = 0; i < xs.length; i++) {
    const from = xs[i] as number;
    let to = from;
    while (xs[i + 1] === to + 1) {
      to++;
      i++;
    }
    runs.push(from === to ? `${from}` : `${from}-${to}`);
  }
  return runs.join(", ");
}
const barsWord = (bars: readonly number[]) => `bar${uniq(bars).length === 1 ? "" : "s"} ${barList(bars)}`;

/** Each bar's walking-bass faults, in the course's words. */
function walkFaults(b: WalkingBarLike, last: boolean): string[] {
  const out: string[] = [];
  if (!b.quarters) out.push("not one note on every beat");
  if (!b.rootOnOne) out.push("beat 1 is not the chord's root");
  if (!b.chordToneOnThree) out.push("beat 3 is not a chord tone");
  if (!last && b.approach && b.approach.semis > 2)
    out.push(`beat 4 leaps ${b.approach.semis} half steps into the next bar`);
  return out;
}

/** The Wave 7 facts; every part is left out when its view is absent or finds nothing. */
export function w7Facts(
  input: W7FactsInput,
  o: { pickup?: boolean; sections?: readonly { name: string; bars: [number, number] }[]; bars?: number } = {},
): Partial<ReviewFacts> {
  const out: Partial<ReviewFacts> = {};
  const pickup = o.pickup === true;
  const shift = (bar: number) => (pickup ? bar - 1 : bar);

  if (input.twoFives && input.twoFives.length > 0)
    out.twoFives = input.twoFives.map(
      (t): FactTwoFive => ({ bar: shift(t.bar), ii: t.ii, v: t.v, target: t.target, resolved: t.resolved }),
    );

  if (input.voicings) {
    const list: FactVoicing[] = [];
    for (const [track, views] of Object.entries(input.voicings)) {
      const byType = new Map<string, number[]>();
      for (const v of views) {
        // A dictionary voicing keeps the dictionary's shape: it is never given a hand-voicing type.
        const type = v.dictionary ? "dictionary" : v.reading.type;
        byType.set(type, [...(byType.get(type) ?? []), shift(v.bar)]);
      }
      for (const [type, bars] of byType) list.push({ track, type, bars: uniq(bars) });
    }
    if (list.length > 0)
      out.voicings = list.sort((a, b) =>
        a.track === b.track ? (a.bars[0] ?? 0) - (b.bars[0] ?? 0) : a.track < b.track ? -1 : 1,
      );
  }

  const w = input.walking;
  if (w && w.bars.length > 0) {
    const faults = w.bars
      .map((b, i) => ({ bar: shift(b.bar), faults: walkFaults(b, i === w.bars.length - 1) }))
      .filter((f) => f.faults.length > 0);
    out.walking = {
      track: w.track,
      bars: w.bars.length,
      clean: w.bars.length - faults.length,
      faults,
    } satisfies FactWalking;
  }

  const cp = input.comping;
  if (cp && cp.bars.length > 0) {
    const figures: Record<string, number[]> = {};
    for (const b of cp.bars) figures[b.figure] = [...(figures[b.figure] ?? []), shift(b.bar)];
    out.comping = { track: cp.track, figures } satisfies FactComping;
  }

  if (input.reharm)
    out.reharm = {
      melodyKept: input.reharmMelodyGiven ? input.reharm.melodyKept : null,
      devices: [...input.reharm.devices]
        .map((d) => ({ device: d.device, bar: d.bar, was: d.was, now: d.now }))
        .sort((a, b) => a.bar - b.bar),
    } satisfies FactReharm;

  if (input.contrafact)
    out.contrafact = {
      changesRatio: round2(input.contrafact.changesRatio),
      changedBars: [...input.contrafact.changedBars],
      sharedMelodyRatio: round2(input.contrafact.sharedMelodyRatio),
      sharedBars: [...input.contrafact.sharedBars],
    } satisfies FactContrafact;

  const tn = (input.tensions ?? []).filter((t) => t.chord !== null);
  if (tn.length > 0) {
    const byLabel: Record<string, number[]> = {};
    let tensions = 0;
    const avoid: FactTensions["avoid"] = [];
    for (const t of tn) {
      if (t.role === "chord-tone" || t.role === "outside") continue;
      tensions++;
      const bar = barOf(t.at, pickup);
      byLabel[t.role] = uniq([...(byLabel[t.role] ?? []), bar]);
      if (t.avoid && t.structural)
        avoid.push({ bar, label: t.role, chord: t.chord as string, note: noteName(t.midi) });
    }
    out.tensions = { byLabel, share: round2(tensions / tn.length), avoid } satisfies FactTensions;
  }

  const feel = (input.feel ?? []).filter((f) => f.onsets > 0);
  if (feel.length > 0)
    out.feel = feel.map(
      (f): FactFeel => ({ track: f.track, offsetMs: round1(f.medianOffsetMs), onsets: f.onsets }),
    );

  const cl = input.clave;
  if (cl) {
    const first = cl.view.first;
    out.clave = {
      track: cl.track,
      type: first?.type ?? null,
      direction: first?.direction ?? null,
      coveredBars: cl.view.coveredBars,
      missing: cl.view.windows
        .filter(
          (wd) =>
            !first || !wd.clave || wd.clave.type !== first.type || wd.clave.direction !== first.direction,
        )
        .map((wd) => shift(wd.bar)),
    } satisfies FactClave;
  }

  if (input.claveAlign && input.claveAlign.length > 0)
    out.claveAlign = input.claveAlign.map(
      (a): FactClaveAlign => ({
        track: a.track,
        windows: a.windows.map((wd) => ({ bar: shift(wd.bar), shared: wd.shared, crossed: wd.crossed })),
      }),
    );

  if (input.registerClashes) {
    // One clash per bar and pair of notes: a held clash is one place to fix, not one per onset.
    const seen = new Set<string>();
    const list: FactRegisterClash[] = [];
    for (const c of input.registerClashes) {
      const k = `${c.bar}:${c.low}:${c.high}`;
      if (seen.has(k)) continue;
      seen.add(k);
      list.push({ bar: shift(c.bar), low: noteName(c.low), high: noteName(c.high), interval: c.interval });
    }
    out.registerClashes = list.sort((a, b) => a.bar - b.bar);
  }

  if (input.levels && input.levels.length > 0)
    out.levels = input.levels
      // A silent part (no gain at all) is -120 dB: JSON has no -Infinity.
      .map(
        (l): FactLevel => ({
          track: l.track,
          relDb: Number.isFinite(l.relDb) ? round1(l.relDb) : -120,
          heard: l.heard,
        }),
      )
      .sort((a, b) => b.relDb - a.relDb || (a.track < b.track ? -1 : 1));

  if (input.euclid && input.euclid.length > 0) {
    const list: FactEuclid[] = [];
    for (const e of input.euclid) {
      const byId = new Map<string, { e: NonNullable<EuclidBarLike["euclid"]>; bars: number[] }>();
      for (const b of e.bars) {
        if (!b.euclid || b.euclid.pulses < 2) continue;
        const k = `${b.euclid.pulses},${b.euclid.steps},${b.euclid.rotation}`;
        const g = byId.get(k) ?? { e: b.euclid, bars: [] };
        g.bars.push(shift(b.bar));
        byId.set(k, g);
      }
      for (const g of byId.values())
        list.push({
          track: e.track,
          pulses: g.e.pulses,
          steps: g.e.steps,
          rotation: g.e.rotation,
          bars: g.bars,
        });
    }
    if (list.length > 0) out.euclid = list;
  }

  const pr = input.polyrhythm;
  if (pr && pr.bars.length > 0) {
    const together = pr.bars.filter((b) => b.together);
    const counts = new Map<string, number>();
    for (const b of together) counts.set(`${b.a}:${b.b}`, (counts.get(`${b.a}:${b.b}`) ?? 0) + 1);
    const ratio = [...counts].sort((x, y) => y[1] - x[1])[0]?.[0] ?? "none";
    out.polyrhythm = {
      a: pr.a,
      b: pr.b,
      ratio,
      bars: together.map((b) => shift(b.bar)),
      of: pr.bars.length,
    } satisfies FactPolyrhythm;
  }

  const dn = input.density ?? [];
  if (dn.length > 0) {
    const spans: { where: string; bars: [number, number] }[] =
      o.sections && o.sections.length > 0
        ? o.sections.map((s) => ({ where: s.name, bars: s.bars }))
        : Array.from({ length: Math.ceil(dn.length / 4) }, (_, i) => {
            const from = i * 4 + 1;
            const to = Math.min(dn.length, from + 3);
            return { where: `bars ${from}-${to}`, bars: [from, to] as [number, number] };
          });
    const list: FactDensity[] = [];
    for (const sp of spans) {
      const rows = dn.filter((d) => shift(d.bar) >= sp.bars[0] && shift(d.bar) <= sp.bars[1]);
      if (rows.length === 0) continue;
      list.push({
        where: sp.where,
        bars: sp.bars,
        onsetsPerBar: round1(rows.reduce((s, r) => s + r.onsetsPerBar, 0) / rows.length),
        parts: Math.max(...rows.map((r) => r.parts)),
      });
    }
    if (list.length > 0) out.density = list;
  }
  return out;
}

const VOICING_NAME: Readonly<Record<string, string>> = {
  shell: "shell",
  "rootless-a": "rootless A",
  "rootless-b": "rootless B",
  "drop-2": "drop-2",
  close: "close position",
  spread: "spread",
  "guide-tones": "guide tones only",
  other: "no named type",
  dictionary: "dictionary voicing (the voicing() dictionary's shape, not a hand voicing)",
};
const FIGURE_NAME: Readonly<Record<string, string>> = {
  charleston: "Charleston",
  push: "push into the next bar",
  "on-the-beat": "on the beats",
  other: "other rhythms",
  rest: "silent",
};
/** FEEL_MS (content-kit): 8–45 ms off the grid is a feel; more is a displacement you hear as rhythm. */
export const FEEL_MS = { min: 8, max: 45 } as const;

function feelWords(ms: number): string {
  const a = Math.abs(ms);
  if (a < FEEL_MS.min) return "on the grid";
  const side = ms > 0 ? "behind the beat (laid back)" : "ahead of the beat (pushing)";
  return a <= FEEL_MS.max
    ? `${side}, a feel`
    : `${ms > 0 ? "behind" : "ahead"} by more than a feel: a displacement`;
}

/** Wave 7 facts as `<oak_context>` lines, one fact per line, in a fixed order. */
export function w7FactLines(f: ReviewFacts): string[] {
  const lines: string[] = [];
  const tf = f.twoFives ?? [];
  if (tf.length > 0) {
    for (const t of tf.slice(0, MAX_W7_ITEMS))
      lines.push(
        `two_five: bar ${t.bar} ${t.ii} ${t.v} aims at ${t.target} · ${t.resolved ? "resolves there" : "does not land on its home chord"}`,
      );
    if (tf.length > MAX_W7_ITEMS) lines.push(`two_five: ${tf.length - MAX_W7_ITEMS} more not listed`);
    const keys = new Map<string, number[]>();
    for (const t of tf) keys.set(t.target, [...(keys.get(t.target) ?? []), t.bar]);
    lines.push(
      `keys_visited: ${[...keys].map(([k, bars]) => `${k} (ii–V at ${barsWord(bars)})`).join(" · ")} · ${keys.size} key${keys.size === 1 ? "" : "s"}`,
    );
  }
  for (const v of f.voicings ?? [])
    lines.push(`voicing: ${v.track} · ${VOICING_NAME[v.type] ?? v.type} in ${barsWord(v.bars)}`);

  const w = f.walking;
  if (w) {
    lines.push(
      `walking_bass: ${w.track} · ${w.bars} bars · ${w.clean} walk without a fault${w.faults.length === 0 ? "" : ` · ${w.faults.length} with a fault`}`,
    );
    for (const x of w.faults.slice(0, MAX_W7_ITEMS))
      lines.push(`walking_bass bar ${x.bar}: ${x.faults.join("; ")}`);
    if (w.faults.length > MAX_W7_ITEMS)
      lines.push(`walking_bass: ${w.faults.length - MAX_W7_ITEMS} more bars with a fault not listed`);
  }
  const cp = f.comping;
  if (cp)
    lines.push(
      `comping: ${cp.track} · ${Object.entries(cp.figures)
        .sort(([, a], [, b]) => (a[0] ?? 0) - (b[0] ?? 0))
        .map(([fig, bars]) => `${FIGURE_NAME[fig] ?? fig} in ${barsWord(bars)}`)
        .join(" · ")}`,
    );

  const rh = f.reharm;
  if (rh) {
    const kinds = new Set(rh.devices.map((d) => d.device));
    lines.push(
      `reharm: ${rh.melodyKept === null ? "no original melody given" : rh.melodyKept ? "the tune kept note for note" : "the tune is NOT the original's, note for note"} · ${rh.devices.length} device${rh.devices.length === 1 ? "" : "s"}, ${kinds.size} different (${[...kinds].join(", ") || "none"})`,
    );
    for (const d of rh.devices.slice(0, MAX_W7_ITEMS))
      lines.push(
        `reharm_device: ${d.device} · bar ${d.bar} · the original's ${d.was || "chord"} now ${d.now}`,
      );
  }
  const cf = f.contrafact;
  if (cf)
    lines.push(
      `contrafact: the model's changes kept in ${pct(cf.changesRatio)} of bars${cf.changedBars.length > 0 ? ` (changed in ${barsWord(cf.changedBars)})` : ""} · the melody repeats the model's head in ${pct(cf.sharedMelodyRatio)} of its bars${cf.sharedBars.length > 0 ? ` (${barsWord(cf.sharedBars)})` : ""}`,
    );

  const tn = f.tensions;
  if (tn) {
    const labels = Object.entries(tn.byLabel).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    lines.push(
      `tensions (melody over its chord): ${labels.length > 0 ? labels.map(([l, bars]) => `${l} in ${barsWord(bars)}`).join(" · ") : "none: every melody note over a chord is a chord tone"} · ${pct(tn.share)} of melody notes are tensions; a tension is a common choice, never the right note`,
    );
    for (const a of tn.avoid.slice(0, MAX_W7_ITEMS))
      lines.push(
        `avoid_note: bar ${a.bar} · ${a.note} is the ${a.label} over ${a.chord}, held or on the beat`,
      );
  }

  for (const x of f.feel ?? []) {
    // A swung line's off-beats sit late by design: its median distance is the swing, not a lay-back.
    const swung = (f.swing ?? []).find((sw) => sw.track === x.track && sw.swung !== null);
    lines.push(
      `feel: ${x.track} · ${x.offsetMs > 0 ? "+" : ""}${x.offsetMs} ms from the 16th grid · ${
        swung && Math.abs(x.offsetMs) >= FEEL_MS.min
          ? `the line swings its ${swung.swung}ths, so this is the swing's late off-beats, not a lay-back`
          : feelWords(x.offsetMs)
      }`,
    );
  }

  const cl = f.clave;
  if (cl)
    lines.push(
      cl.type === null
        ? `clave: ${cl.track} · no son or rumba clave found in any two-bar window`
        : `clave: ${cl.track} · ${cl.type} ${cl.direction} · held from bar 1 for ${cl.coveredBars} bars${cl.missing.length > 0 ? ` · windows not holding it start at ${barsWord(cl.missing)}` : " · every two-bar window holds it"}`,
    );
  for (const a of f.claveAlign ?? []) {
    const facing = a.windows.filter((wd) => wd.shared > wd.crossed).length;
    const crossed = a.windows.filter((wd) => wd.crossed > wd.shared).length;
    lines.push(
      `clave_alignment: ${a.track} · of ${a.windows.length} two-bar windows: faces the clave as written in ${facing}, crossed in ${crossed}, neither in ${a.windows.length - facing - crossed} · ${a.windows
        .slice(0, MAX_W7_ITEMS)
        .map((wd) => `bars ${wd.bar}-${wd.bar + 1}: ${wd.shared} strokes met, ${wd.crossed} if crossed`)
        .join(" · ")}`,
    );
  }

  const rc = f.registerClashes;
  if (rc) {
    if (rc.length === 0) lines.push("register_clashes: none");
    for (const c of rc.slice(0, MAX_W7_ITEMS))
      lines.push(
        `register_clash: bar ${c.bar} · ${c.low} and ${c.high}, ${c.interval} half steps apart, too close that low`,
      );
    if (rc.length > MAX_W7_ITEMS) lines.push(`register_clash: ${rc.length - MAX_W7_ITEMS} more not listed`);
  }
  if (f.levels && f.levels.length > 0)
    lines.push(
      `levels (against the loudest part): ${f.levels.map((l) => `${l.track} ${l.relDb === 0 ? "0" : l.relDb} dB${l.heard ? "" : " (more than 24 dB under: not heard)"}`).join(" · ")}`,
    );
  for (const e of f.euclid ?? [])
    lines.push(
      `euclid: ${e.track} · (${e.pulses},${e.steps}${e.rotation ? `,${e.rotation}` : ""}) in ${barsWord(e.bars)}`,
    );
  const pr = f.polyrhythm;
  if (pr)
    lines.push(
      pr.bars.length === 0
        ? `polyrhythm: ${pr.a} against ${pr.b} · the two pulses never sound evenly in the same bar`
        : `polyrhythm: ${pr.a} against ${pr.b} · ${pr.ratio} together in ${pr.bars.length} of ${pr.of} bars (${barsWord(pr.bars)})`,
    );
  if (f.density && f.density.length > 0)
    lines.push(
      `density: ${f.density.map((d) => `${d.where} ${d.onsetsPerBar} onsets a bar, up to ${d.parts} parts`).join(" · ")}`,
    );
  return lines;
}
