// Wave 4 rubric rules (content-kit `rubric.ts`): `pickup`, `chord-qualities`, `chord-inversions`, and the
// voicing gate's `voice-leading` fields (`voices`, `commonTones`, `noCrossing`, `bassFree`; contracts §3.1
// rule 6, §6.7 item 4). Every rule names the actual mistake in its detail line ("bar 3 is a cluster, not a
// triad"; "the E moves up to the G: the voices cross"), and the gate check gives a score in [0, 1] with one
// finding per fault.
import type { ChordQuality, Diagnostic, KeySpec, NEvent, Rat, RubricRule } from "@oak/content-kit";
import { R, rat } from "@oak/content-kit";
import type { ChordId } from "@oak/theory";
import { barPosition, inversionOf, METERS, readChord, spellMidi, toLeadSheet, triadCore } from "@oak/theory";
import type { ChordSlot } from "../analyze/chords.ts";
import { chordSlots } from "../analyze/chords.ts";
import { locAt, mod12, pitched } from "../analyze/events.ts";
import { keyOf } from "../analyze/key.ts";
import { classifyNct, melodyLine } from "../analyze/melody.ts";
import { periodOf, selectTrack } from "../analyze/tracks.ts";
import { diag } from "../feedback/catalog.ts";
import { qualityWord } from "../match/harmony.ts";
import type { Normalized } from "../types.ts";
import type { RubricContext } from "./context.ts";
import type { RuleEval } from "./rules.ts";

type RuleOf<K extends RubricRule["rule"]> = Extract<RubricRule, { rule: K }>;

const pct = (x: number): string => `${Math.round(x * 100)}%`;
const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;
const TRIADS: readonly ChordQuality[] = ["maj", "min", "dim", "aug"];
const pcName = (pc: number, key: KeySpec | null): string =>
  spellMidi(60 + mod12(pc), { key }).name.replace(/-?\d+$/, "");
const noteName = (midi: number, key: KeySpec | null): string => spellMidi(midi, { key }).name;

/** Display bar of a cycle (1-based; the pickup bar is 0 when the context declares one). */
const barOf = (at: Rat, ctx: RubricContext): number => barPosition(at, ctx.meter, ctx.pickup).bar;

// --- chords of a chord track ---------------------------------------------------------------------

/** One chord of a chord track as the Wave 4 rules read it. */
export interface TrackChord {
  slot: ChordSlot;
  /** The chord with the bass across every pitched learner track (contracts §6.7 item 5). */
  chord: ChordId | null;
  /** From a `chord()` symbol (identity from the symbol), else from the stacked notes. */
  fromSymbol: boolean;
  /** Stacked in 3rds (a triad or a seventh): false for clusters, dyads and single notes. */
  stacked: boolean;
}

/**
 * The chords of a track, one per change, over ONE period of the learner's loop (a 4-bar loop played for 8
 * bars has 4 chords). Hand-stacked chords are named only when they are stacked in 3rds (`readChord`): C D E
 * is a cluster, not a C chord; two notes are a dyad. Symbols name their chord whatever the voicing.
 */
export function trackChords(n: Normalized, track: string, ctx: RubricContext): TrackChord[] {
  const events = selectTrack(n, track);
  const reach = events.reduce((m, e) => Math.max(m, R.floor(e.onset) + 1), 0);
  const window = Math.max(1, Math.min(ctx.bars ?? reach, reach || 1));
  const period = periodOf(events, 128, window);
  const inPeriod = events.filter((e) => R.floor(e.onset) < period);
  const slots = chordSlots(inPeriod, { bass: pitched(n.all) });
  return slots.map((slot) => {
    if (slot.symbol !== undefined)
      return { slot, chord: slot.chord, fromSymbol: true, stacked: !!slot.chord };
    const pcs = [...new Set(slot.midis.map(mod12))];
    const bass = slot.bassMidi ?? Math.min(...slot.midis);
    const read = pcs.length >= 3 ? readChord(pcs, mod12(bass)) : null;
    return { slot, chord: read ? read.chord : null, fromSymbol: false, stacked: !!read };
  });
}

/** The quality a chord is read as against a listed quality: its own, or its triad core for a triad. */
function hasQuality(c: ChordId, q: ChordQuality): boolean {
  return c.quality === q || (TRIADS.includes(q) && triadCore(c).quality === q);
}
/** "a C major triad", "an A minor 7th". */
function chordWords(c: ChordId): string {
  return `${toLeadSheet({ ...c, bassPc: c.rootPc })} (${qualityWord(c.quality)})`;
}

export const chordQualitiesRule = (
  r: RuleOf<"chord-qualities">,
  n: Normalized,
  ctx: RubricContext,
): RuleEval => {
  const chords = trackChords(n, r.track ?? "@chords", ctx);
  if (chords.length === 0)
    return { ok: false, value: 0, ...(r.min ? { target: r.min } : {}), detail: "no chords found" };
  const triads = chords.filter(
    (c) => c.stacked && c.chord && TRIADS.includes(triadCore(c.chord).quality as ChordQuality),
  );
  const notStacked = chords.find((c) => !c.stacked);
  const problems: string[] = [];
  let value = 1;
  let target = 1;
  let where: RuleEval["where"];
  const at = (c: TrackChord) =>
    locAt(c.slot.span[0], ctx, { ...(c.slot.ids.length ? { noteIds: c.slot.ids } : {}) });
  if (r.contains) {
    const missing = r.contains.filter(
      (q) => !chords.some((c) => c.chord && c.stacked && hasQuality(c.chord, q)),
    );
    if (missing.length) problems.push(`no ${missing.map(qualityWord).join(" or ")} chord yet`);
    value = (r.contains.length - missing.length) / r.contains.length;
  }
  if (r.anyOf) {
    const min = r.min ?? 1;
    const hits = chords.filter(
      (c) => c.chord && c.stacked && r.anyOf?.some((q) => hasQuality(c.chord as ChordId, q)),
    );
    if (hits.length < min)
      problems.push(
        `${plural(hits.length, "chord")} ${hits.length === 1 ? "is" : "are"} ${r.anyOf.map(qualityWord).join(" or ")}; at least ${min}`,
      );
    value = Math.min(value, hits.length / min);
    target = 1;
  }
  if (r.subsetOf) {
    const out = chords.find(
      (c) => !c.chord || !c.stacked || !r.subsetOf?.some((q) => hasQuality(c.chord as ChordId, q)),
    );
    if (out) {
      const bar = barOf(out.slot.span[0], ctx);
      problems.push(
        out.chord && out.stacked
          ? `bar ${bar} is ${chordWords(out.chord)}; the brief allows ${r.subsetOf.map(qualityWord).join(", ")}`
          : `bar ${bar} is not stacked in 3rds (${out.slot.midis.map((m) => noteName(m, null)).join(" ")})`,
      );
      where = at(out);
      const ok = chords.filter(
        (c) => c.chord && c.stacked && r.subsetOf?.some((q) => hasQuality(c.chord as ChordId, q)),
      );
      value = Math.min(value, ok.length / chords.length);
    }
  }
  if (!r.contains && !r.anyOf && !r.subsetOf) {
    const min = r.min ?? 1;
    if (triads.length < min) {
      problems.push(`${plural(triads.length, "triad")}; at least ${min}`);
      if (notStacked) {
        const bar = barOf(notStacked.slot.span[0], ctx);
        problems.push(
          `bar ${bar} (${notStacked.slot.midis.map((m) => noteName(m, null)).join(" ")}) is not stacked in 3rds: skip a degree, twice`,
        );
        where = at(notStacked);
      }
    }
    value = Math.min(1, triads.length / min);
  }
  const ok = problems.length === 0;
  return {
    ok,
    value: Math.max(0, Math.min(1, value)),
    target,
    detail: ok
      ? chords
          .filter((c) => c.chord)
          .map((c) => toLeadSheet({ ...(c.chord as ChordId), bassPc: (c.chord as ChordId).rootPc }))
          .join(" ")
      : problems.join("; "),
    ...(where ? { where } : {}),
  };
};

const MEMBER = { 1: "3rd", 2: "5th", 3: "7th" } as const;

export const chordInversionsRule = (
  r: RuleOf<"chord-inversions">,
  n: Normalized,
  ctx: RubricContext,
): RuleEval => {
  const chords = trackChords(n, r.track ?? "@chords", ctx).filter((c) => c.chord);
  if (chords.length === 0) return { ok: false, value: 0, target: r.min, detail: "no chords found" };
  const allowed = r.of ?? [1, 2];
  const inv = chords.map((c) => inversionOf(c.chord as ChordId));
  const hits = chords.filter((_, i) => (allowed as number[]).includes(inv[i] as number));
  const ok = hits.length >= r.min;
  const wrongKind = chords.find(
    (_, i) => (inv[i] as number) > 0 && !(allowed as number[]).includes(inv[i] as number),
  );
  const which = allowed.map((x) => `the ${MEMBER[x]}`).join(" or ");
  const key = keyOf(n.all, ctx.key ?? null);
  const first = chords[0] as TrackChord;
  return {
    ok,
    value: hits.length,
    target: r.min,
    detail: ok
      ? `${plural(hits.length, "chord")} with ${which} in the bass: ${hits.map((c) => toLeadSheet(c.chord as ChordId)).join(" ")}`
      : hits.length === 0 && !wrongKind
        ? `every chord has its root as the lowest note (bar ${barOf(first.slot.span[0], ctx)}: ${pcName((first.chord as ChordId).bassPc, key)}); put ${which} lowest in at least ${plural(r.min, "chord")}`
        : `${plural(hits.length, "chord")} with ${which} in the bass; at least ${r.min}${wrongKind ? ` (bar ${barOf(wrongKind.slot.span[0], ctx)} has the ${MEMBER[inversionOf(wrongKind.chord as ChordId) as 1 | 2 | 3]} lowest)` : ""}`,
    ...(!ok ? { where: locAt(first.slot.span[0], ctx) } : {}),
  };
};

// --- pickup ----------------------------------------------------------------------------------------

export const pickupRule = (r: RuleOf<"pickup">, n: Normalized, ctx: RubricContext): RuleEval => {
  const events = selectTrack(n, r.track).filter((e) => e.midi !== null || e.drum !== undefined);
  if (events.length === 0) return { ok: false, detail: "no notes to start with a pickup" };
  const units = METERS[ctx.meter].unitsPerBar;
  const bar0 = events.filter((e) => R.floor(e.onset) === 0).sort((a, b) => R.cmp(a.onset, b.onset));
  const first = bar0[0];
  const unitsText = (x: Rat): string => {
    const v = (x[0] / x[1]) * units;
    return `${Number.isInteger(v) ? v : v.toFixed(2).replace(/0+$/, "")} ${v === 1 ? "beat" : "beats"}`;
  };
  if (!first)
    return { ok: false, detail: "bar 0 is empty: the pickup goes in the first cycle, after its rests" };
  if (R.eq(first.onset, rat(0)))
    return {
      ok: false,
      detail: "the line starts on the downbeat of bar 0, so there is no pickup: begin bar 0 with rests",
      where: locAt(first.onset, ctx, { noteIds: [first.id] }),
    };
  const downbeat = events.some((e) => R.eq(e.onset, rat(1)));
  if (!downbeat)
    return {
      ok: false,
      detail: "the pickup should lead into a note on the downbeat of the next bar",
      where: locAt(rat(1), ctx),
    };
  const length = R.sub(rat(1), first.onset);
  if (r.units) {
    const want = R.div(r.units, rat(units));
    if (!R.eq(length, want))
      return {
        ok: false,
        value: 0,
        detail: `the pickup is ${unitsText(length)} long; the brief asks for ${unitsText(want)}`,
        where: locAt(first.onset, ctx, { noteIds: [first.id] }),
      };
  }
  return { ok: true, detail: `a ${unitsText(length)} pickup into bar 1` };
};

// --- voice leading and the voicing gate --------------------------------------------------------------

/** One chord of a hand-voiced track: its voices in the order they are written (lowest first by default). */
export interface VoicedChord {
  at: Rat;
  /** MIDI per voice, in voice order. */
  voices: number[];
  ids: string[];
}

/**
 * Hand-voiced chords (notes that start together) with their voices in WRITTEN order: the atom each note
 * comes from in the code (`[c4,e4,g4]`), so a voice keeps its identity from chord to chord and a crossing
 * can be seen. Notes without a distinct source atom are ordered by pitch, lowest first.
 */
export function voicedChords(events: readonly NEvent[]): VoicedChord[] {
  const byOnset = new Map<string, NEvent[]>();
  for (const e of pitched(events)) {
    const k = `${e.onset[0]}/${e.onset[1]}`;
    byOnset.set(k, [...(byOnset.get(k) ?? []), e]);
  }
  const out: VoicedChord[] = [];
  for (const group of byOnset.values()) {
    const shared = (g: NEvent) =>
      g.locs.filter((l) => group.every((o) => o.locs.some((x) => x.from === l.from && x.to === l.to)));
    const own = (e: NEvent): number => {
      const sh = shared(e);
      const mine = e.locs.filter((l) => !sh.some((x) => x.from === l.from && x.to === l.to));
      return mine.length ? Math.min(...mine.map((l) => l.from)) : Number.POSITIVE_INFINITY;
    };
    const sorted = [...group].sort((a, b) => own(a) - own(b) || (a.midi as number) - (b.midi as number));
    // Duplicate atoms (the same note written twice) keep one voice each.
    out.push({
      at: (group[0] as NEvent).onset,
      voices: sorted.map((e) => e.midi as number),
      ids: sorted.map((e) => e.id),
    });
  }
  return out.sort((a, b) => R.cmp(a.at, b.at));
}

export interface GateFault {
  kind: "voice-count" | "common-tone" | "voice-leap" | "voice-crossing";
  /** Cycle of the chord the fault is in. */
  at: Rat;
  diagnostic: Diagnostic;
  detail: string;
}

export interface GateCheck {
  /** Mean credit over the chord changes, 0 to 1. */
  score: number;
  changes: number;
  faults: GateFault[];
}

/**
 * The hand voice-leading check of the voicing gate (U05.L07 `hand-voiced-cadence`): at each chord change
 * every voice moves to its next note (voice i to voice i, in written order); `voices` checks the count,
 * `commonTones` that a shared pitch class stays put in one voice, `maxMovePerVoice` the nearest motion
 * (`bassFree` leaves the lowest voice out of the motion limits and the common-tone check), and `noCrossing`
 * that no two voices swap order. Each change earns the share of its checks that pass.
 */
export function voicingGateCheck(
  chords: readonly VoicedChord[],
  r: Pick<
    RuleOf<"voice-leading">,
    "maxMovePerVoice" | "maxTotal" | "voices" | "commonTones" | "noCrossing" | "bassFree"
  >,
  ctx: Pick<RubricContext, "meter" | "pickup">,
  key: KeySpec | null,
): GateCheck {
  const faults: GateFault[] = [];
  const credits: number[] = [];
  const where = (at: Rat, ids: string[]) => locAt(at, ctx, ids.length ? { noteIds: ids } : {});
  const bar = (at: Rat): number => barPosition(at, ctx.meter, ctx.pickup).bar;
  const name = (m: number) => noteName(m, key);
  const push = (
    kind: GateFault["kind"],
    at: Rat,
    ids: string[],
    params: Record<string, string | number>,
    detail: string,
  ) =>
    faults.push({
      kind,
      at,
      detail,
      diagnostic: diag(
        `harmony.${kind}` as `harmony.${string}`,
        params,
        where(at, ids),
        kind === "voice-count" ? "quality" : "rubric",
      ),
    });
  if (r.voices !== undefined)
    for (const c of chords)
      if (c.voices.length !== r.voices)
        push(
          "voice-count",
          c.at,
          c.ids,
          { got: c.voices.length, exp: r.voices, notes: c.voices.map(name).join(" ") },
          `bar ${bar(c.at)} has ${plural(c.voices.length, "note")}; the brief asks for ${r.voices} voices`,
        );
  for (let i = 1; i < chords.length; i++) {
    const a = chords[i - 1] as VoicedChord;
    const b = chords[i] as VoicedChord;
    if (a.voices.length !== b.voices.length || a.voices.length === 0) {
      credits.push(0);
      if (r.voices === undefined)
        push(
          "voice-count",
          b.at,
          b.ids,
          { got: b.voices.length, exp: a.voices.length, notes: b.voices.map(name).join(" ") },
          `bar ${bar(b.at)} has ${plural(b.voices.length, "note")} after ${a.voices.length}: keep the same number of voices`,
        );
      continue;
    }
    let checks = 0;
    let passed = 0;
    const lowest = a.voices.indexOf(Math.min(...a.voices));
    const free = (v: number): boolean => !!r.bassFree && v === lowest;
    // Motion: each voice to its own next note.
    let total = 0;
    for (let v = 0; v < a.voices.length; v++) {
      const from = a.voices[v] as number;
      const to = b.voices[v] as number;
      if (free(v)) continue;
      total += Math.abs(to - from);
      checks++;
      if (Math.abs(to - from) <= r.maxMovePerVoice) {
        passed++;
        continue;
      }
      // The nearest note of the new chord to where this voice was.
      const pcs = [...new Set(b.voices.map(mod12))];
      let nearest = to;
      for (const pc of pcs)
        for (const cand of [from - 12, from, from + 12].map((x) => x - mod12(x) + pc))
          if (Math.abs(cand - from) < Math.abs(nearest - from)) nearest = cand;
      push(
        "voice-leap",
        b.at,
        b.ids,
        {
          from: name(from),
          to: name(to),
          semis: Math.abs(to - from),
          nearest: name(nearest),
          max: r.maxMovePerVoice,
        },
        `bar ${bar(b.at)}: the voice on ${name(from)} moves ${Math.abs(to - from)} half steps to ${name(to)}; ${name(nearest)} is ${Math.abs(nearest - from) === 0 ? "already there" : `${Math.abs(nearest - from)} away`}`,
      );
    }
    if (r.maxTotal !== undefined) {
      checks++;
      if (total <= r.maxTotal) passed++;
    }
    if (r.commonTones) {
      const upper = (xs: number[]) => xs.filter((_, v) => !free(v));
      const shared = [...new Set(upper(a.voices).map(mod12))].filter((pc) =>
        upper(b.voices).some((m) => mod12(m) === pc),
      );
      for (const pc of shared) {
        checks++;
        const kept = a.voices.some((m, v) => !free(v) && mod12(m) === pc && b.voices[v] === m);
        if (kept) {
          passed++;
          continue;
        }
        const held = a.voices.find((m, v) => !free(v) && mod12(m) === pc) as number;
        push(
          "common-tone",
          b.at,
          b.ids,
          { note: name(held), pc: pcName(pc, key) },
          `bar ${bar(b.at)}: ${pcName(pc, key)} is in both chords; keep the ${name(held)} where it is, in the same voice`,
        );
      }
    }
    if (r.noCrossing) {
      checks++;
      let crossed: [number, number] | null = null;
      for (let x = 0; x < a.voices.length && !crossed; x++)
        for (let y = 0; y < a.voices.length && !crossed; y++) {
          const ax = a.voices[x] as number;
          const ay = a.voices[y] as number;
          if (ax < ay && (b.voices[x] as number) > (b.voices[y] as number)) crossed = [x, y];
        }
      if (!crossed) passed++;
      else {
        const [x, y] = crossed;
        push(
          "voice-crossing",
          b.at,
          b.ids,
          {
            low: name(a.voices[x] as number),
            high: name(a.voices[y] as number),
            lowTo: name(b.voices[x] as number),
            highTo: name(b.voices[y] as number),
          },
          `bar ${bar(b.at)}: the voice on ${name(a.voices[x] as number)} moves above the voice on ${name(a.voices[y] as number)}; the voices cross`,
        );
      }
    }
    credits.push(checks === 0 ? 1 : passed / checks);
  }
  const countFaults = r.voices === undefined ? 0 : faults.filter((f) => f.kind === "voice-count").length;
  const base = credits.length ? credits.reduce((s, x) => s + x, 0) / credits.length : 0;
  // A chord with the wrong number of voices costs its share of the chords.
  const score = chords.length ? base * (1 - countFaults / chords.length) : 0;
  return { score: Math.max(0, Math.min(1, score)), changes: credits.length, faults };
}

/** Whether a `voice-leading` rule uses the gate fields (`voice-leading.gate`). */
export const isGateRule = (r: RuleOf<"voice-leading">): boolean =>
  r.voices !== undefined || !!r.commonTones || !!r.noCrossing || !!r.bassFree;

export const voiceLeadingGateRule = (
  r: RuleOf<"voice-leading">,
  n: Normalized,
  ctx: RubricContext,
): RuleEval => {
  const chords = voicedChords(selectTrack(n, r.track)).filter((c) => c.voices.length > 1);
  if (chords.length < 2) return { ok: false, value: 0, target: 1, detail: "no chord changes to lead" };
  const key = keyOf(n.all, ctx.key ?? null);
  const g = voicingGateCheck(chords, r, ctx, key);
  const first = g.faults[0];
  const ok = g.faults.length === 0;
  const kinds = [...new Set(g.faults.map((f) => f.kind))];
  return {
    ok,
    value: Math.round(g.score * 1000) / 1000,
    target: 1,
    detail: ok
      ? `every voice moves by at most ${r.maxMovePerVoice}${r.commonTones ? ", shared notes stay" : ""}${r.noCrossing ? ", no crossing" : ""}`
      : `${first?.detail}${g.faults.length > 1 ? ` (${plural(g.faults.length, "fault")}: ${kinds.map((k) => k.replace("voice-", "").replace("-", " ")).join(", ")})` : ""}; ${pct(g.score)} of the moves are smooth`,
    ...(first ? { where: first.diagnostic.where ?? {} } : {}),
    extra: g.faults.map((f) => f.diagnostic),
  };
};

// --- non-chord tones (U07.L04–L05) -------------------------------------------------------------------

const NCT_WORD: Record<string, string> = {
  passing: "passing",
  neighbour: "neighbour",
  appoggiatura: "appoggiatura",
  suspension: "suspension",
  anticipation: "anticipation",
  escape: "escape",
};

/**
 * At least `min` melody notes (one pass of the line) are non-chord tones of the listed kinds against the
 * chord under them, read with the same rules as the harmony view's `MelodyNoteRole`.
 */
export const nonChordTonesRule = (
  r: RuleOf<"non-chord-tones">,
  n: Normalized,
  ctx: RubricContext,
  slotsOf: (n: Normalized, track?: string, opts?: { exclude?: string }) => ChordSlot[],
): RuleEval => {
  const events = selectTrack(n, r.track);
  const reach = events.reduce((m, e) => Math.max(m, R.floor(e.onset) + 1), 0);
  const window = Math.max(1, Math.min(ctx.bars ?? reach, reach || 1));
  const period = periodOf(events, 128, window);
  const line = melodyLine(events.filter((e) => R.floor(e.onset) < period));
  // The line under test never helps name the chords it is read against.
  const slots = slotsOf(n, r.harmony, { exclude: r.track }).filter((s) => s.chord);
  if (line.length === 0) return { ok: false, value: 0, target: r.min, detail: "no melody notes" };
  if (slots.length === 0) return { ok: false, value: 0, target: r.min, detail: "no chords under the melody" };
  const roles = (r.roles ?? NCT_ROLES) as readonly string[];
  const found = classifyNct(line, slots, ctx.meter).map((x) => ({
    ...x,
    role: x.type === "neighbor" ? "neighbour" : x.type,
  }));
  const hits = found.filter((x) => roles.includes(x.role));
  const other = found.filter((x) => !roles.includes(x.role) && x.role !== "other");
  const key = keyOf(n.all, ctx.key ?? null);
  const first = hits[0] ?? other[0];
  const note = first ? line.find((x) => x.id === first.id) : undefined;
  const kinds = roles.map((x) => NCT_WORD[x] ?? x).join(" or ");
  const ok = hits.length >= r.min;
  const example = note
    ? ` (bar ${barOf(note.onset, ctx)}: ${noteName(note.midi, key)} is ${first && roles.includes(first.role) ? "a" : "only a"} ${NCT_WORD[first?.role ?? ""] ?? first?.role} note)`
    : "";
  return {
    ok,
    value: hits.length,
    target: r.min,
    detail: ok
      ? `${plural(hits.length, `${kinds} note`)}${example}`
      : `${plural(hits.length, `${kinds} note`)}; at least ${r.min}${example}. Step into a note outside the chord and step on`,
    ...(note ? { where: locAt(note.onset, ctx, { noteIds: [note.id] }) } : {}),
  };
};
const NCT_ROLES = ["passing", "neighbour", "appoggiatura", "suspension", "anticipation", "escape"] as const;
