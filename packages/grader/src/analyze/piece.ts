// The deterministic summary of a piece (AnalysisSummary, contracts §5.7) and the liner notes written
// from it when the tutor is off; the device detector behind the `device-count` rule.
import type {
  AnalysisKeyContext,
  AnalysisSummary,
  CadenceType,
  GradeResult,
  KeySpec,
  Layer,
} from "@oak/content-kit";
import { R, rat } from "@oak/content-kit";
import type { ChordId } from "@oak/theory";
import {
  appliedReading,
  barPosition,
  chordPcs,
  isMinorish,
  outsideChordKind,
  pcOf,
  romanOf,
  scalePcs,
  schemaMatch,
  toLeadSheet,
  triadCore,
} from "@oak/theory";
import type { NormalizeContext, Normalized } from "../types.ts";
import type { ChordSlot } from "./chords.ts";
import { cadenceAt, chordSlots, romanText } from "./chords.ts";
import { mod12, pitched } from "./events.ts";
import { durationSec, energyCurve, formLabels } from "./form.ts";
import { keyEstimate, keyFromContext, keyOf, modulations } from "./key.ts";
import { chordKeys, keyChangesByBar, keysByBar } from "./key-plan.ts";
import { classifyNct, isStrong, melodyLine } from "./melody.ts";
import { syncopation } from "./meter.ts";
import { trackKeyContexts, transposeAfterScaleTracks } from "./scale-context.ts";
import { sectionsFromAst } from "./sections.ts";
import { selectTrack, tracksOfRole } from "./tracks.ts";

export interface Device {
  /** One of content-kit `DEVICE_NAMES`. */
  device: string;
  /** 1-based bar where it first sounds (with a pickup, cycle 0 is bar 0). */
  bar: number;
  /** Bars it lasts, where a device is a stretch (a key change, a modal section); 1 otherwise. */
  bars?: number;
  text: string;
}

/** Chord slots of a piece: chord symbols when the events carry them, else the chord-role tracks; the bass is the lowest pitched learner note. */
export function harmonySlots(n: Normalized): ChordSlot[] {
  const symbolic = n.all.filter((e) => e.chordSymbol !== undefined);
  const chords =
    symbolic.length > 0 ? symbolic : tracksOfRole(n, "chords").flatMap((t) => n.byTrack[t] ?? []);
  return chordSlots(chords, { bass: pitched(n.all) });
}
const DOM = ["7", "9", "13", "7b9", "7#9", "7#11", "7b13", "7alt"];
/** Bars a new key must last to be a modulation, and syncopated bass notes that make a device (CF-A). */
export const MODULATION_MIN_BARS = 8;
export const SYNCOPATED_BASS_MIN = 4;
const COLOUR_PC: Record<string, number> = { mixolydian: 10, dorian: 9, lydian: 6, phrygian: 1 };
const COLOUR_NAME: Record<string, string> = {
  mixolydian: "Mixolydian",
  dorian: "Dorian",
  lydian: "Lydian",
  phrygian: "Phrygian",
};

/** The triad of `c` lies inside the scale of `key` (the mode's own chord: IV in Dorian, ♭VII in Mixolydian). */
function ownsChord(c: ChordId, key: KeySpec): boolean {
  const scale = new Set<number>(scalePcs(key));
  const core: ChordId = { ...c, quality: triadCore(c).quality, ext: [], bassPc: c.rootPc };
  return (chordPcs(core) as number[]).every((pc) => scale.has(mod12(pc)));
}

/** Stretches of bars written on a colour mode's `.scale()` whose colour note falls on a strong beat twice or more. */
function modalStretches(
  n: Normalized,
  bars: number,
  meter: NormalizeContext["meter"],
): { from: number; to: number; key: KeySpec }[] {
  const perBar: (KeySpec | null)[] = Array.from({ length: bars }, () => null);
  for (let b = 0; b < bars; b++) {
    const inBar = pitched(n.all).filter((e) => R.floor(e.onset) === b);
    const k = keyFromContext(inBar);
    perBar[b] = k && k.mode in COLOUR_PC ? k : null;
  }
  const out: { from: number; to: number; key: KeySpec }[] = [];
  let b = 0;
  while (b < bars) {
    const k = perBar[b];
    if (!k) {
      b++;
      continue;
    }
    let end = b + 1;
    while (end < bars && perBar[end]?.tonic === k.tonic && perBar[end]?.mode === k.mode) end++;
    const tone = mod12(pcOf(k.tonic) + (COLOUR_PC[k.mode] as number));
    const strong = pitched(n.all).filter(
      (e) =>
        R.floor(e.onset) >= b &&
        R.floor(e.onset) < end &&
        mod12(e.midi) === tone &&
        isStrong(e.onset, meter, "strong"),
    ).length;
    if (strong >= 2) out.push({ from: b, to: end, key: k });
    b = end;
  }
  return out;
}

/**
 * Compositional devices with the bar each first sounds in (contracts §6.6 CF-A; the definitions are the finale
 * spec's "The six devices: what counts"): one musical event counts for one device.
 * - secondary dominant: an applied dominant (or leading-tone chord) that goes to its target, read in the key in
 *   force at its bar; the dominant that leads into a new key belongs to that key and is not one;
 * - borrowed chord: iv, ♭III, ♭VI, ♭VII (and ii°) in major; the Picardy I and the Dorian IV in minor
 *   (`outsideChordKind`); ♭VII alone is modal colour, and a borrowed chord only beside ♭VI, ♭III or iv;
 * - modulation: a new key that lasts eight bars or more, read from the code's own key plan first;
 * - suspension: a melody note held over a chord change that resolves down by step, or a sus4 chord resolving on
 *   its own root;
 * - syncopated bass: four or more syncopated bass notes;
 * - modal colour: a stretch on a modal `.scale()` with its colour note on a strong beat twice or more, or ♭VII
 *   in a major key with no other borrowed chord beside it (I–♭VII–IV);
 * and the jazz track's tritone sub, secondary ii–V, backdoor and diminished passing.
 */
export function detectDevices(
  n: Normalized,
  ctx: NormalizeContext & { bars?: number; code?: string },
): Device[] {
  const out: Device[] = [];
  const key = keyOf(n.all, ctx.key ?? null);
  const bars = ctx.bars ?? n.all.reduce((m, e) => Math.max(m, R.floor(e.onset) + 1), 0);
  const shift = ctx.pickup ? 0 : 1;
  const slots: ChordSlot[] = [];
  for (const s of harmonySlots(n)) {
    if (!s.chord) continue;
    const last = slots[slots.length - 1]?.chord;
    if (
      last &&
      last.rootPc === s.chord.rootPc &&
      last.quality === s.chord.quality &&
      last.bassPc === s.chord.bassPc
    )
      continue;
    slots.push(s);
  }
  const barOf = (s: ChordSlot): number => R.floor(s.span[0]) + shift;
  const plan = key
    ? keysByBar(n, Math.max(1, bars), {
        key: ctx.key ?? null,
        ...(ctx.code !== undefined ? { code: ctx.code } : {}),
        pickup: !!ctx.pickup,
      })
    : [];
  const modal = modalStretches(n, bars, ctx.meter);
  for (const m of modal)
    out.push({
      device: "modal colour",
      bar: m.from + shift,
      bars: m.to - m.from,
      text: `${COLOUR_NAME[m.key.mode] ?? m.key.mode} colour bar ${m.from + shift}`,
    });
  if (key) {
    const keys = chordKeys(slots, plan, key);
    const root = (c: ChordId): ChordId => ({ ...c, bassPc: c.rootPc });
    const kinds = slots.map((s, i) => {
      const c = root(s.chord as ChordId);
      const next = slots[i + 1]?.chord;
      return outsideChordKind(c, keys[i] as KeySpec, next ? root(next) : undefined);
    });
    slots.forEach((s, i) => {
      const c = s.chord as ChordId;
      const k = keys[i] as KeySpec;
      const tonic = pcOf(k.tonic);
      const next = slots[i + 1]?.chord ?? undefined;
      const rn = romanOf(root(c), k, next ? root(next) : undefined);
      const label = romanText(rn);
      const kind = kinds[i];
      if (kind === "secondary-dominant" || kind === "applied-leading-tone") {
        const reading = appliedReading(root(c), k, next ? root(next) : undefined);
        // It counts only where it goes to the chord it points at.
        if (reading?.resolves && next)
          out.push({
            device: "secondary dominant",
            bar: barOf(s),
            text: `${label}→${romanText(romanOf(root(next), k))} bar ${barOf(s)}`,
          });
      }
      if (kind === "borrowed") {
        // A chord the stretch's own mode owns is that mode's colour, not a borrowed chord.
        const inModal = modal.some(
          (m) => R.floor(s.span[0]) >= m.from && R.floor(s.span[0]) < m.to && ownsChord(c, m.key),
        );
        const flatSeven = rn.alt === -1 && rn.degree === 7;
        // ♭VII is borrowed beside ♭VI, ♭III or iv (within two bars); alone it is the Mixolydian colour.
        const beside = slots.some(
          (o, j) =>
            j !== i &&
            kinds[j] === "borrowed" &&
            Math.abs(R.floor(o.span[0]) - R.floor(s.span[0])) <= 2 &&
            mod12((o.chord as ChordId).rootPc - tonic) !== 10,
        );
        if (inModal) {
          // already counted with its stretch
        } else if (flatSeven && !beside)
          out.push({
            device: "modal colour",
            bar: barOf(s),
            text: `${label} (mixolydian colour) bar ${barOf(s)}`,
          });
        else out.push({ device: "borrowed chord", bar: barOf(s), text: `${label} borrowed bar ${barOf(s)}` });
      }
      if (next && DOM.includes(c.quality) && mod12(c.rootPc - next.rootPc) === 1)
        out.push({
          device: "tritone sub",
          bar: barOf(s),
          text: `${toLeadSheet(c)} tritone sub bar ${barOf(s)}`,
        });
      const after = slots[i + 2]?.chord;
      if (
        next &&
        ["m7", "m7b5", "m9"].includes(c.quality) &&
        DOM.includes(next.quality) &&
        mod12(next.rootPc - c.rootPc) === 5 &&
        mod12(next.rootPc + 5 - tonic) !== 0
      )
        out.push({ device: "secondary ii–V", bar: barOf(s), text: `secondary ii–V bar ${barOf(s)}` });
      if (
        next &&
        after &&
        triadCore(c).quality === "min" &&
        mod12(c.rootPc - tonic) === 5 &&
        mod12(next.rootPc - tonic) === 10 &&
        mod12(after.rootPc - tonic) === 0
      )
        out.push({ device: "backdoor", bar: barOf(s), text: `backdoor iv–♭VII–I bar ${barOf(s)}` });
      const prev = slots[i - 1]?.chord;
      if (
        prev &&
        next &&
        c.quality === "dim7" &&
        Math.abs(mod12(next.rootPc - prev.rootPc)) === 2 &&
        mod12(c.rootPc - prev.rootPc) === 1
      )
        out.push({
          device: "diminished passing",
          bar: barOf(s),
          text: `${toLeadSheet(c)} passing bar ${barOf(s)}`,
        });
      if (c.quality === "sus4" || c.quality === "7sus4") {
        if (next && next.rootPc === c.rootPc)
          out.push({ device: "suspension", bar: barOf(s), text: `sus4 resolving bar ${barOf(s)}` });
      }
    });
  }
  // Melodic suspensions over chords.
  const mel = melodyLine(selectTrack(n, "@melody"));
  if (slots.length > 0 && mel.length > 0)
    for (const x of classifyNct(mel, slots, ctx.meter))
      if (x.type === "suspension") {
        const note = mel.find((m) => m.id === x.id);
        if (note)
          out.push({
            device: "suspension",
            bar: R.floor(note.onset) + shift,
            text: `suspension bar ${R.floor(note.onset) + shift}`,
          });
      }
  // A key change: from the code's own key plan first; with none, by ear. Eight bars or more in the new key.
  const planned = keyChangesByBar(plan.slice(0, Math.max(1, bars)));
  const home = plan[0] ?? key;
  const changes =
    planned.length > 0
      ? planned
      : modulations(pitched(n.all), bars).map((m, i, all) => ({
          bar: m.bar - 1,
          from: m.from,
          to: m.to,
          bars: ((all[i + 1]?.bar ?? bars + 1) as number) - m.bar,
        }));
  for (const m of changes) {
    if (m.bars < MODULATION_MIN_BARS) continue;
    // A stretch that takes its colour from a mode is that device, not also a key change.
    if (modal.some((x) => x.from === m.bar)) continue;
    if (home && pcOf(m.to.tonic) === pcOf(home.tonic) && isMinorish(m.to.mode) === isMinorish(home.mode))
      continue;
    out.push({
      device: "modulation",
      bar: m.bar + shift,
      bars: m.bars,
      text: `modulation to ${m.to.tonic} ${m.to.mode} bar ${m.bar + shift}`,
    });
  }
  const bass = selectTrack(n, "@bass");
  const sync = syncopation(bass, ctx.meter);
  if (sync.count >= SYNCOPATED_BASS_MIN)
    out.push({
      device: "syncopated bass",
      bar: R.floor(sync.at[0] ?? rat(0)) + shift,
      text: `syncopated bass (${sync.count} notes)`,
    });
  return out.sort((x, y) => x.bar - y.bar);
}

/** The deterministic summary a compose or transcribe result carries (contracts §5.7). */
export function analyzePiece(
  n: Normalized,
  ctx: NormalizeContext & { code: string; bars?: number },
): AnalysisSummary {
  const ast = sectionsFromAst(ctx.code);
  const queried = ctx.bars ?? n.all.reduce((m, e) => Math.max(m, R.floor(e.onset) + 1), 0);
  const total = ast && "totalBars" in ast ? ast.totalBars : queried;
  const key = keyOf(n.all, ctx.key ?? null);
  const est = keyEstimate(n.all).slice(0, 4);
  // The key the piece is read in (declared, then `.scale()` context) leads; the estimate follows.
  const same = (k: KeySpec): boolean => !!key && k.tonic === key.tonic && k.mode === key.mode;
  const keys = key
    ? [{ key, r: est.find((k) => same(k.key))?.r ?? 1 }, ...est.filter((k) => !same(k.key))].slice(0, 3)
    : est;
  const slots = harmonySlots(n).filter((s) => s.chord);
  const slotRows = slots.map((s, i) => {
    const p = barPosition(s.span[0], ctx.meter, ctx.pickup);
    return {
      bar: p.bar,
      beat: p.beat,
      symbol: s.symbol ?? toLeadSheet(s.chord as ChordId),
      rn: key ? romanText(romanOf(s.chord as ChordId, key, slots[i + 1]?.chord ?? undefined)) : "?",
    };
  });
  const schemas: AnalysisSummary["schemas"] = [];
  if (key) {
    const rns = slots.map((s) => romanOf(s.chord as ChordId, key));
    for (const len of [4, 3, 2]) {
      for (let i = 0; i + len <= rns.length; i++) {
        const m = schemaMatch(rns.slice(i, i + len));
        if (!m) continue;
        const from = R.floor((slots[i] as ChordSlot).span[0]) + 1;
        const to = R.floor(R.sub((slots[i + len - 1] as ChordSlot).span[1], rat(1, 1000))) + 1;
        if (!schemas.some((s) => s.schema === m.schema.id && s.bars[1] >= from))
          schemas.push({ schema: m.schema.id, bars: [from, to] });
        i += len - 1;
      }
      if (schemas.length) break;
    }
  }
  const cadences: { bar: number; type: CadenceType }[] = [];
  if (key && slots.length) {
    const mel = melodyLine(selectTrack(n, "@melody"));
    for (let b = 4; b <= queried; b += 4) {
      const type = cadenceAt(slots, mel, key, b);
      if (type !== "none") cadences.push({ bar: b, type });
    }
  }
  const roles: Partial<Record<Layer, string>> = { ...n.roles };
  const devices = detectDevices(n, { ...ctx, bars: queried });
  const form =
    ast && "sections" in ast ? ast.sections.map((s) => s.tag).join(" ") : formLabels(n.byTrack, queried);
  return {
    key: keys,
    bpm: n.bpm,
    bars: total,
    durationSec: Math.round(durationSec(total, n.cps) * 10) / 10,
    roles,
    slots: slotRows,
    schemas,
    cadences,
    form,
    energy: energyCurve(n.byTrack, queried).map((x) => Math.round(x * 100) / 100),
    devices: devices.map((d) => d.text),
    deviceList: devices.map((d) => ({
      device: d.device,
      bar: d.bar,
      ...(d.bars !== undefined ? { bars: d.bars } : {}),
      text: d.text,
    })),
    keyContexts: analysisKeyContexts(n, ctx),
  };
}

/**
 * Each pitched track's key, bar by bar, as a view reads it (`prefer: "code"`: the code's own `.scale()`,
 * patterned ones included; then the declared key; then an estimate). A `.transpose()` after `.scale()`
 * makes that track's scale context untrustworthy (contracts §6.8 item 3).
 */
export function analysisKeyContexts(
  n: Normalized,
  ctx: NormalizeContext & { code: string },
): AnalysisKeyContext[] {
  return trackKeyContexts(n, {
    declared: ctx.key ?? null,
    prefer: "code",
    ignoreScaleCtx: transposeAfterScaleTracks(ctx.code),
  })
    .filter((c) => c.spans.length > 0)
    .map((c) => ({
      track: c.track,
      band: c.band,
      spans: c.spans.map((sp) => ({
        fromBar: R.floor(sp.from) + 1,
        toBar: Math.max(R.floor(sp.from) + 1, Math.ceil(sp.to[0] / sp.to[1])),
        key: sp.key,
        source: sp.source,
      })),
    }));
}

const ROLE_NAMES: Record<string, string> = {
  drums: "drums",
  bass: "bass",
  chords: "chords",
  melody: "melody",
};
/** Deterministic liner notes from the analysis and the satisfied rules: the fallback when the tutor is off. */
export function linerNotes(
  analysis: AnalysisSummary,
  result: GradeResult,
  extra?: { band?: string; lockedTools?: string[]; attribution?: string },
): string {
  const lines: string[] = [];
  const k = analysis.key[0]?.key;
  const mins = Math.floor(analysis.durationSec / 60);
  const secs = Math.round(analysis.durationSec % 60);
  lines.push(
    `${analysis.bars} bars at ${Math.round(analysis.bpm)} BPM${k ? ` in ${k.tonic} ${k.mode}` : ""} (${mins}:${String(secs).padStart(2, "0")}).`,
  );
  const parts = Object.entries(analysis.roles)
    .filter(([role]) => role !== "all")
    .map(([role, track]) => `${ROLE_NAMES[role] ?? role} on \`${track}\``);
  if (parts.length) lines.push(`Parts: ${parts.join(", ")}.`);
  if (analysis.form && /\s/.test(analysis.form)) lines.push(`Form: ${analysis.form}.`);
  else if (analysis.form) lines.push(`Shape: ${analysis.form.split("").join(" ")}.`);
  if (analysis.schemas.length)
    lines.push(
      `Progression: ${analysis.schemas.map((s) => `${s.schema.replace(/^schema\./, "")} (bars ${s.bars[0]}–${s.bars[1]})`).join(", ")}.`,
    );
  if (analysis.cadences.length)
    lines.push(`Cadences: ${analysis.cadences.map((c) => `${c.type} at bar ${c.bar}`).join(", ")}.`);
  if (analysis.devices.length) lines.push(`Moves: ${[...new Set(analysis.devices)].slice(0, 5).join("; ")}.`);
  const met = (result.rubric ?? [])
    .filter((r) => r.ok)
    .map((r) => r.diag?.params.label)
    .filter((x): x is string => typeof x === "string");
  if (met.length) lines.push(`Done: ${met.join("; ")}.`);
  if (extra?.band) lines.push(`Played with ${extra.band}.`);
  if (extra?.lockedTools?.length) lines.push(`Uses tools not yet unlocked: ${extra.lockedTools.join(", ")}.`);
  if (extra?.attribution) lines.push(extra.attribution);
  return lines.join("\n");
}
