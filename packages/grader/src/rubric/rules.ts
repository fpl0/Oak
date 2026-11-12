// Rubric rules → analyzers (exercises §3.10, contracts §5.6 and §6.6). Every rule returns whether it is
// met, a numeric value and target where it has one (partial credit `min(1, value / target)`), and a
// deterministic detail line for `rubric.unmet` / `rubric.met`.
import type {
  CadenceType,
  Diagnostic,
  KeySpec,
  Loc,
  NEvent,
  Rat,
  RubricRule,
  SectionRef,
} from "@oak/content-kit";
import { R, rat } from "@oak/content-kit";
import type { ChordId } from "@oak/theory";
import {
  degreeOf,
  noteToMidi,
  parseRN,
  pcOf,
  relativeKey,
  rnToChord,
  romanOf,
  transposeKey,
  triadCore,
} from "@oak/theory";
import type { ChordSlot } from "../analyze/chords.ts";
import {
  bluesForm,
  cadenceAt,
  chordChanges,
  chordPerBar,
  chordSlots,
  chordsOfRomans,
  findSchema,
  guideToneLine,
  harmonicRhythm,
  lowIntervalViolations,
  matchProgression,
  romanText,
  schemaRomans,
  slotAt,
  voiceLeadingOfSlots,
} from "../analyze/chords.ts";
import { locAt, mean, mod12, onsets, pitched, ratKey } from "../analyze/events.ts";
import { energyCurve, formMatches, registerSeparation, spanStats } from "../analyze/form.ts";
import { claveType, euclidMatch, grooveLock, polyRatio, velocityGhosts } from "../analyze/groove.ts";
import { keyFromContext, keyOf } from "../analyze/key.ts";
import {
  chordToneRatio,
  degreeSequence,
  isStrong,
  melodyLine,
  motifReuse,
  pitchRange,
  scaleMembership,
  stepLeap,
} from "../analyze/melody.ts";
import { syncopation } from "../analyze/meter.ts";
import { detectDevices } from "../analyze/piece.ts";
import { resolveSection, sectionsFromAst } from "../analyze/sections.ts";
import { pickSwingTrack } from "../analyze/swing.ts";
import { periodOf, selectTrack, selectTracks, tracksOfRole } from "../analyze/tracks.ts";
import { diag, toolText } from "../feedback/catalog.ts";
import { runMatcher } from "../match/index.ts";
import type { Normalized } from "../types.ts";
import type { RubricContext } from "./context.ts";

export interface RuleEval {
  ok: boolean;
  value?: number;
  target?: number;
  /** Partial credit when it is not `min(1, value / target)` (rules with an upper bound). */
  credit?: number;
  detail: string;
  where?: Loc;
  /** Findings beyond `rubric.unmet` (`form.inconsistent-arrange`, `rhythm.swing-missing`, ...). */
  extra?: Diagnostic[];
}

type RuleOf<K extends RubricRule["rule"]> = Extract<RubricRule, { rule: K }>;
type Impl<K extends RubricRule["rule"]> = (rule: RuleOf<K>, n: Normalized, ctx: RubricContext) => RuleEval;

const fmt = (x: number, digits = 2): string =>
  Number.isInteger(x) ? String(x) : x.toFixed(digits).replace(/0+$/, "").replace(/\.$/, "");
const pct = (x: number): string => `${Math.round(x * 100)}%`;
const times = (n: number): string => (n === 1 ? "once" : n === 2 ? "twice" : `${n} times`);

/** Bars of the piece: the AST total, else the queried bars, else through the last event. */
export function pieceBars(n: Normalized, ctx: RubricContext): number {
  if (ctx.totalBars) return ctx.totalBars;
  if (ctx.bars) return ctx.bars;
  return n.all.reduce((m, e) => Math.max(m, R.floor(e.onset) + 1), 0);
}
/** Bars of music actually present (the queried window). */
const windowBars = (n: Normalized, ctx: RubricContext): number =>
  Math.max(
    ctx.bars ?? 0,
    n.all.reduce((m, e) => Math.max(m, R.floor(e.onset) + 1), 0),
  );

export function pieceKey(n: Normalized, ctx: RubricContext): KeySpec | null {
  return keyOf(n.all, ctx.key ?? null);
}
/** Chord slots of the piece: the harmony tracks (symbols first), bass from every pitched learner track. */
export function pieceSlots(n: Normalized, track?: string): ChordSlot[] {
  const all = selectTrack(n, track ?? "*");
  const symbolic = all.filter((e) => e.chordSymbol !== undefined);
  const chords =
    symbolic.length > 0
      ? symbolic
      : track
        ? all
        : tracksOfRole(n, "chords").flatMap((t) => n.byTrack[t] ?? []);
  return chordSlots(chords.length > 0 ? chords : all, { bass: pitched(n.all) });
}
const coreEq = (a: ChordId | null, b: ChordId | null): boolean =>
  !!a && !!b && triadCore(a).rootPc === triadCore(b).rootPc && triadCore(a).quality === triadCore(b).quality;
const keyName = (k: KeySpec): string => `${k.tonic} ${k.mode}`;

// --- rules --------------------------------------------------------------------------------------

const bars: Impl<"bars"> = (r, n, ctx) => {
  const v = pieceBars(n, ctx);
  const ok = (r.min === undefined || v >= r.min) && (r.max === undefined || v <= r.max);
  const range =
    r.min !== undefined && r.max !== undefined
      ? r.min === r.max
        ? `${r.min}`
        : `${r.min}–${r.max}`
      : r.min !== undefined
        ? `at least ${r.min}`
        : `at most ${r.max}`;
  return {
    ok,
    value: v,
    ...(r.min !== undefined ? { target: r.min } : {}),
    ...(r.max !== undefined && v > r.max ? { credit: r.max / v } : {}),
    detail: `${v} bars; the brief asks for ${range}`,
  };
};
const durationSecRule: Impl<"duration-sec"> = (r, n, ctx) => {
  const sec = n.cps > 0 ? pieceBars(n, ctx) / n.cps : 0;
  return {
    ok: sec >= r.min - 1e-9,
    value: Math.round(sec * 10) / 10,
    target: r.min,
    detail: `${fmt(sec, 1)} s long; at least ${r.min} s`,
  };
};
const tempoBpm: Impl<"tempo-bpm"> = (r, n) => {
  const v = Math.round(n.bpm * 100) / 100;
  const ok = (r.min === undefined || v >= r.min - 1e-6) && (r.max === undefined || v <= r.max + 1e-6);
  return { ok, value: v, detail: `${fmt(v)} BPM; the brief asks for ${r.min ?? "any"}–${r.max ?? "any"}` };
};
const tracks: Impl<"tracks"> = (r, n) => {
  const live = Object.keys(n.byTrack).filter(
    (t) => !t.startsWith("band.") && (n.byTrack[t]?.length ?? 0) > 0,
  );
  if (!r.roles || r.roles.length === 0)
    return {
      ok: live.length >= r.min,
      value: live.length,
      target: r.min,
      detail: `${live.length} part(s); at least ${r.min}`,
    };
  const wanted = r.roles.filter((x) => x !== "all") as ("drums" | "bass" | "chords" | "melody")[];
  const of = new Set(wanted.flatMap((role) => tracksOfRole(n, role).filter((t) => live.includes(t))));
  const absent = wanted.filter((role) => !tracksOfRole(n, role).some((t) => live.includes(t)));
  const ok = absent.length === 0 && of.size >= r.min;
  return {
    ok,
    value: of.size,
    target: r.min,
    detail: absent.length
      ? `no ${absent.join(", ")} part`
      : `${of.size} ${wanted.join("/")} part(s); at least ${r.min}`,
  };
};
const inKey: Impl<"in-key"> = (r, n, ctx) => {
  const ev = selectTracks(n, r.tracks);
  const key = r.key === "declared" ? keyOf(ev, ctx.key ?? null) : r.key;
  if (!key) return { ok: false, detail: "no pitched notes" };
  const m = scaleMembership(ev, key);
  const first = m.outside[0];
  return {
    ok: m.ratio >= r.minRatio,
    value: m.ratio,
    target: r.minRatio,
    detail: `${pct(m.ratio)} of the notes are in ${keyName(key)}; at least ${pct(r.minRatio)}`,
    ...(first
      ? { where: locAt(first.onset, ctx, { track: first.track, noteIds: m.outside.map((e) => e.id) }) }
      : {}),
  };
};
const endsOnDegree: Impl<"ends-on-degree"> = (r, n, ctx) => {
  const line = melodyLine(selectTrack(n, r.track));
  const key = keyOf(
    line.map((x) => x.event),
    ctx.key ?? null,
  );
  const last = line[line.length - 1];
  if (!last || !key) return { ok: false, detail: "no melody to end" };
  const d = degreeOf(last.midi, key).degree;
  const ok = r.degrees.includes(d);
  const where = locAt(last.onset, ctx, {
    track: last.event.track,
    noteIds: [last.id],
    ...(last.event.locs.length ? { code: last.event.locs } : {}),
  });
  return {
    ok,
    detail: `it ends on ${d}; the brief asks for ${r.degrees.join(" or ")}`,
    where,
    ...(ok
      ? {}
      : { extra: [diag("melody.ends-on", { got: d, expected: r.degrees.join(" or ") }, where, "pitch")] }),
  };
};
const cadence: Impl<"cadence"> = (r, n, ctx) => {
  const key = pieceKey(n, ctx);
  if (!key) return { ok: false, detail: "no harmony found" };
  const slots = pieceSlots(n);
  const mel = melodyLine(selectTrack(n, "@melody").length ? selectTrack(n, "@melody") : []);
  const total = pieceBars(n, ctx);
  const ends =
    r.at === "last"
      ? [total]
      : r.at === "phrase-ends"
        ? Array.from({ length: Math.floor(total / 4) }, (_, i) => (i + 1) * 4)
        : [r.at.bar];
  if (ends.length === 0) return { ok: false, detail: "the piece is too short for a phrase" };
  const found: CadenceType[] = ends.map((b) => cadenceAt(slots, mel, key, b));
  const bad = ends.filter((_, i) => !r.types.includes(found[i] as CadenceType));
  const okCount = ends.length - bad.length;
  return {
    ok: bad.length === 0,
    value: okCount,
    target: ends.length,
    detail:
      bad.length === 0
        ? `${found.join(", ")} at bar ${ends.join(", ")}`
        : `bar ${bad[0]} ends with ${found[ends.indexOf(bad[0] as number)]}; the brief asks for ${r.types.join(" or ")}`,
    ...(bad.length ? { where: { bar: bad[0] as number } } : {}),
  };
};
const chordTonesStrong: Impl<"chord-tones-strong"> = (r, n, ctx) => {
  const line = melodyLine(selectTrack(n, r.melody));
  const slots = pieceSlots(n, r.harmony);
  const res = chordToneRatio(line, slots, ctx.meter, r.strength);
  if (res.n === 0)
    return {
      ok: false,
      value: 0,
      target: r.minRatio,
      detail: "no melody notes on strong beats over a chord",
    };
  const miss = res.misses[0];
  return {
    ok: res.ratio >= r.minRatio,
    value: res.ratio,
    target: r.minRatio,
    detail: `${pct(res.ratio)} of strong-beat notes are chord tones; at least ${pct(r.minRatio)}`,
    ...(miss
      ? { where: locAt(miss.onset, ctx, { track: miss.event.track, noteIds: res.misses.map((m) => m.id) }) }
      : {}),
  };
};
const progression: Impl<"progression"> = (r, n, ctx) => {
  const schema = r.schema ? findSchema(r.schema) : undefined;
  if (r.schema && !schema) return { ok: false, detail: `unknown schema ${r.schema}` };
  let key = pieceKey(n, ctx);
  if (!key) return { ok: false, detail: "no harmony found" };
  if (schema && (schema.mode === "minor") !== (key.mode === "minor") && !ctx.key) key = relativeKey(key);
  const romans = schema ? schemaRomans(schema) : { rn: r.rn ?? [], perBar: false };
  const want = chordsOfRomans(romans.rn, key);
  const slots = pieceSlots(n, r.track);
  const got = romans.perBar ? chordPerBar(slots, pieceBars(n, ctx)) : chordChanges(slots);
  const m = matchProgression(got, want, r.allowRotation ?? schema?.rotations ?? false);
  const ok = m.matched >= m.length && m.length > 0;
  const gotText = got
    .slice(0, Math.max(m.length, 1))
    .map((c) => (c ? romanText(romanOf(c, key)) : "?"))
    .join(" ");
  return {
    ok,
    value: Math.min(m.matched, m.length),
    target: m.length,
    detail: ok
      ? `${romans.rn.join(" ")}${m.rotation ? " (rotated)" : ""}`
      : `chords go ${gotText}; the brief asks for ${romans.rn.join(" ")}`,
    ...(!ok && got.length > m.matched ? { where: { slot: m.matched + 1 } } : {}),
  };
};
function rnMatches(
  slot: ChordSlot,
  next: ChordSlot | undefined,
  rn: string,
  key: KeySpec,
): { hit: boolean; resolved: boolean } {
  const parsed = parseRN(rn, key);
  if (!parsed || !slot.chord) return { hit: false, resolved: false };
  const want = rnToChord(parsed, key);
  if (!coreEq(slot.chord, want)) return { hit: false, resolved: false };
  if (parsed.of) {
    // An applied chord must sound applied: a plain I before IV is not V/IV, nor VII before III in minor
    // (V/III). `romanOf` reads the chord in context; only a chord it calls applied counts.
    if (!romanOf(slot.chord, key, next?.chord ?? undefined).of) return { hit: false, resolved: false };
    const target = rnToChord({ ...parsed.of, inversion: 0 }, key);
    return { hit: true, resolved: !!next?.chord && next.chord.rootPc === target.rootPc };
  }
  // A plain dominant resolves to the tonic.
  return { hit: true, resolved: !!next?.chord && mod12(next.chord.rootPc - slot.chord.rootPc) === 5 };
}
const containsRn: Impl<"contains-rn"> = (r, n, ctx) => {
  const key = pieceKey(n, ctx);
  if (!key) return { ok: false, detail: "no harmony found" };
  const slots = pieceSlots(n);
  let count = 0;
  let unresolved: number | null = null;
  slots.forEach((s, i) => {
    const hit = r.rn.map((x) => rnMatches(s, slots[i + 1], x, key)).find((h) => h.hit);
    if (!hit) return;
    if (r.mustResolve && !hit.resolved) {
      unresolved ??= i;
      return;
    }
    count++;
  });
  const where =
    unresolved !== null
      ? locAt((slots[unresolved] as ChordSlot).span[0], ctx, { slot: unresolved + 1 })
      : undefined;
  return {
    ok: count >= r.min,
    value: count,
    target: r.min,
    detail: `${count} × ${r.rn.join("/")}${r.mustResolve ? " that resolve" : ""}; at least ${r.min}${unresolved !== null ? " (one doesn't resolve)" : ""}`,
    ...(where ? { where } : {}),
  };
};
const range: Impl<"range"> = (r, n, ctx) => {
  const ev = selectTrack(n, r.track);
  const pr = pitchRange(ev);
  if (!pr) return { ok: false, detail: "no pitched notes" };
  let ok = true;
  const parts: string[] = [`span ${pr.span} semitones`];
  let credit = 1;
  if (r.maxSpan !== undefined) {
    if (pr.span > r.maxSpan) {
      ok = false;
      credit = r.maxSpan / pr.span;
    }
    parts.push(`at most ${r.maxSpan}`);
  }
  if (r.within) {
    const [lo, hi] =
      r.within === "learner-voice"
        ? [ctx.profile?.rangeLow ?? 0, ctx.profile?.rangeHigh ?? 127]
        : [noteToMidi(r.within[0]) ?? 0, noteToMidi(r.within[1]) ?? 127];
    const outside = pitched(ev).filter((e) => e.midi < lo || e.midi > hi);
    if (outside.length > 0) {
      ok = false;
      credit = Math.min(credit, 1 - outside.length / pitched(ev).length);
      parts.push(
        `${outside.length} note(s) outside ${r.within === "learner-voice" ? "your voice" : r.within.join("–")}`,
      );
    }
  }
  return {
    ok,
    value: pr.span,
    ...(r.maxSpan !== undefined ? { target: r.maxSpan } : {}),
    credit,
    detail: parts.join("; "),
  };
};
const stepRatio: Impl<"step-ratio"> = (r, n) => {
  const s = stepLeap(melodyLine(selectTrack(n, r.track)));
  return {
    ok: s.stepRatio >= r.min,
    value: s.stepRatio,
    target: r.min,
    detail: `${pct(s.stepRatio)} steps; at least ${pct(r.min)}`,
  };
};
const harmonicRhythmRule: Impl<"harmonic-rhythm"> = (r, n, ctx) => {
  const b = windowBars(n, ctx);
  const per = harmonicRhythm(chordSlotsMerged(pieceSlots(n)), b);
  const avg = per.length ? mean(per) : 0;
  const [lo, hi] = r.changesPerBar;
  return {
    ok: avg >= lo - 1e-9 && avg <= hi + 1e-9,
    value: avg,
    target: lo,
    detail: `${fmt(avg)} chord changes per bar; the brief asks for ${lo}–${hi}`,
  };
};
/** Slots with repeated neighbours merged into one change. */
function chordSlotsMerged(slots: readonly ChordSlot[]): ChordSlot[] {
  const out: ChordSlot[] = [];
  for (const s of slots) {
    const last = out[out.length - 1];
    if (last && coreEq(last.chord, s.chord) && R.eq(last.span[1], s.span[0]))
      last.span = [last.span[0], s.span[1]];
    else out.push({ ...s, span: [s.span[0], s.span[1]] });
  }
  return out;
}
const kickOnsets = (n: Normalized, ref: string): Rat[] => {
  const ev = selectTrack(n, ref);
  const kicks = ev.filter((e) => e.drum === "kick");
  return onsets(kicks.length > 0 ? kicks : ev);
};
const grooveLockRule: Impl<"groove-lock"> = (r, n) => {
  const g = grooveLock(kickOnsets(n, r.kick), onsets(selectTrack(n, r.bass)), rat(0), rat(1, 16));
  return {
    ok: g.lock >= r.min,
    value: g.lock,
    target: r.min,
    detail: `${pct(g.lock)} of bass notes land on a kick; at least ${pct(r.min)}`,
  };
};
const swingRule: Impl<"swing"> = (r, n, ctx) => {
  const refs = Array.isArray(r.track) ? r.track : [r.track];
  const candidates = refs.map((ref) => {
    let ev = selectTrack(n, ref);
    if (r.drums && r.drums.length > 0)
      ev = ev.filter((e) => e.drum !== undefined && (r.drums as string[]).includes(e.drum));
    return { ref, events: ev };
  });
  const picked = pickSwingTrack(candidates, ctx.meter, r.subdivision);
  if (!picked) {
    const line = refs[0] ?? "hats";
    return {
      ok: false,
      detail: `no line plays ${r.subdivision === 8 ? "8ths" : "16ths"} to swing; swing \`${line}\``,
      extra: [
        diag(
          "rhythm.swing-missing",
          {
            got: "straight or too sparse",
            expected: `swung ${r.subdivision === 8 ? "8ths" : "16ths"} on ${line}`,
          },
          { track: line },
          "rhythm",
        ),
      ],
    };
  }
  const ratio = picked.measure.ratio;
  const [lo, hi] = r.ratio;
  const ok = ratio >= lo - 1e-9 && ratio <= hi + 1e-9;
  return {
    ok,
    value: Math.round(ratio * 100) / 100,
    target: lo,
    detail: `${picked.candidate.ref} swings at ${fmt(ratio)}:1; the brief asks for ${lo}–${hi}`,
    ...(!ok && picked.measure.cls === "straight"
      ? {
          extra: [
            diag(
              "rhythm.swing-missing",
              { got: "straight", expected: "swung" },
              { track: picked.candidate.ref },
              "rhythm",
            ),
          ],
        }
      : {}),
  };
};
const syncopationRule: Impl<"syncopation"> = (r, n, ctx) => {
  const s = syncopation(selectTrack(n, r.track), ctx.meter);
  return {
    ok: s.count >= r.min,
    value: s.count,
    target: r.min,
    detail: `${s.count} syncopated note(s); at least ${r.min}`,
  };
};
const form: Impl<"form"> = (r, _n, ctx) => {
  const s = sectionsFromAst(ctx.code);
  if (!s)
    return {
      ok: false,
      detail: "no sections: write one `arrange()` per labelled track",
      extra: [diag("form.no-sections")],
    };
  if ("inconsistent" in s)
    return {
      ok: false,
      detail: s.inconsistent.detail,
      extra: [
        diag("form.inconsistent-arrange", { detail: s.inconsistent.detail }, { track: s.inconsistent.track }),
      ],
    };
  const ok = formMatches(r.pattern, s.sections);
  const got = s.sections.map((x) => x.tag).join(" ");
  return { ok, detail: ok ? got : `the form is ${got}; the brief asks for ${r.pattern}` };
};
const voiceLeadingRule: Impl<"voice-leading"> = (r, n) => {
  const slots = chordSlots(selectTrack(n, r.track));
  const moves = voiceLeadingOfSlots(slots);
  if (moves.length === 0) return { ok: false, detail: "no chord changes to lead" };
  const good = moves.filter(
    (m) => m.vl.maxMove <= r.maxMovePerVoice && (r.maxTotal === undefined || m.vl.total <= r.maxTotal),
  );
  const bad = moves.find((m) => !good.includes(m));
  return {
    ok: good.length === moves.length,
    value: good.length / moves.length,
    target: 1,
    detail: bad
      ? `a voice moves ${bad.vl.maxMove} semitones (total ${bad.vl.total}); at most ${r.maxMovePerVoice}${r.maxTotal !== undefined ? ` (total ${r.maxTotal})` : ""}`
      : `smooth: every voice moves ≤ ${r.maxMovePerVoice}`,
    ...(bad ? { where: { bar: R.floor(bad.at) + 1 } } : {}),
  };
};
const guideTones: Impl<"guide-tones"> = (r, n) => {
  const g = guideToneLine(melodyLine(selectTrack(n, r.track)), pieceSlots(n, r.harmony));
  const ok = g.ratio >= r.minRatio && g.maxMove <= 2;
  return {
    ok,
    value: g.ratio,
    target: r.minRatio,
    detail: `${pct(g.ratio)} of changes meet a 3rd or 7th (largest move ${g.maxMove}); at least ${pct(r.minRatio)}, moves ≤ 2`,
  };
};
const modulation: Impl<"modulation"> = (r, n, ctx) => {
  const total = pieceBars(n, ctx);
  const start = keyOf(
    n.all.filter((e) => R.floor(e.onset) < Math.min(4, total)),
    ctx.key ?? null,
  );
  if (!start) return { ok: false, detail: "no pitched notes" };
  const target: KeySpec =
    typeof r.to === "object"
      ? r.to
      : r.to === "up-step"
        ? transposeKey(start, 2)
        : r.to === "up-half"
          ? transposeKey(start, 1)
          : r.to === "dominant"
            ? transposeKey(start, 7)
            : relativeKey(start);
  // Each 4-bar window's key: the `.scale()` context first, then the estimate.
  for (let b = 4; b < total; b += 4) {
    if (r.atBar !== undefined && Math.abs(b + 1 - r.atBar) > 3) continue;
    const k = keyOf(
      n.all.filter((e) => R.floor(e.onset) >= b && R.floor(e.onset) < b + 4),
      null,
    );
    if (k && pcOf(k.tonic) === pcOf(target.tonic) && (k.mode === "minor") === (target.mode === "minor"))
      return { ok: true, detail: `moves to ${keyName(target)} at bar ${b + 1}` };
  }
  return { ok: false, detail: `no move to ${keyName(target)}${r.atBar ? ` near bar ${r.atBar}` : ""}` };
};
const CHARACTERISTIC: Record<string, number> = {
  dorian: 9,
  mixolydian: 10,
  lydian: 6,
  phrygian: 1,
  minor: 8,
  locrian: 6,
};
const AVOID: Record<string, number[]> = {
  mixolydian: [11],
  dorian: [8],
  lydian: [5],
  phrygian: [2],
  minor: [11, 9],
  major: [10],
};
const modeRule: Impl<"mode"> = (r, n, ctx) => {
  const tonic = pcOf(r.tonic);
  const notes = pitched(n.all);
  if (notes.length === 0) return { ok: false, detail: "no pitched notes" };
  const avoided = notes.filter((e) => (AVOID[r.mode] ?? []).includes(mod12(e.midi - tonic)));
  const ch = CHARACTERISTIC[r.mode];
  const strongChar =
    ch === undefined
      ? 0
      : notes.filter((e) => mod12(e.midi - tonic) === ch && isStrong(e.onset, ctx.meter, "strong")).length;
  const b = windowBars(n, ctx);
  const perBar = chordPerBar(pieceSlots(n), b);
  const tonicBars = perBar.filter((c) => c && c.rootPc === tonic).length;
  const problems: string[] = [];
  if (avoided.length > 0) problems.push(`${avoided.length} note(s) outside ${r.tonic} ${r.mode}`);
  if (r.requireCharacteristic && strongChar < 2)
    problems.push(`its colour tone is on a strong beat ${strongChar}× (at least 2)`);
  if (perBar.some((c) => c) && tonicBars / Math.max(1, b) < 0.4)
    problems.push(`the ${r.tonic} chord is in ${pct(tonicBars / Math.max(1, b))} of bars (at least 40%)`);
  const first = avoided[0];
  return {
    ok: problems.length === 0,
    detail: problems.length ? problems.join("; ") : `${r.tonic} ${r.mode} with its colour tone`,
    ...(first
      ? { where: locAt(first.onset, ctx, { track: first.track, noteIds: avoided.map((e) => e.id) }) }
      : {}),
  };
};
const bluesFormRule: Impl<"blues-form"> = (r, n, ctx) => {
  const key = pieceKey(n, ctx);
  if (!key) return { ok: false, detail: "no harmony found" };
  // The blues is read on the tonic of a major or blues key.
  const k: KeySpec = { tonic: key.tonic, mode: "major" };
  const b = bluesForm(pieceSlots(n), k, windowBars(n, ctx));
  const ok = b.variant === r.variant || (r.variant === "standard" && b.variant === "quick-change");
  return {
    ok: ok && b.choruses >= 1,
    value: b.choruses,
    target: 1,
    detail: ok
      ? `${b.choruses} chorus(es) of ${r.variant} blues`
      : `bars ${b.wrongBars.slice(0, 3).join(", ")} break the ${r.variant} blues`,
    ...(!ok && b.wrongBars[0] ? { where: { bar: b.wrongBars[0] } } : {}),
  };
};
const euclid: Impl<"euclid"> = (r, n) => {
  const m = euclidMatch(onsets(selectTrack(n, r.track)), r.k, r.n);
  const ok = m.ok && (r.rotationFree || m.rotation === 0);
  return {
    ok,
    detail: ok ? `E(${r.k},${r.n})` : `the rhythm isn't E(${r.k},${r.n})${m.ok ? " in this rotation" : ""}`,
  };
};
const clave: Impl<"clave"> = (r, n) => {
  const c = claveType(onsets(selectTrack(n, r.track)));
  const ok = c.type === r.type && c.direction === r.direction;
  return {
    ok,
    value: c.bars,
    detail: ok
      ? `${r.type} ${r.direction} for ${c.bars} bars`
      : `that's ${c.type === "none" ? "no clave" : `${c.type}${c.direction ? ` ${c.direction}` : ""}`}; the brief asks for ${r.type} ${r.direction}`,
  };
};
const polyrhythm: Impl<"polyrhythm"> = (r, n) => {
  const p = polyRatio(onsets(selectTrack(n, r.a)), onsets(selectTrack(n, r.b)));
  const ok = !!p && p[0] === r.ratio[0] && p[1] === r.ratio[1];
  return {
    ok,
    detail: p
      ? `${p[0]}:${p[1]}; the brief asks for ${r.ratio.join(":")}`
      : "the two lines aren't evenly spaced",
  };
};
const registerSep: Impl<"register-separation"> = (r, n) => {
  const s = registerSeparation(selectTrack(n, r.low), selectTrack(n, r.high));
  return {
    ok: s.gap >= r.minGapSemis,
    value: s.gap,
    target: r.minGapSemis,
    detail: `${s.gap} semitones apart; at least ${r.minGapSemis}`,
  };
};
const noMuddyLow: Impl<"no-muddy-low"> = (r, n, ctx) => {
  const v = lowIntervalViolations(selectTrack(n, r.track));
  const first = v[0];
  return {
    ok: v.length === 0,
    value: v.length,
    credit: v.length === 0 ? 1 : 0,
    detail: first
      ? `a ${first.interval}-semitone interval low down (bass note ${first.low}) sounds muddy`
      : "the low end is clear",
    ...(first ? { where: locAt(first.at, ctx) } : {}),
  };
};
/** Source fallback when no toolbox is given: `tb.x.y` → a call or method named `y`; `tb.mini.euclid` → `(k,n)`. */
function usesInSource(code: string, tool: string): number {
  const last = tool.split(".").pop() ?? tool;
  if (tool === "tb.mini.euclid") return (code.match(/\(\s*\d+\s*,\s*\d+/g) ?? []).length;
  if (tool.startsWith("snd.")) return (code.match(new RegExp(`["\\s,]${last}["\\s,:*]`, "g")) ?? []).length;
  return (code.match(new RegExp(`\\b${last.replace(/[-.]/g, "\\$&")}\\s*\\(`, "g")) ?? []).length;
}
const uses: Impl<"uses"> = (r, _n, ctx) => {
  const tools = Array.isArray(r.tool) ? r.tool : [r.tool];
  const min = r.min ?? 1;
  const used = ctx.toolsUsed ? ctx.toolsUsed(ctx.code).map((t) => t.id) : null;
  const count = tools.reduce(
    (a, t) => a + (used ? used.filter((u) => u === t).length : usesInSource(ctx.code, t)),
    0,
  );
  const label = tools.map((t) => toolText(t, ctx.toolCode)).join(" or ");
  return {
    ok: count >= min,
    value: count,
    target: min,
    detail:
      count === 0
        ? `${label} is not used yet (at least ${times(min)})`
        : `${label} used ${times(count)}; at least ${times(min)}`,
  };
};
/** Longest loop the motif check looks for (bars); a line with no shorter period is read whole. */
const MOTIF_PERIOD_CAP = 16;
const motifReuseRule: Impl<"motif-reuse"> = (r, n, ctx) => {
  const events = selectTrack(n, r.track);
  const unitBars = r.unitBars ?? 1;
  // One pass of the learner's own line: a 2-bar riff rendered over 16 bars is read as its 2 bars, so the
  // loop's repeats never count as reuse (contracts §5.6 measures the idea, not the playback).
  const reach = events.reduce((m, e) => Math.max(m, R.floor(e.onset) + 1), 0);
  const window = Math.max(1, Math.min(ctx.bars ?? reach, reach || 1));
  const period = periodOf(events, MOTIF_PERIOD_CAP, window);
  const m = motifReuse(melodyLine(events), unitBars, {
    periodBars: period,
    shape: r.shape ?? "semitones",
    key: keyFromContext(events) ?? ctx.key ?? null,
  });
  const unit = unitBars === 1 ? "bar" : `${fmt(unitBars)}-bar group`;
  const span = period < window ? `in one pass of your ${period}-bar loop` : `over your ${period} bars`;
  const verb = m.matched === 1 ? "repeats" : "repeat";
  return {
    ok: m.ratio >= r.minRatio,
    value: m.ratio,
    target: r.minRatio,
    detail: `${span}, ${m.matched} of ${m.units} ${unit}s ${verb} the shape of an earlier one (${pct(m.ratio)}); at least ${pct(r.minRatio)}`,
  };
};

function sectionsFor(
  ctx: RubricContext,
): { sections: import("../types.ts").SectionInfo[]; totalBars: number } | { error: RuleEval } {
  const s = sectionsFromAst(ctx.code);
  if (!s)
    return {
      error: {
        ok: false,
        detail: "no sections: write one `arrange()` per labelled track",
        extra: [diag("form.no-sections")],
      },
    };
  if ("inconsistent" in s)
    return {
      error: {
        ok: false,
        detail: s.inconsistent.detail,
        extra: [
          diag(
            "form.inconsistent-arrange",
            { detail: s.inconsistent.detail },
            { track: s.inconsistent.track },
          ),
        ],
      },
    };
  return s;
}
const refText = (ref: SectionRef): string =>
  ref === "last" ? "the last section" : "bars" in ref ? `bars ${ref.bars[0]}–${ref.bars[1]}` : ref.section;

const contrast: Impl<"contrast"> = (r, n, ctx) => {
  const s = sectionsFor(ctx);
  if ("error" in s) return s.error;
  const a = resolveSection(r.a, s.sections, s.totalBars);
  const b = resolveSection(r.b, s.sections, s.totalBars);
  if (!a || !b) return { ok: false, detail: `no section ${!a ? refText(r.a) : refText(r.b)}` };
  const th = { pitchSemis: 3, densityRatio: 0.25, registerSemis: 5, energyDelta: 0.15, ...r.thresholds };
  const mel = selectTrack(n, "@melody");
  const sa = spanStats(n.all, mel, a);
  const sb = spanStats(n.all, mel, b);
  const met: string[] = [];
  const key = pieceKey(n, ctx);
  for (const axis of r.axes) {
    if (
      axis === "pitch" &&
      Number.isFinite(sa.meanPitch) &&
      Number.isFinite(sb.meanPitch) &&
      Math.abs(sa.meanPitch - sb.meanPitch) >= th.pitchSemis
    )
      met.push("pitch");
    if (
      axis === "density" &&
      Math.max(sa.density, sb.density) > 0 &&
      Math.abs(sa.density - sb.density) / Math.max(sa.density, sb.density) >= th.densityRatio
    )
      met.push("density");
    if (
      axis === "register" &&
      sa.low !== null &&
      sb.low !== null &&
      sa.high !== null &&
      sb.high !== null &&
      (Math.abs(sa.low - sb.low) >= th.registerSemis || Math.abs(sa.high - sb.high) >= th.registerSemis)
    )
      met.push("register");
    if (axis === "energy") {
      const curve = energyCurve(n.byTrack, s.totalBars);
      const ea = mean(curve.slice(a[0], a[1]));
      const eb = mean(curve.slice(b[0], b[1]));
      if (Math.abs(ea - eb) >= th.energyDelta) met.push("energy");
    }
    if (axis === "harmony" && key) {
      const slots = pieceSlots(n);
      const rnSeq = (span: [number, number]): string =>
        chordPerBar(slots, span[1])
          .slice(span[0])
          .map((c) => (c ? romanText(romanOf(c, key)) : "-"))
          .join(" ");
      if (rnSeq(a) !== rnSeq(b)) met.push("harmony");
    }
  }
  return {
    ok: met.length >= r.minAxes,
    value: met.length,
    target: r.minAxes,
    detail: `${refText(r.a)} and ${refText(r.b)} differ in ${met.length ? met.join(", ") : "nothing measured"}; at least ${r.minAxes} of ${r.axes.join(", ")}`,
  };
};
const keyChange: Impl<"key-change"> = (r, n, ctx) => {
  const s = sectionsFor(ctx);
  if ("error" in s) return s.error;
  const span = resolveSection(r.at, s.sections, s.totalBars);
  if (!span) return { ok: false, detail: `no section ${refText(r.at)}` };
  const idx = s.sections.findIndex((x) => x.startBar === span[0]);
  const here = s.sections[idx];
  const before = idx > 0 ? s.sections[idx - 1] : undefined;
  if (!here || !before) return { ok: false, detail: "the key change needs a section before it" };
  const inSpan = (from: number, to: number): NEvent[] =>
    pitched(n.all).filter((e) => R.floor(e.onset) >= from && R.floor(e.onset) < to);
  const kOld =
    keyFromContext(inSpan(before.startBar, before.startBar + before.bars)) ??
    keyOf(inSpan(before.startBar, before.startBar + before.bars), null);
  const kNew =
    keyFromContext(inSpan(here.startBar, here.startBar + here.bars)) ??
    keyOf(inSpan(here.startBar, here.startBar + here.bars), null);
  if (!kOld || !kNew) return { ok: false, detail: "no pitched notes to read the keys from" };
  const diff = mod12(pcOf(kNew.tonic) - pcOf(kOld.tonic));
  const problems: string[] = [];
  if (!r.semitones.some((x) => mod12(x) === diff))
    problems.push(
      `${keyName(kOld)} → ${keyName(kNew)} is +${diff}; the brief asks for +${r.semitones.join(" or +")}`,
    );
  const minAfter = r.minBarsAfter ?? 8;
  if (here.bars < minAfter) problems.push(`the new key lasts ${here.bars} bars; at least ${minAfter}`);
  if (r.sameMelody) {
    const prevSame = [...s.sections.slice(0, idx)].reverse().find((x) => x.label === here.label) ?? before;
    const mel = selectTrack(n, "@melody");
    const degs = (from: number, to: number, k: KeySpec): string =>
      degreeSequence(
        melodyLine(mel.filter((e) => R.floor(e.onset) >= from && R.floor(e.onset) < to)),
        k,
      ).join(" ");
    const kPrev = keyFromContext(inSpan(prevSame.startBar, prevSame.startBar + prevSame.bars)) ?? kOld;
    const len = Math.min(prevSame.bars, here.bars);
    if (
      degs(prevSame.startBar, prevSame.startBar + len, kPrev) !==
      degs(here.startBar, here.startBar + len, kNew)
    )
      problems.push(`the melody of ${here.tag} isn't the ${prevSame.tag} melody moved to the new key`);
  }
  return {
    ok: problems.length === 0,
    detail: problems.length
      ? problems.join("; ")
      : `${keyName(kOld)} → ${keyName(kNew)} at bar ${here.startBar + 1}`,
    where: { bar: here.startBar + 1 },
  };
};
const velocityGhostsRule: Impl<"velocity-ghosts"> = (r, n, ctx) => {
  const g = velocityGhosts(selectTrack(n, r.track), {
    meter: ctx.meter,
    ...(r.maxGain !== undefined ? { maxGain: r.maxGain } : {}),
    ...(r.on ? { on: r.on } : {}),
  });
  return {
    ok: g.length >= r.min,
    value: g.length,
    target: r.min,
    detail: `${g.length} ghost note(s)${r.on === "16th-offbeat" ? " on 16th off-beats" : ""}; at least ${r.min}`,
  };
};
const onsetsRule: Impl<"onsets"> = (r, n, ctx) => {
  let ev = selectTrack(n, r.track);
  if (r.drum) ev = ev.filter((e) => e.drum === r.drum);
  const want = (xs: readonly Rat[] | undefined): string[] =>
    (xs ?? []).map((x) => ratKey(r.perBar ? R.frac(x) : x)).sort();
  const check = (got: Set<string>): boolean => {
    if (r.contains && !want(r.contains).every((k) => got.has(k))) return false;
    if (r.equals) {
      const eq = want(r.equals);
      if (eq.length !== got.size || !eq.every((k) => got.has(k))) return false;
    }
    return true;
  };
  if (!r.perBar) {
    const ok = check(new Set(onsets(ev).map(ratKey)));
    return { ok, detail: ok ? "the onsets are right" : "the onsets differ from the brief" };
  }
  const total = windowBars(n, ctx);
  let good = 0;
  let firstBad: number | null = null;
  for (let b = 0; b < total; b++) {
    const got = new Set(onsets(ev.filter((e) => R.floor(e.onset) === b)).map((o) => ratKey(R.frac(o))));
    if (check(got)) good++;
    else firstBad ??= b;
  }
  return {
    ok: total > 0 && good === total,
    value: good,
    target: total,
    detail: `${good} of ${total} bars have the onsets`,
    ...(firstBad !== null ? { where: locAt(rat(firstBad), ctx) } : {}),
  };
};
const degreeSet: Impl<"degree-set"> = (r, n, ctx) => {
  const ev = pitched(selectTrack(n, r.track));
  const key = keyOf(ev, ctx.key ?? null);
  if (!key || ev.length === 0) return { ok: false, detail: "no pitched notes" };
  const degs = ev.map((e) => degreeOf(e.midi, key).degree);
  const problems: string[] = [];
  if (r.subsetOf) {
    const out = degs.filter((d) => !(r.subsetOf as string[]).includes(d));
    if (out.length) problems.push(`degree ${out[0]} is outside ${r.subsetOf.join(" ")}`);
  }
  if (r.contains) {
    const min = r.minCount ?? 1;
    const short = r.contains.filter((d) => degs.filter((x) => x === d).length < min);
    if (short.length)
      problems.push(`${short.join(" and ")} appear${short.length === 1 ? "s" : ""} fewer than ${min}×`);
  }
  return {
    ok: problems.length === 0,
    detail: problems.length ? problems.join("; ") : "the degrees are right",
  };
};
const soundName = (id: string): string =>
  id
    .replace(/^snd\./, "")
    .split(".")
    .pop() ?? id;
const sounds: Impl<"sounds"> = (r, n) => {
  const used = new Set(n.all.map((e) => e.s).filter((s): s is string => !!s));
  const problems: string[] = [];
  if (r.contains) {
    const missing = r.contains.filter((id) => !used.has(soundName(id)));
    if (missing.length) problems.push(`no ${missing.map(soundName).join(", ")}`);
  }
  if (r.subsetOf) {
    const allowed = new Set(r.subsetOf.map(soundName));
    const extra = [...used].filter((s) => !allowed.has(s));
    if (extra.length) problems.push(`${extra.join(", ")} isn't one of ${[...allowed].join(", ")}`);
  }
  return { ok: problems.length === 0, detail: problems.length ? problems.join("; ") : [...used].join(", ") };
};
const distinctPitches: Impl<"distinct-pitches"> = (r, n) => {
  const d = new Set(pitched(selectTrack(n, r.track)).map((e) => e.midi)).size;
  return { ok: d >= r.min, value: d, target: r.min, detail: `${d} different pitch(es); at least ${r.min}` };
};
const deviceCount: Impl<"device-count"> = (r, n, ctx) => {
  const found = new Set(detectDevices(n, { ...ctx, bars: windowBars(n, ctx) }).map((d) => d.device));
  const hit = r.devices.filter((d) => found.has(d));
  return {
    ok: hit.length >= r.min,
    value: hit.length,
    target: r.min,
    detail: `${hit.length} of ${r.devices.join(", ")}${hit.length ? ` (${hit.join(", ")})` : ""}; at least ${r.min}`,
  };
};
const matches: Impl<"matches"> = (r, n, ctx) => {
  const ref = ctx.resolveReference?.(r.reference);
  if (!ref) return { ok: false, detail: "the reference could not be evaluated" };
  const m = runMatcher(r.matcher, ref, n, ctx);
  return {
    ok: m.score >= r.min - 1e-9,
    value: m.score,
    target: r.min,
    detail: `${pct(m.score)} like the reference; at least ${pct(r.min)}`,
    extra: m.diagnostics.slice(0, 3),
  };
};

// --- custom rules (registered by name, each with a unit test) ------------------------------------

export type CustomRule = (n: Normalized, ctx: RubricContext, params: Record<string, unknown>) => RuleEval;
const numParam = (p: Record<string, unknown>, k: string, d: number): number =>
  typeof p[k] === "number" ? (p[k] as number) : d;
const strParam = (p: Record<string, unknown>, k: string, d: string): string =>
  typeof p[k] === "string" ? (p[k] as string) : d;

/** Walking bass (JC2): 4 onsets per bar, the chord root on beat 1 ≥ 75%, a step or 5th approach on beat 4 ≥ 50%. */
const walkingBass: CustomRule = (n, ctx, p) => {
  const bass = pitched(selectTrack(n, strParam(p, "track", "@bass")));
  const slots = pieceSlots(n, typeof p.harmony === "string" ? p.harmony : undefined);
  const total = windowBars(n, ctx);
  let four = 0;
  let rootOn1 = 0;
  let approach = 0;
  let approachN = 0;
  for (let b = 0; b < total; b++) {
    const inBar = bass.filter((e) => R.floor(e.onset) === b).sort((x, y) => R.cmp(x.onset, y.onset));
    if (inBar.length === 4) four++;
    const first = inBar[0];
    const chord = slotAt(slots, rat(b))?.chord;
    if (first && chord && R.eq(first.onset, rat(b)) && mod12(first.midi) === chord.rootPc) rootOn1++;
    const last = inBar[inBar.length - 1];
    const next = slotAt(slots, rat(b + 1))?.chord;
    if (last && next && b + 1 < total) {
      approachN++;
      const d = mod12(next.rootPc - last.midi);
      if (d === 1 || d === 2 || d === 10 || d === 11 || d === 5 || d === 7) approach++;
    }
  }
  const r4 = total ? four / total : 0;
  const r1 = total ? rootOn1 / total : 0;
  const ra = approachN ? approach / approachN : 0;
  const ok =
    r4 >= numParam(p, "min4", 1) &&
    r1 >= numParam(p, "minRoot", 0.75) &&
    ra >= numParam(p, "minApproach", 0.5);
  return {
    ok,
    value: Math.min(r4, r1 / 0.75, ra / 0.5),
    target: 1,
    detail: `4 notes in ${pct(r4)} of bars, root on beat 1 in ${pct(r1)}, approach on beat 4 in ${pct(ra)}`,
  };
};
const DOMINANTS = ["7", "9", "13", "7b9", "7#9", "7#11", "7b13", "7alt", "7sus4"];
const ALTERED = ["7b9", "7#9", "7b13", "7alt"];
/**
 * Tensions that fit their chord's function (JC4): altered dominants only where they resolve (down a 5th
 * or a half step), dominant colours on chords that resolve or on the blues tonic/subdominant, #11 on major
 * chords; everything else is a plain chord. Value = share of chords that fit.
 */
const allowedTensions: CustomRule = (n, ctx, p) => {
  const key = pieceKey(n, ctx);
  const slots = chordSlotsMerged(pieceSlots(n)).filter((s) => s.chord);
  if (!key || slots.length === 0) return { ok: false, detail: "no chords found" };
  let fit = 0;
  let firstBad: number | null = null;
  slots.forEach((s, i) => {
    const c = s.chord as ChordId;
    const next = slots[i + 1]?.chord;
    const resolves = !!next && (mod12(next.rootPc - c.rootPc) === 5 || mod12(next.rootPc - c.rootPc) === 11);
    let ok = true;
    if (ALTERED.includes(c.quality)) ok = resolves;
    else if (DOMINANTS.includes(c.quality))
      ok = resolves || [0, 5].includes(mod12(c.rootPc - pcOf(key.tonic)));
    if (ok) fit++;
    else firstBad ??= i;
  });
  const ratio = fit / slots.length;
  const min = numParam(p, "min", 0.85);
  return {
    ok: ratio >= min,
    value: ratio,
    target: min,
    detail: `${pct(ratio)} of the chords carry tensions that fit; at least ${pct(min)}`,
    ...(firstBad !== null ? { where: { slot: firstBad + 1 } } : {}),
  };
};
/** ii–V chains (JC1): a minor 7th (or half-diminished) chord followed by a dominant a 4th up; counts distinct target keys. */
const iiVChain: CustomRule = (n, _ctx, p) => {
  const slots = chordSlotsMerged(pieceSlots(n)).filter((s) => s.chord);
  const targets = new Set<number>();
  for (let i = 0; i + 1 < slots.length; i++) {
    const a = (slots[i] as ChordSlot).chord as ChordId;
    const b = (slots[i + 1] as ChordSlot).chord as ChordId;
    if (
      ["m7", "m7b5", "min", "m9", "m11"].includes(a.quality) &&
      DOMINANTS.includes(b.quality) &&
      mod12(b.rootPc - a.rootPc) === 5
    )
      targets.add(mod12(b.rootPc + 5));
  }
  const min = numParam(p, "minKeys", 3);
  return {
    ok: targets.size >= min,
    value: targets.size,
    target: min,
    detail: `ii–V pairs into ${targets.size} key(s); at least ${min}`,
  };
};
export const CUSTOM_RULES: Readonly<Record<string, CustomRule>> = {
  "walking-bass": walkingBass,
  "allowed-tensions": allowedTensions,
  "ii-v-chain": iiVChain,
};
const custom: Impl<"custom"> = (r, n, ctx) => {
  const fn = CUSTOM_RULES[r.fn];
  if (!fn)
    return {
      ok: false,
      detail: `no custom rule named ${r.fn}`,
      extra: [diag("rubric.unknown", { rule: r.fn })],
    };
  return fn(n, ctx, r.params ?? {});
};

/** The rule → analyzer map (exercises §3.10, contracts §5.6). */
export const RULES: { [K in RubricRule["rule"]]: Impl<K> } = {
  bars,
  "duration-sec": durationSecRule,
  "tempo-bpm": tempoBpm,
  tracks,
  "in-key": inKey,
  "ends-on-degree": endsOnDegree,
  cadence,
  "chord-tones-strong": chordTonesStrong,
  progression,
  "contains-rn": containsRn,
  range,
  "step-ratio": stepRatio,
  "harmonic-rhythm": harmonicRhythmRule,
  "groove-lock": grooveLockRule,
  swing: swingRule,
  syncopation: syncopationRule,
  form,
  "voice-leading": voiceLeadingRule,
  "guide-tones": guideTones,
  modulation,
  mode: modeRule,
  "blues-form": bluesFormRule,
  euclid,
  clave,
  polyrhythm,
  "register-separation": registerSep,
  "no-muddy-low": noMuddyLow,
  uses,
  custom,
  "motif-reuse": motifReuseRule,
  contrast,
  "key-change": keyChange,
  "velocity-ghosts": velocityGhostsRule,
  onsets: onsetsRule,
  "degree-set": degreeSet,
  sounds,
  "distinct-pitches": distinctPitches,
  "device-count": deviceCount,
  matches,
};

/** Evaluates one rule. Unknown rule names (content from a newer version) fail with `rubric.unknown`. */
export function evalRule(rule: RubricRule, n: Normalized, ctx: RubricContext): RuleEval {
  const impl = (RULES as Record<string, Impl<RubricRule["rule"]> | undefined>)[rule.rule];
  if (!impl)
    return {
      ok: false,
      detail: `unknown rule ${rule.rule}`,
      extra: [diag("rubric.unknown", { rule: rule.rule })],
    };
  return (impl as (r: RubricRule, n: Normalized, c: RubricContext) => RuleEval)(rule, n, ctx);
}

/** Partial credit of a rule outcome: 1 when met, else `credit` or `min(1, value / target)`, else 0. */
export function ruleCredit(e: RuleEval): number {
  if (e.ok) return 1;
  if (e.credit !== undefined) return Math.max(0, Math.min(1, e.credit));
  if (e.value !== undefined && e.target !== undefined && e.target > 0)
    return Math.max(0, Math.min(1, e.value / e.target));
  return 0;
}
