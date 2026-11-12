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
import { barPosition, pcOf, romanOf, schemaMatch, toLeadSheet, triadCore } from "@oak/theory";
import type { NormalizeContext, Normalized } from "../types.ts";
import type { ChordSlot } from "./chords.ts";
import { cadenceAt, chordSlots, romanText } from "./chords.ts";
import { mod12, pitched } from "./events.ts";
import { durationSec, energyCurve, formLabels } from "./form.ts";
import { keyEstimate, keyOf, modulations } from "./key.ts";
import { classifyNct, melodyLine } from "./melody.ts";
import { syncopation } from "./meter.ts";
import { trackKeyContexts, transposeAfterScaleTracks } from "./scale-context.ts";
import { sectionsFromAst } from "./sections.ts";
import { selectTrack, tracksOfRole } from "./tracks.ts";

export interface Device {
  device: string;
  bar: number;
  text: string;
}

function harmonySlots(n: Normalized): ChordSlot[] {
  const symbolic = n.all.filter((e) => e.chordSymbol !== undefined);
  const chords =
    symbolic.length > 0 ? symbolic : tracksOfRole(n, "chords").flatMap((t) => n.byTrack[t] ?? []);
  return chordSlots(chords, { bass: pitched(n.all) });
}
const DOM = ["7", "9", "13", "7b9", "7#9", "7#11", "7b13", "7alt"];

/**
 * Compositional devices with their bar: secondary dominant, borrowed chord, modulation, suspension,
 * syncopated bass, modal colour, tritone sub, secondary ii–V, backdoor, diminished passing.
 */
export function detectDevices(n: Normalized, ctx: NormalizeContext & { bars?: number }): Device[] {
  const out: Device[] = [];
  const key = keyOf(n.all, ctx.key ?? null);
  const bars = ctx.bars ?? n.all.reduce((m, e) => Math.max(m, R.floor(e.onset) + 1), 0);
  const slots = harmonySlots(n).filter((s) => s.chord);
  const barOf = (s: ChordSlot): number => R.floor(s.span[0]) + 1;
  const tonic = key ? pcOf(key.tonic) : 0;
  if (key) {
    slots.forEach((s, i) => {
      const c = s.chord as ChordId;
      const next = slots[i + 1]?.chord ?? undefined;
      const rn = romanOf(c, key, next);
      const label = romanText(rn);
      if (rn.of) {
        const target = next ? romanText(romanOf(next, key)) : "";
        out.push({
          device: "secondary dominant",
          bar: barOf(s),
          text: `${label}${target ? `→${target}` : ""} bar ${barOf(s)}`,
        });
      }
      const minorKey = ["minor", "harmonic minor", "melodic minor", "dorian", "phrygian"].includes(key.mode);
      if (
        !minorKey &&
        !rn.of &&
        (rn.alt === -1 ||
          (rn.degree === 4 && triadCore(c).quality === "min") ||
          (rn.degree === 5 && triadCore(c).quality === "min"))
      )
        out.push({ device: "borrowed chord", bar: barOf(s), text: `${label} borrowed bar ${barOf(s)}` });
      if (rn.alt === -1 && rn.degree === 7 && !minorKey)
        out.push({
          device: "modal colour",
          bar: barOf(s),
          text: `${label} (mixolydian colour) bar ${barOf(s)}`,
        });
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
            bar: R.floor(note.onset) + 1,
            text: `suspension bar ${R.floor(note.onset) + 1}`,
          });
      }
  for (const m of modulations(pitched(n.all), bars))
    out.push({
      device: "modulation",
      bar: m.bar,
      text: `modulation to ${m.to.tonic} ${m.to.mode} bar ${m.bar}`,
    });
  const bass = selectTrack(n, "@bass");
  const sync = syncopation(bass, ctx.meter);
  if (sync.count >= 2)
    out.push({
      device: "syncopated bass",
      bar: R.floor(sync.at[0] ?? rat(0)) + 1,
      text: `syncopated bass (${sync.count} notes)`,
    });
  return out;
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
    devices: detectDevices(n, { ...ctx, bars: queried }).map((d) => d.text),
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
