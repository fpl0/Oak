// Wave 6 (docs/design/wave6.md §3.2; contracts §6.6 C6, C7, CF-A, CF-T and the U12–U17 Makes). The rule fields
// content-kit 5 added, built on the analyzers the views use (`keysByBar`, `outsideChordKind`, `appliedReading`,
// `guideTones`, `pivotChords`, `velocityGhosts`), so a rule, a lens and a checklist can never disagree:
//   mode             `anyOf` and `tonic: "declared"` (C6: Mixolydian or Dorian, the learner's own tonic)
//   contains-rn      `kind` (any secondary dominant, any borrowed chord) and `inOrder` (♭VI–♭VII–I); every chord
//                    read in the key in force at its bar
//   form             `contains` with the `*` pattern (a bridge somewhere), `@song` with `extra` (CF-T.S4)
//   guide-tones      `at` and `maxMoveSemis` (U12.L05)
//   modulation       the key plan first, and `via` (a pivot chord, or none; U17.L01)
//   velocity-ghosts  `drum` and `accents` (U13.L02)
//   reharmonize      the same tune over new chords (U16.L05)
//   key-change       the chords must move with the tune (C7's lift)
// Every detail names the fault in the course's words; none shames.
import type {
  KeySpec,
  NEvent,
  OutsideChordKind,
  Rat,
  RubricRule,
  ScaleMode,
  SchemaFeature,
} from "@oak/content-kit";
import { MODE_CHARACTERISTIC, R, rat } from "@oak/content-kit";
import type { ChordId } from "@oak/theory";
import {
  appliedReading,
  guideTones as chordGuideTones,
  chromaticChordKind,
  displayRN,
  isMinorish,
  keyDisplay,
  keyFromScaleCtx,
  METERS,
  outsideChordKind,
  parseRN,
  pcOf,
  pivotChords,
  relativeKey,
  rnToChord,
  romanOf,
  spellMidi,
  toLeadSheet,
  transposeKey,
  triadCore,
} from "@oak/theory";
import type { ChordSlot } from "../analyze/chords.ts";
import { romanShown, slotAt } from "../analyze/chords.ts";
import { locAt, mod12, modeOf, pitched } from "../analyze/events.ts";
import { velocityGhosts } from "../analyze/groove.ts";
import { keyOf } from "../analyze/key.ts";
import { chordKeys, keyChangesByBar, keysByBar } from "../analyze/key-plan.ts";
import { isStrong, melodyLine, type Note } from "../analyze/melody.ts";
import { sectionsFromAst } from "../analyze/sections.ts";
import { straightenSwungLines } from "../analyze/swing.ts";
import { loopPassBars, selectTrack, tracksOfRole } from "../analyze/tracks.ts";
import { tupletsOf } from "../analyze/wave6-views.ts";
import { diag } from "../feedback/catalog.ts";
import type { MatchResult, Normalized } from "../types.ts";
import type { RubricContext } from "./context.ts";
import { linesOf, pieceBars, pieceSlots, type RuleEval, resolvesByRoot } from "./rules.ts";

type RuleOf<K extends RubricRule["rule"]> = Extract<RubricRule, { rule: K }>;

export interface UnbuiltRuleField {
  rule: RubricRule["rule"];
  /** The content-kit feature that names it (`SCHEMA_FEATURES`); `null` for a whole rule. */
  feature: SchemaFeature | null;
  /** What the learner-facing detail says is not checked yet. */
  what: string;
  uses(rule: RubricRule): boolean;
}
/**
 * Rule fields with no analyzer behind them. Empty since the Wave 6 Build: every field of content-kit 5 is graded
 * below. A field added to the schema before its analyzer goes here, so it fails with `rubric.unknown` and never
 * passes silently.
 */
export const WAVE6_UNBUILT: readonly UnbuiltRuleField[] = [];
/** The first field of `rule` that has no analyzer yet, or `null` when the rule can be evaluated. */
export function unbuiltWave6(rule: RubricRule): UnbuiltRuleField | null {
  return WAVE6_UNBUILT.find((f) => f.uses(rule)) ?? null;
}
/** The honest outcome of a rule that cannot be evaluated yet. */
export function notBuiltYet(rule: RubricRule, field: Pick<UnbuiltRuleField, "what">): RuleEval {
  return {
    ok: false,
    detail: `not built yet: ${field.what}`,
    extra: [diag("rubric.unknown", { rule: rule.rule })],
  };
}
/** Matcher fields with no implementation: none since `harmony.wrongQuality` was built (match/harmony.ts, d11). */
export function unbuiltWave6Matcher(_m: unknown): MatchResult | null {
  return null;
}

// --- shared readings ------------------------------------------------------------------------------------------

const pct = (x: number): string => `${Math.round(x * 100)}%`;
const times = (n: number): string => (n === 1 ? "once" : n === 2 ? "twice" : `${n} times`);
const flat = (s: string): string => s.replace(/^b/, "♭").replace(/^#/, "♯");
const noteWord = (name: string): string =>
  `${name.charAt(0).toUpperCase()}${name
    .slice(1)
    .replace(/-?\d+$/, "")
    .replace(/#/g, "♯")
    .replace(/b/g, "♭")}`;
const pcWord = (pc: number, key: KeySpec | null, chord?: ChordId): string =>
  noteWord(spellMidi(60 + mod12(pc), { key, ...(chord ? { chord } : {}) }).name);
const rootPos = (c: ChordId): ChordId => ({ ...c, bassPc: c.rootPc });
const coreEq = (a: ChordId | null | undefined, b: ChordId | null | undefined): boolean =>
  !!a && !!b && triadCore(a).rootPc === triadCore(b).rootPc && triadCore(a).quality === triadCore(b).quality;
const barOf = (at: Rat, ctx: RubricContext): number => R.floor(at) + (ctx.pickup ? 0 : 1);

/** The key at every bar of the piece a rule reads (the scoped section when the rule has one). */
export function ruleKeys(n: Normalized, ctx: RubricContext): KeySpec[] {
  if (ctx.keyByBar) return ctx.keyByBar;
  const reach = n.all.reduce((m, e) => Math.max(m, R.floor(e.onset) + 1), 0);
  const bars = Math.max(1, pieceBars(n, ctx), reach);
  return keysByBar(n, bars, {
    key: ctx.key ?? null,
    code: ctx.code,
    ...(ctx.keyPlan ? { keyPlan: ctx.keyPlan } : {}),
    pickup: !!ctx.pickup,
  });
}

/** One chord as a rule reads it: in root position, in the key in force where it sounds. */
export interface ChordRead {
  slot: ChordSlot;
  chord: ChordId;
  /** 1-based bar for messages (0 = the pickup bar). */
  bar: number;
  key: KeySpec;
  next: ChordId | undefined;
}
/**
 * The chords of the piece in order, a held or re-struck chord once, each with its key. A dominant that leads into
 * a new key belongs to that key: the A7 before a chorus lifted to D is D's own V7, not a secondary dominant of C
 * (so a lift is never also "a secondary dominant that resolves").
 */
export function readChords(n: Normalized, ctx: RubricContext, track?: string): ChordRead[] {
  const merged: ChordSlot[] = [];
  for (const s of pieceSlots(n, track)) {
    if (!s.chord) continue;
    const last = merged[merged.length - 1];
    if (last && coreEq(last.chord, s.chord) && last.chord?.quality === s.chord.quality) continue;
    merged.push(s);
  }
  const keys = slotKeys(n, ctx, merged);
  if (!keys) return [];
  return merged.map((slot, i) => {
    const nextSlot = merged[i + 1];
    return {
      slot,
      chord: rootPos(slot.chord as ChordId),
      bar: barOf(slot.span[0], ctx),
      key: keys[i] as KeySpec,
      next: nextSlot?.chord ? rootPos(nextSlot.chord) : undefined,
    };
  });
}
/**
 * The key each slot is read in (aligned with `slots`); `null` when the piece has no key to read. A dominant that
 * leads into a new key is read in that key.
 */
export function slotKeys(n: Normalized, ctx: RubricContext, slots: readonly ChordSlot[]): KeySpec[] | null {
  const base = keyOf(n.all, ctx.key ?? null);
  if (!base) return null;
  return chordKeys(slots, ruleKeys(n, ctx), base);
}
/** "V7/V (D7)": the numeral in root position and the symbol. */
const chordText = (c: ChordId, key: KeySpec, next?: ChordId): string =>
  `${romanShown(romanOf(c, key, next))} (${toLeadSheet(c)})`;
/** The same on the triad core, with no applied reading: "ii (Dm)". */
const plainText = (c: ChordId, key: KeySpec): string => {
  const core: ChordId = { ...c, quality: triadCore(c).quality, ext: [] };
  return `${romanShown(romanOf(core, key))} (${toLeadSheet(c)})`;
};
const barWord = (bar: number): string => (bar === 0 ? "the pickup bar" : `bar ${bar}`);

// --- mode (C6, U14.L06) ---------------------------------------------------------------------------------------

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
/** The scale the piece's own code names most (`.scale("G4:mixolydian")`), `null` when no line has a scale. */
function statedScale(n: Normalized): KeySpec | null {
  const ctxs = pitched(n.all)
    .map((e) => e.scaleCtx)
    .filter((s): s is string => typeof s === "string");
  if (ctxs.length === 0) return null;
  const strip = (s: string): string => s.replace(/-?\d+(?=\s)/, "");
  const first = strip(ctxs[0] as string);
  // The first scale of the piece when it is as common as any other; else the most common one.
  const top = modeOf(ctxs.map(strip));
  const pick =
    ctxs.filter((s) => strip(s) === first).length >= ctxs.filter((s) => strip(s) === top).length
      ? first
      : top;
  return pick ? keyFromScaleCtx(pick) : null;
}
interface ModeTry {
  mode: ScaleMode;
  problems: string[];
  where?: RuleEval["where"];
  summary: string;
}
function tryMode(
  mode: ScaleMode,
  tonic: string,
  requireCharacteristic: boolean,
  n: Normalized,
  ctx: RubricContext,
): ModeTry {
  const tonicPc = pcOf(tonic);
  const key: KeySpec = { tonic, mode };
  const name = keyDisplay(key);
  const notes = pitched(n.all);
  const colour = (MODE_CHARACTERISTIC as Record<string, { tone: string; replaces: string } | undefined>)[
    mode
  ];
  const avoided = notes.filter((e) => (AVOID[mode] ?? []).includes(mod12(e.midi - tonicPc)));
  const ch = CHARACTERISTIC[mode];
  const strongChar =
    ch === undefined
      ? 0
      : notes.filter((e) => mod12(e.midi - tonicPc) === ch && isStrong(e.onset, ctx.meter, "strong")).length;
  const toneName = ch === undefined ? "" : pcWord(tonicPc + ch, key);
  const toneText = colour ? `${flat(colour.tone)} (${toneName})` : toneName;
  const problems: string[] = [];
  let where: RuleEval["where"];
  const first = avoided[0];
  if (first) {
    const got = pcWord(first.midi, { tonic, mode: isMinorish(mode) ? "minor" : "major" });
    const at = locAt(first.onset, ctx, { track: first.track, noteIds: avoided.map((e) => e.id) });
    where = at;
    problems.push(
      colour
        ? `${got} in ${barWord(at.bar ?? 0)} is degree ${flat(colour.replaces)}; ${name} has ${toneText} in its place`
        : `${avoided.length} note(s) outside ${name}`,
    );
  }
  if (requireCharacteristic && strongChar < 2)
    problems.push(
      colour
        ? `its colour note ${toneText} is on a strong beat ${strongChar === 0 ? "0 times" : times(strongChar)}; put it on beat 1 or 3 at least twice`
        : `its colour tone is on a strong beat ${strongChar}× (at least 2)`,
    );
  const home = homeShare(n, ctx, tonicPc);
  if (home !== null && home.share < 0.4)
    problems.push(
      `the ${noteWord(tonic)} ${home.what} is in ${pct(home.share)} of the bars; the home chord needs at least 40%`,
    );
  const summary = `${name}${colour && strongChar > 0 ? `: ${toneText} on a strong beat ${times(strongChar)}` : ""}${home ? `, home in ${pct(home.share)} of the bars` : ""}`;
  return { mode, problems, ...(where ? { where } : {}), summary };
}
/**
 * The share of bars that start on the home chord: read from the chord tracks; with no chord track, from the bass
 * (a riff over a pedal has its home in the bass); `null` when the piece has neither, so the test is not made.
 */
function homeShare(
  n: Normalized,
  ctx: RubricContext,
  tonicPc: number,
): { share: number; what: string } | null {
  const reach = n.all.reduce((m, e) => Math.max(m, R.floor(e.onset) + 1), 0);
  // An arranged piece is as long as its `arrange()` total, not the window the grader queried (an eight-bar vamp
  // graded over sixteen bars is home in 4 of its 8 bars, not 4 of 16).
  const window = Math.max(ctx.bars ?? 0, reach, 1);
  const bars = ctx.totalBars ? Math.max(1, Math.min(ctx.totalBars, window)) : window;
  const chordEvents =
    n.all.filter((e) => e.chordSymbol !== undefined).length > 0 || tracksOfRole(n, "chords").length > 0;
  if (chordEvents) {
    const slots = pieceSlots(n);
    const perBar = Array.from({ length: bars }, (_, b) => slotAt(slots, rat(b))?.chord ?? null);
    if (perBar.some((c) => c)) {
      return { share: perBar.filter((c) => c && c.rootPc === tonicPc).length / bars, what: "chord" };
    }
  }
  const bass = pitched(tracksOfRole(n, "bass").flatMap((t) => n.byTrack[t] ?? []));
  if (bass.length === 0) return null;
  let homeBars = 0;
  for (let b = 0; b < bars; b++) {
    const inBar = bass.filter((e) => R.floor(e.onset) === b).sort((x, y) => R.cmp(x.onset, y.onset));
    const held = bass.find((e) => R.lt(e.onset, rat(b)) && R.lt(rat(b), R.add(e.onset, e.dur)));
    const lead = inBar[0] ?? held;
    if (lead && mod12(lead.midi) === tonicPc) homeBars++;
  }
  return { share: homeBars / bars, what: "bass note" };
}
/** Whether the piece's own 3rd above `tonicPc` is major or minor (`null`: neither, or as many of each). */
function thirdFamily(n: Normalized, tonicPc: number): "major" | "minor" | null {
  const notes = pitched(n.all);
  const maj = notes.filter((e) => mod12(e.midi - tonicPc) === 4).length;
  const min = notes.filter((e) => mod12(e.midi - tonicPc) === 3).length;
  return maj > min ? "major" : min > maj ? "minor" : null;
}
export function modeRule(r: RuleOf<"mode">, n: Normalized, ctx: RubricContext): RuleEval {
  if (pitched(n.all).length === 0) return { ok: false, detail: "no pitched notes" };
  const stated = statedScale(n);
  const declared = r.tonic === "declared";
  // With no scale in the code the piece is read on its first chord (a vamp starts at home), else on the brief's key.
  const firstChord = declared && !stated ? (pieceSlots(n).find((x) => x.chord)?.chord ?? null) : null;
  const tonic = declared
    ? (stated?.tonic ??
      (firstChord ? pcWord(firstChord.rootPc, null).replace("♯", "#").replace("♭", "b") : null) ??
      ctx.key?.tonic ??
      keyOf(n.all, null)?.tonic ??
      "C")
    : r.tonic;
  const modes: ScaleMode[] = r.anyOf && r.anyOf.length > 0 ? r.anyOf : [r.mode];
  // A choice of modes is settled by the piece's own 3rd: a vamp with a major 3rd is not Dorian, whatever its 6th.
  const family = modes.length > 1 ? thirdFamily(n, pcOf(tonic)) : null;
  const eligible = modes.filter(
    (m) => m === stated?.mode || family === null || (isMinorish(m) ? "minor" : "major") === family,
  );
  const pool = eligible.length > 0 ? eligible : modes;
  // The mode the code names leads (its faults are the ones the learner should read), then the brief's order.
  const order = [...pool].sort(
    (a, b) => Number(b === stated?.mode) - Number(a === stated?.mode) || modes.indexOf(a) - modes.indexOf(b),
  );
  const tries = order.map((m) => tryMode(m, tonic, r.requireCharacteristic, n, ctx));
  const pass = tries.find((t) => t.problems.length === 0);
  if (pass) return { ok: true, detail: pass.summary };
  const shown = tries[0] as ModeTry;
  const names = modes.map((m) => keyDisplay({ tonic, mode: m }).replace(/^\S+\s/, ""));
  const asked =
    names.length > 1 ? `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}` : names[0];
  const lead: string[] = [];
  if (declared && !stated)
    lead.push(
      `no line names a scale, so this is read on ${noteWord(tonic)}${firstChord ? ", your first chord" : ""}: write \`.scale("${tonic}4:${shown.mode}")\``,
    );
  else if (stated && modes.length > 1 && !modes.includes(stated.mode))
    lead.push(`the scale in the code is ${keyDisplay(stated)}; the brief asks for ${asked}`);
  return {
    ok: false,
    detail: [...lead, ...shown.problems].join("; "),
    ...(shown.where ? { where: shown.where } : {}),
  };
}

// --- contains-rn: kind, inOrder, the key in force (C7, CF-A, U15, U16) --------------------------------------------

const KIND_WORDS: Record<OutsideChordKind, [string, string]> = {
  "secondary-dominant": ["a secondary dominant", "secondary dominant"],
  "applied-leading-tone": ["a leading-tone chord of another chord", "applied leading-tone chord"],
  borrowed: ["a borrowed chord", "borrowed chord"],
};
const rnShown = (rn: string, key: KeySpec): string => {
  const p = parseRN(rn, key);
  return p ? displayRN(p) : flat(rn);
};
const heardText = (chords: readonly ChordRead[]): string => {
  const heard = [...new Set(chords.map((c) => plainText(c.chord, c.key)))];
  return heard.length === 0
    ? "no chords here"
    : `the chords here: ${heard.slice(0, 4).join(", ")}${heard.length > 4 ? ", …" : ""}`;
};
/** Whether a dominant (plain or applied) goes where it points: V → I, V/x → x; by root, so a chain counts. */
function resolves(c: ChordRead): { applied: boolean; ok: boolean; target: ChordId | null } {
  const a = appliedReading(c.chord, c.key, c.next);
  if (a) return { applied: true, ok: a.resolves, target: a.target.chord };
  const ok = !!c.next && resolvesByRoot(c.chord, c.next);
  return { applied: false, ok, target: null };
}
function unresolvedText(c: ChordRead): string {
  const res = resolves(c);
  const self = chordText(c.chord, c.key, c.next);
  const goal = res.target
    ? plainText(res.target, c.key)
    : ["dim", "dim7"].includes(c.chord.quality)
      ? `the chord a half step above it (${pcWord(c.chord.rootPc + 1, c.key)})`
      : `the chord a 4th above it (${pcWord(c.chord.rootPc + 5, c.key)})`;
  return c.next
    ? `${self} in ${barWord(c.bar)} doesn't resolve: it goes to ${plainText(c.next, c.key)}, not to ${goal}`
    : `${self} in ${barWord(c.bar)} doesn't resolve: it is the last chord; follow it with ${goal}`;
}

/** `contains-rn` with `kind` and/or `inOrder` (the plain numeral list stays in rules.ts). */
export function containsRnWave6(r: RuleOf<"contains-rn">, n: Normalized, ctx: RubricContext): RuleEval {
  const chords = readChords(n, ctx);
  if (chords.length === 0) return { ok: false, value: 0, target: r.min, detail: "no chords found" };
  const reach = n.all.reduce((m, e) => Math.max(m, R.floor(e.onset) + 1), 0);
  const passBars = loopPassBars(n.all, Math.max(ctx.bars ?? 0, reach));
  return r.inOrder ? containsRun(r, chords, ctx) : containsKind(r, chords, ctx, passBars);
}
function containsKind(
  r: RuleOf<"contains-rn">,
  chords: readonly ChordRead[],
  ctx: RubricContext,
  passBars: number,
): RuleEval {
  const kinds = r.kind ?? [];
  const hits: ChordRead[] = [];
  let unresolved: ChordRead | null = null;
  // "At least two" counts on one pass of the loop (a single door heard twice is one door; U15.L03–L06).
  const pass = r.min > 1 ? passBars : Number.POSITIVE_INFINITY;
  for (const c of chords) {
    if (R.floor(c.slot.span[0]) >= pass) continue;
    const kind = outsideChordKind(c.chord, c.key, c.next);
    const byKind = kind !== null && kinds.includes(kind);
    const byName = r.rn.some((x) => {
      const p = parseRN(x, c.key);
      if (!p || !coreEq(c.chord, rnToChord(p, c.key))) return false;
      return !p.of || !!romanOf(c.chord, c.key, c.next).of;
    });
    if (!byKind && !byName) continue;
    const dominantLike =
      kind === "secondary-dominant" || kind === "applied-leading-tone" || (byName && !byKind);
    if (r.mustResolve && dominantLike && !resolves(c).ok) {
      unresolved ??= c;
      continue;
    }
    hits.push(c);
  }
  const what = [
    ...kinds.map((k) => KIND_WORDS[k][1]),
    ...(r.rn.length ? [r.rn.map((x) => rnShown(x, (chords[0] as ChordRead).key)).join("/")] : []),
  ].join(" or ");
  const ok = hits.length >= r.min;
  const found = hits
    .slice(0, 3)
    .map((c) => {
      const res = appliedReading(c.chord, c.key, c.next);
      const to = res && c.next ? ` → ${chordText(c.next, c.key)}` : "";
      return `${chordText(c.chord, c.key, c.next)}${to} in ${barWord(c.bar)}`;
    })
    .join("; ");
  const need = r.min === 1 ? "" : ` (${hits.length} of ${r.min})`;
  const detail = ok
    ? found
    : unresolved
      ? `${unresolvedText(unresolved)}${need}`
      : hits.length > 0
        ? `${found}; the brief asks for ${r.min}`
        : `no ${what}${r.mustResolve ? " that resolves" : ""} yet (${heardText(chords)})`;
  const at = !ok && unresolved ? unresolved : null;
  return {
    ok,
    value: hits.length,
    target: r.min,
    detail,
    ...(at ? { where: locAt(at.slot.span[0], ctx, { slot: chords.indexOf(at) + 1 }) } : {}),
  };
}
function containsRun(r: RuleOf<"contains-rn">, chords: readonly ChordRead[], ctx: RubricContext): RuleEval {
  const len = r.rn.length;
  if (len === 0)
    return {
      ok: false,
      detail: "the rule names no chords",
      extra: [diag("rubric.unknown", { rule: "contains-rn" })],
    };
  // Each run is read in the key of its first chord: ♭VI–♭VII–I is one gesture in one key.
  const wantAt = (i: number): (ChordId | null)[] => {
    const key = (chords[i] as ChordRead).key;
    return r.rn.map((x) => {
      const p = parseRN(x, key);
      return p ? rnToChord(p, key) : null;
    });
  };
  let count = 0;
  let best = { len: 0, at: -1 };
  let unresolved: ChordRead | null = null;
  for (let i = 0; i < chords.length; i++) {
    const want = wantAt(i);
    let k = 0;
    while (k < len && i + k < chords.length && coreEq((chords[i + k] as ChordRead).chord, want[k])) k++;
    if (k > best.len) best = { len: k, at: i };
    if (k < len) continue;
    const last = chords[i + len - 1] as ChordRead;
    if (r.mustResolve && !resolves(last).ok) {
      unresolved ??= last;
      continue;
    }
    count++;
    i += len - 1;
  }
  const key0 = (chords[Math.max(0, best.at)] as ChordRead).key;
  const run = r.rn.map((x) => rnShown(x, key0)).join(" → ");
  const ok = count >= r.min;
  if (ok) {
    const first = chords[best.at] as ChordRead;
    return {
      ok,
      value: count,
      target: r.min,
      detail: `${run} from ${barWord(first.bar)}${count > 1 ? ` (${times(count)})` : ""}`,
    };
  }
  let detail: string;
  let whereAt: ChordRead | null = null;
  if (unresolved) {
    detail = unresolvedText(unresolved);
    whereAt = unresolved;
  } else if (count > 0) detail = `${run} ${times(count)}; the brief asks for ${r.min}`;
  else if (best.len === 0) {
    const want = wantAt(0)[0];
    detail = `no ${run} in a row yet: there is no ${rnShown(r.rn[0] as string, key0)}${want ? ` (${toLeadSheet(rootPos(want))})` : ""} (${heardText(chords)})`;
  } else {
    const start = chords[best.at] as ChordRead;
    const got = chords[best.at + best.len];
    const want = wantAt(best.at)[best.len];
    const had = r.rn
      .slice(0, best.len)
      .map((x) => rnShown(x, start.key))
      .join(" → ");
    const wantText = `${rnShown(r.rn[best.len] as string, start.key)}${want ? ` (${toLeadSheet(rootPos(want))})` : ""}`;
    detail = got
      ? `${had} is there from ${barWord(start.bar)}, but then comes ${plainText(got.chord, start.key)}, not ${wantText}`
      : `${had} is there from ${barWord(start.bar)}, but nothing follows it: go on to ${wantText}`;
    whereAt = got ?? start;
  }
  return {
    ok,
    value: count,
    target: r.min,
    detail,
    ...(whereAt ? { where: locAt(whereAt.slot.span[0], ctx, { slot: chords.indexOf(whereAt) + 1 }) } : {}),
  };
}

// --- form: contains, *, @song (CF-A, CF-T.S4) ---------------------------------------------------------------------

const lettersOf = (names: readonly string[]): string => {
  const seen: string[] = [];
  return names
    .map((x) => {
      if (!seen.includes(x)) seen.push(x);
      return String.fromCharCode(65 + seen.indexOf(x));
    })
    .join("");
};
/** `form` with `contains`, the `*` pattern, the `@song` pattern or `extra`. `plain` is the fixed-pattern check. */
export function formWave6(
  r: RuleOf<"form">,
  ctx: RubricContext,
  plain: (pattern: string, sections: readonly { label: string; tag: string }[]) => boolean,
): RuleEval {
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
  const got = s.sections.map((x) => x.tag).join(" ");
  const extra = new Set((r.extra ?? []).map((x) => x.toLowerCase()));
  const kept = s.sections.filter((x) => !extra.has(x.label) && !extra.has(x.tag));
  const problems: string[] = [];
  let expected = r.pattern;
  if (r.pattern === "@song") {
    const song = ctx.songForm;
    if (!song || song.length === 0)
      return {
        ok: false,
        detail: "the song's form is not known here",
        extra: [diag("rubric.unknown", { rule: "form @song" })],
      };
    const want = lettersOf(song.map((x) => x.label));
    const have = lettersOf(kept.map((x) => x.label));
    expected = `the song's form, ${want.split("").join(" ")}${extra.size ? ` (with ${[...extra].join(", ")} around it if you like)` : ""}`;
    if (want !== have)
      problems.push(
        kept.length < song.length
          ? `your arrangement has ${kept.length} of the song's ${song.length} sections (${have.split("").join(" ") || "none"}); the song goes ${want.split("").join(" ")}`
          : `your sections go ${have.split("").join(" ")}; the song goes ${want.split("").join(" ")}`,
      );
    else {
      const short = kept.findIndex((x, i) => x.bars !== (song[i] as { bars: number }).bars);
      if (short >= 0) {
        const mine = kept[short] as { tag: string; bars: number };
        problems.push(
          `your ${mine.tag} is ${mine.bars} bars; that section of the song is ${(song[short] as { bars: number }).bars}`,
        );
      }
    }
  } else if (r.pattern !== "*" && !plain(r.pattern, kept))
    problems.push(`the form is ${got}; the brief asks for ${r.pattern}`);
  const missing = (r.contains ?? []).filter(
    (w) => !s.sections.some((x) => x.label === w.toLowerCase() || x.tag === w.toLowerCase()),
  );
  if (missing.length > 0) {
    const list = missing.map((m) => `a ${m}`).join(" or ");
    problems.push(
      `the form is ${got}: there is no ${missing.join(", no ")} yet (name its section consts \`${"chords"}${cap(missing[0] as string)}\`, \`mel${cap(missing[0] as string)}\`)`,
    );
    if (r.pattern === "*") expected = `${list} somewhere in the form`;
  }
  const ok = problems.length === 0;
  return {
    ok,
    detail: ok ? got : problems.join("; "),
    ...(ok ? {} : { extra: [diag("form.wrong", { got: got || "nothing", expected })] }),
  };
}
const cap = (s: string): string => `${s.charAt(0).toUpperCase()}${s.slice(1)}`;

// --- guide-tones: at, maxMoveSemis (U12.L05) ------------------------------------------------------------------

/** The notes of the line a guide-tone rule judges, each with the chord it is judged against. */
function judgedNotes(
  at: "change" | "strong" | "all",
  line: readonly Note[],
  slots: readonly ChordSlot[],
  ctx: RubricContext,
): { note: Note | null; chord: ChordId; at: Rat }[] {
  const chordAt = (t: Rat): ChordId | null => slotAt(slots, t)?.chord ?? null;
  if (at === "change") {
    const out: { note: Note | null; chord: ChordId; at: Rat }[] = [];
    let prev: ChordId | null = null;
    for (const s of slots) {
      if (!s.chord) continue;
      // A chord struck again is no change.
      if (prev && coreEq(prev, s.chord) && prev.quality === s.chord.quality) continue;
      prev = s.chord;
      const note =
        [...line]
          .reverse()
          .find((x) => R.lte(x.onset, s.span[0]) && R.lt(s.span[0], R.add(x.onset, x.dur))) ?? null;
      out.push({ note, chord: s.chord, at: s.span[0] });
    }
    return out;
  }
  return line
    .filter((x) => at === "all" || isStrong(x.onset, ctx.meter, "strong"))
    .flatMap((note) => {
      const chord = chordAt(note.onset);
      return chord ? [{ note, chord, at: note.onset }] : [];
    });
}
const isGuide = (midi: number, chord: ChordId): boolean => {
  const g = chordGuideTones(rootPos(chord));
  const pc = mod12(midi);
  return (g.third !== null && g.third.pc === pc) || (g.seventh !== null && g.seventh.pc === pc);
};
const guideWords = (chord: ChordId): string => {
  const g = chordGuideTones(rootPos(chord));
  const parts = [
    g.third ? `${noteWord(g.third.name)} (the 3rd)` : null,
    g.seventh ? `${noteWord(g.seventh.name)} (the 7th)` : null,
  ].filter((x): x is string => x !== null);
  return parts.join(" and ");
};
const memberWord = (midi: number, chord: ChordId): string => {
  const rel = mod12(midi - chord.rootPc);
  return rel === 0
    ? "the root"
    : rel === 7 || rel === 6 || rel === 8
      ? "the 5th"
      : rel === 2 || rel === 1
        ? "the 9th"
        : rel === 5
          ? "the 4th"
          : rel === 9
            ? "the 6th"
            : "not in the chord";
};
/** `guide-tones` with `at` or `maxMoveSemis`. */
export function guideTonesWave6(r: RuleOf<"guide-tones">, n: Normalized, ctx: RubricContext): RuleEval {
  const line = melodyLine(selectTrack(n, r.track));
  const slots = pieceSlots(n, r.harmony, { exclude: r.track });
  const judged = judgedNotes(r.at ?? "change", line, slots, ctx);
  if (judged.length === 0)
    return {
      ok: false,
      value: 0,
      target: r.minRatio,
      detail: line.length === 0 ? "no line to judge yet" : "no chord changes under the line",
    };
  const key = keyOf(n.all, ctx.key ?? null);
  const hit = judged.filter((j) => j.note && isGuide(j.note.midi, j.chord));
  const ratio = hit.length / judged.length;
  const miss = judged.find((j) => !j.note || !isGuide(j.note.midi, j.chord));
  let leap: { from: Note; to: Note; chord: ChordId; semis: number } | null = null;
  if (r.maxMoveSemis !== undefined) {
    // Moves inside one pass of the loop: the jump from its last chord back to its first is the loop starting
    // again, not a step of the line (an eight-bar cycle graded over sixteen bars; U12.L05).
    const reach = n.all.reduce((m, e) => Math.max(m, R.floor(e.onset) + 1), 0);
    const pass = loopPassBars(n.all, Math.max(ctx.bars ?? 0, reach));
    const sounded = judged.filter(
      (j): j is { note: Note; chord: ChordId; at: Rat } => j.note !== null && R.floor(j.at) < pass,
    );
    for (let i = 1; i < sounded.length && !leap; i++) {
      const a = (sounded[i - 1] as { note: Note }).note;
      const b = sounded[i] as { note: Note; chord: ChordId };
      const semis = Math.abs(b.note.midi - a.midi);
      if (semis > r.maxMoveSemis) leap = { from: a, to: b.note, chord: b.chord, semis };
    }
  }
  const ok = ratio >= r.minRatio - 1e-9 && !leap;
  const whereOf = (t: Rat) => locAt(t, ctx, { track: r.track.replace(/^@/, "") });
  const unit =
    (r.at ?? "change") === "change" ? "chord changes" : r.at === "strong" ? "strong-beat notes" : "notes";
  let detail = `${hit.length} of ${judged.length} ${unit} meet a 3rd or a 7th (${pct(ratio)})`;
  let where: RuleEval["where"];
  if (ratio < r.minRatio - 1e-9 && miss) {
    const w = whereOf(miss.at);
    where = w;
    const sym = toLeadSheet(rootPos(miss.chord));
    detail += `; at least ${pct(r.minRatio)}. ${cap(barWord(w.bar ?? 0))}: over ${sym} the line ${
      miss.note
        ? `has ${pcWord(miss.note.midi, key, miss.chord)} (${memberWord(miss.note.midi, miss.chord)})`
        : "rests"
    }; ${sym}'s guide tones are ${guideWords(miss.chord)}`;
  } else if (leap) {
    const w = whereOf(leap.to.onset);
    where = w;
    const g = chordGuideTones(rootPos(leap.chord));
    const near = [g.third, g.seventh]
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .map((x) => ({ x, d: Math.min(mod12(x.pc - leap.from.midi), mod12(leap.from.midi - x.pc)) }))
      .sort((a, b) => a.d - b.d)[0];
    detail += `; into ${barWord(w.bar ?? 0)} the line moves ${leap.semis} half steps (${pcWord(leap.from.midi, key)} to ${pcWord(leap.to.midi, key, leap.chord)}); a guide-tone line moves ${r.maxMoveSemis} at most${
      near
        ? `: the nearest guide tone of ${toLeadSheet(rootPos(leap.chord))} is ${noteWord(near.x.name)}`
        : ""
    }`;
  }
  return { ok, value: ratio, target: r.minRatio, detail, ...(where ? { where } : {}) };
}

// --- modulation: the key plan first, via (U17.L01, U17.L03) ---------------------------------------------------

const sameTonality = (a: KeySpec, b: KeySpec): boolean =>
  pcOf(a.tonic) === pcOf(b.tonic) && isMinorish(a.mode) === isMinorish(b.mode);
const isDominantOf = (c: ChordId, key: KeySpec): boolean =>
  mod12(c.rootPc - pcOf(key.tonic)) === 7 && triadCore(c).quality === "maj";
const inKeyChord = (c: ChordId, key: KeySpec): boolean => chromaticChordKind(rootPos(c), key) === "diatonic";

export function modulationRule(r: RuleOf<"modulation">, n: Normalized, ctx: RubricContext): RuleEval {
  const total = Math.max(1, pieceBars(n, ctx));
  const keys = ruleKeys(n, ctx);
  const start =
    keys[0] ??
    keyOf(
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
  const shift = ctx.pickup ? 0 : 1;
  const changes = keyChangesByBar(keys.slice(0, total));
  let changeBar: number | null = null;
  let landed: KeySpec | null = null;
  if (changes.length > 0) {
    // The piece ends in the key its plan ends in; the change is where that last key begins.
    const last = changes[changes.length - 1] as { bar: number; to: KeySpec };
    landed = last.to;
    if (sameTonality(last.to, target)) changeBar = last.bar;
  } else {
    // No key plan in the code: each 4-bar window's key by ear (the Wave 1 reading).
    for (let b = 4; b < total; b += 4) {
      const k = keyOf(
        n.all.filter((e) => R.floor(e.onset) >= b && R.floor(e.onset) < b + 4),
        null,
      );
      if (k && !sameTonality(k, start)) landed = k;
      if (k && sameTonality(k, target)) {
        changeBar = b;
        break;
      }
    }
  }
  const tName = keyDisplay(target);
  if (changeBar === null) {
    const wrong =
      landed && !sameTonality(landed, target) ? `it moves to ${keyDisplay(landed)}, not to ${tName}` : null;
    return {
      ok: false,
      detail:
        wrong ??
        `the piece stays in ${keyDisplay(start)}; the brief asks for a move to ${tName}${r.atBar ? ` from bar ${r.atBar}` : ""}`,
    };
  }
  const shownBar = changeBar + shift;
  if (r.atBar !== undefined && Math.abs(shownBar - r.atBar) > (changes.length > 0 ? 0 : 3)) {
    return {
      ok: false,
      detail: `the key changes in bar ${shownBar}, not bar ${r.atBar}`,
      where: { bar: shownBar },
    };
  }
  const base = `moves to ${tName} at bar ${shownBar}`;
  if (!r.via) return { ok: true, detail: base };
  // The pivot: the last chord before the new key's first dominant, when both keys own it (U17.L01).
  const slots = pieceSlots(n).filter((s) => s.chord);
  const merged: ChordSlot[] = [];
  for (const s of slots) if (!coreEq(merged[merged.length - 1]?.chord, s.chord)) merged.push(s);
  const domAt = merged.findIndex(
    (s, i) =>
      R.floor(s.span[0]) >= changeBar - 2 &&
      R.floor(s.span[0]) <= changeBar &&
      isDominantOf(s.chord as ChordId, target) &&
      (!inKeyChord({ ...(s.chord as ChordId), ext: [] }, start) || /7/.test((s.chord as ChordId).quality)) &&
      (() => {
        const next = merged[i + 1]?.chord;
        return !next || next.rootPc === pcOf(target.tonic);
      })(),
  );
  const dominant = domAt >= 0 ? (merged[domAt] as ChordSlot) : null;
  const before = dominant && domAt > 0 ? (merged[domAt - 1] as ChordSlot) : null;
  const shared = pivotChords(
    { tonic: start.tonic, mode: isMinorish(start.mode) ? "minor" : "major" },
    {
      tonic: target.tonic,
      mode: isMinorish(target.mode) ? "minor" : "major",
    },
  );
  const isShared = (c: ChordId): boolean => shared.some((p) => coreEq(p.chord, c));
  const pivot = before?.chord && isShared(before.chord) ? before : null;
  const sharedNames = shared.map((p) => p.symbol).join(", ");
  const domName = dominant?.chord ? toLeadSheet(rootPos(dominant.chord)) : "";
  const vName = `${pcWord(pcOf(target.tonic) + 7, target)} or ${pcWord(pcOf(target.tonic) + 7, target)}7`;
  if (r.via === "pivot") {
    if (pivot?.chord && dominant) {
      const p = shared.find((x) => coreEq(x.chord, pivot.chord)) as {
        symbol: string;
        from: string;
        to: string;
      };
      return {
        ok: true,
        detail: `${base}: ${p.symbol} is ${flat(p.from)} in ${keyDisplay(start)} and ${flat(p.to)} in ${tName}, then ${domName}`,
      };
    }
    const why = !dominant
      ? `the new key arrives with no V of ${tName} (${vName}) before it; go through a chord both keys own (${sharedNames}), then ${vName}`
      : !before
        ? `${domName} is the first chord: put a chord both keys own before it (${sharedNames})`
        : `${toLeadSheet(rootPos(before.chord as ChordId))} before ${domName} belongs to one key only; a pivot chord is in both (${sharedNames})`;
    return {
      ok: false,
      detail: `${base}, but not through a pivot chord: ${why}`,
      where: { bar: (dominant ? R.floor(dominant.span[0]) : changeBar) + shift },
    };
  }
  // via "direct": the new key simply starts, with no pivot and dominant to prepare it.
  if (!pivot) return { ok: true, detail: `${base}, directly` };
  return {
    ok: false,
    detail: `${base}, but through a pivot chord (${toLeadSheet(rootPos(pivot.chord as ChordId))}, then ${domName}); the brief asks for a direct change: start the new key with no chord to prepare it`,
    where: { bar: R.floor(pivot.span[0]) + shift },
  };
}

// --- velocity-ghosts: drum, accents (U13.L02) -----------------------------------------------------------------

/**
 * One pass of a line's own loop, dynamics included (bars that repeat note for note and level for level): a count
 * of ghost notes or accents is made on the idea, not on how long it was played (as `motif-reuse` reads a riff).
 */
function onePass(events: readonly NEvent[], bars: number): NEvent[] {
  const window = Math.max(1, bars);
  const sig = (b: number): string =>
    events
      .filter((e) => R.floor(e.onset) === b)
      .map((e) => {
        const f = R.frac(e.onset);
        return `${e.track}|${f[0]}/${f[1]}|${e.midi ?? ""}|${e.s ?? ""}|${e.gain.toFixed(3)}`;
      })
      .sort()
      .join(";");
  const sigs = Array.from({ length: window }, (_, b) => sig(b));
  let period = window;
  for (let p = 1; p * 2 <= window; p++) {
    let same = true;
    for (let c = 0; c + p < window && same; c++) same = sigs[c] === sigs[c + p];
    if (same) {
      period = p;
      break;
    }
  }
  return events.filter((e) => R.floor(e.onset) < period);
}
export function velocityGhostsRule(
  r: RuleOf<"velocity-ghosts">,
  n: Normalized,
  ctx: RubricContext,
): RuleEval {
  let line: NEvent[] = selectTrack(n, r.track);
  if (r.drum) line = line.filter((e) => e.drum === r.drum);
  const reach = line.reduce((m, e) => Math.max(m, R.floor(e.onset) + 1), 0);
  line = onePass(line, Math.max(1, Math.min(ctx.bars ?? reach, reach || 1)));
  const maxGain = r.maxGain ?? 0.4;
  const ghosts = velocityGhosts(line, { meter: ctx.meter, maxGain, ...(r.on ? { on: r.on } : {}) });
  const where16 = r.on === "16th-offbeat" ? " on 16th off-beats" : "";
  const base = `${ghosts.length} ghost note(s)${where16}; at least ${r.min}`;
  if (r.drum === undefined && r.accents === undefined)
    return { ok: ghosts.length >= r.min, value: ghosts.length, target: r.min, detail: base };
  const what = r.drum ? `${DRUM_WORDS[r.drum] ?? r.drum} hit` : "hit";
  if (line.length === 0)
    return {
      ok: false,
      value: 0,
      target: r.min,
      detail: `no ${what}s on \`${r.track.replace(/^@/, "")}\` yet`,
    };
  // An accent is one of the line's loudest hits (a line under its own `.gain(.5)` never reaches full level), and
  // louder than a ghost note: a line that is quiet throughout has no accents.
  const loudest = Math.max(...line.map((e) => e.gain));
  const accents = line.filter((e) => e.gain >= loudest * 0.8 - 1e-9 && e.gain > maxGain + 1e-9);
  const quietAnywhere = velocityGhosts(line, { meter: ctx.meter, maxGain, on: "any" });
  const needAccents = r.accents ?? 0;
  const okGhosts = ghosts.length >= r.min;
  const okAccents = accents.length >= needAccents;
  const parts: string[] = [];
  if (!okGhosts) {
    if (quietAnywhere.length === 0)
      parts.push(
        `every ${what} is at the same strength: give the small ones \`.velocity()\` values of .4 or less (${ghosts.length} ghost notes${where16}; at least ${r.min})`,
      );
    else if (r.on === "16th-offbeat" && quietAnywhere.length > ghosts.length) {
      const onBeat = quietAnywhere.find((e) => !ghosts.includes(e)) as NEvent;
      const at = locAt(onBeat.onset, ctx);
      parts.push(
        `${ghosts.length} ghost note(s) on 16th off-beats; at least ${r.min} (the quiet ${what} at ${barWord(at.bar ?? 0)}, ${at.beatLabel} is on the eighth-note grid: a ghost note sits on a sixteenth between the eighths)`,
      );
    } else parts.push(base);
  }
  if (!okAccents)
    parts.push(
      accents.length === 0
        ? `every ${what} is quiet (the loudest is ${Math.round(loudest * 100) / 100}): keep the accents at full strength, \`.velocity()\` 1`
        : `${accents.length} accent(s) at full strength; at least ${needAccents}`,
    );
  const ok = okGhosts && okAccents;
  const firstBad =
    !okGhosts && quietAnywhere.length > ghosts.length
      ? quietAnywhere.find((e) => !ghosts.includes(e))
      : undefined;
  return {
    ok,
    value: ghosts.length,
    target: r.min,
    ...(okGhosts && !okAccents
      ? { credit: needAccents > 0 ? 0.5 + 0.5 * Math.min(1, accents.length / needAccents) * 0.99 : 1 }
      : {}),
    detail: ok
      ? `${ghosts.length} ghost note(s)${where16}${needAccents ? ` beside ${accents.length} accent(s)` : ""}`
      : parts.join("; "),
    ...(firstBad ? { where: locAt(firstBad.onset, ctx, { track: firstBad.track }) } : {}),
  };
}
const DRUM_WORDS: Record<string, string> = {
  kick: "kick",
  snare: "snare",
  hatClosed: "hi-hat",
  hatOpen: "open hi-hat",
  ride: "ride",
  clap: "clap",
  rim: "rim",
};

// --- tuplets (U13.L05) ----------------------------------------------------------------------------------------

/** `tuplets`: a triplet (or any tuplet) somewhere in the line, counted on one pass of its loop. */
export function tupletsRule(r: RuleOf<"tuplets">, n: Normalized, ctx: RubricContext): RuleEval {
  // A swung line is long–short eighths, not triplets (U13.L05 teaches the difference): it is read straightened.
  const all = straightenSwungLines(selectTrack(n, r.track), ctx.code);
  const reach = all.reduce((m, e) => Math.max(m, R.floor(e.onset) + 1), 0);
  const line = onePass(all, Math.max(1, Math.min(ctx.bars ?? reach, reach || 1)));
  if (line.length === 0)
    return { ok: false, value: 0, target: r.min, detail: `nothing on \`${r.track.replace(/^@/, "")}\` yet` };
  // Each line on its own (a track, a drum of a kit): on `*` a beat that holds a triplet in one line and eighths in
  // another is still a triplet. The same group in two lines counts once.
  const seen = new Set<string>();
  const groups = linesOf(line)
    .flatMap((l) => tupletsOf(l, ctx.meter))
    .filter((t) => r.division === undefined || t.division === r.division)
    .filter((t) => {
      const k = `${t.bar}|${t.beat}|${t.division}|${t.span}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => a.bar - b.bar || a.beat - b.beat);
  const what = r.division === 3 ? "triplet" : r.division === undefined ? "tuplet" : `group of ${r.division}`;
  const first = groups[0];
  const ok = groups.length >= r.min;
  const compound = METERS[ctx.meter].tempoUnit === "dottedQuarter";
  return {
    ok,
    value: groups.length,
    target: r.min,
    detail: ok
      ? `${groups.length} ${what}${groups.length === 1 ? "" : "s"}${first ? `, the first in bar ${first.bar}, beat ${first.beat}` : ""}`
      : groups.length === 0
        ? compound
          ? `no ${what} yet: in this meter the beat already divides in three; a duplet cuts it in two`
          : `no ${what} yet: cut a beat into three equal notes, \`[x x x]\` inside one beat or \`.ply(3)\``
        : `${groups.length} ${what}${groups.length === 1 ? "" : "s"}; at least ${r.min}`,
    ...(first ? { where: { bar: first.bar, beat: first.beat } } : {}),
  };
}

// --- reharmonize (U16.L05) ------------------------------------------------------------------------------------

export function reharmonizeRule(r: RuleOf<"reharmonize">, n: Normalized, ctx: RubricContext): RuleEval {
  const ref = ctx.resolveReference?.(r.reference);
  if (!ref)
    return {
      ok: false,
      detail: "the reference could not be evaluated",
      extra: [diag("rubric.unknown", { rule: "reharmonize" })],
    };
  const bars = Math.max(1, r.reference.bars);
  const inRef = (e: NEvent): boolean => R.floor(e.onset) < bars;
  const tuneOf = (x: Normalized): Note[] => {
    const own = selectTrack(x, r.melody).filter(inRef);
    return melodyLine(own.length > 0 ? own : selectTrack(x, "@melody").filter(inRef));
  };
  const want = tuneOf(ref);
  const got = tuneOf(n);
  const key = keyOf(ref.all, ctx.key ?? null);
  const name = (m: number): string => pcWord(m, key);
  // 1. The tune, note for note: pitch, onset and length.
  let tuneFault: { text: string; at: Rat } | null = null;
  const k = (x: Note): string => `${x.onset[0]}/${x.onset[1]}`;
  const gotAt = new Map(got.map((x) => [k(x), x]));
  const wantAt = new Map(want.map((x) => [k(x), x]));
  for (const w of want) {
    const g = gotAt.get(k(w));
    if (!g) tuneFault = { text: `the tune's ${name(w.midi)} is missing`, at: w.onset };
    else if (Math.round(g.midi) !== Math.round(w.midi))
      tuneFault = { text: `the tune has ${name(w.midi)} here; yours has ${name(g.midi)}`, at: w.onset };
    else if (!R.eq(g.dur, w.dur))
      tuneFault = { text: `the tune's ${name(w.midi)} has another length`, at: w.onset };
    if (tuneFault) break;
  }
  if (!tuneFault) {
    const added = got.find((g) => !wantAt.has(k(g)));
    if (added) tuneFault = { text: `${name(added.midi)} is not in the tune`, at: added.onset };
  }
  if (want.length === 0)
    return {
      ok: false,
      detail: "the reference has no tune to keep",
      extra: [diag("rubric.unknown", { rule: "reharmonize" })],
    };
  if (tuneFault) {
    const w = locAt(tuneFault.at, ctx, { track: r.melody.replace(/^@/, "") });
    return {
      ok: false,
      value: 0,
      target: r.min,
      detail: `${cap(barWord(w.bar ?? 0))}, ${w.beatLabel}: ${tuneFault.text}. The tune stays as it is; only the chords change`,
      where: w,
    };
  }
  // 2. The chords: new ones, of the kinds the brief names.
  const mine = readChords(sliceBars(n, bars), { ...ctx, bars, totalBars: bars }, r.harmony);
  if (mine.length === 0)
    return { ok: false, value: 0, target: r.min, detail: "no chords under the tune yet" };
  if (r.kinds && r.kinds.length > 0) {
    const kinds = r.kinds;
    const hits = mine.filter((c) => {
      const kind = outsideChordKind(c.chord, c.key, c.next);
      return kind !== null && kinds.includes(kind);
    });
    const asked = kinds.map((x) => KIND_WORDS[x][0]).join(" or ");
    const found = hits
      .slice(0, 4)
      .map((c) => `${chordText(c.chord, c.key, c.next)} in ${barWord(c.bar)}`)
      .join(", ");
    const ok = hits.length >= r.min;
    return {
      ok,
      value: hits.length,
      target: r.min,
      detail: ok
        ? `the tune is unchanged; new colours: ${found}`
        : hits.length === 0
          ? `the tune is unchanged, and every chord is still the key's own (${heardText(mine)}): bring in ${asked}, ${r.min === 1 ? "once" : `${r.min} of them`}`
          : `the tune is unchanged; ${hits.length} chord(s) from outside the key (${found}); the brief asks for ${r.min}`,
    };
  }
  const theirs = pieceSlots(sliceBars(ref, bars), r.harmony);
  const own = pieceSlots(sliceBars(n, bars), r.harmony);
  let changed = 0;
  for (let b = 0; b < bars; b++) {
    const a = slotAt(theirs, rat(b))?.chord ?? null;
    const c = slotAt(own, rat(b))?.chord ?? null;
    if (c && !coreEq(a, c)) changed++;
  }
  const ok = changed >= r.min;
  return {
    ok,
    value: changed,
    target: r.min,
    detail: ok
      ? `the tune is unchanged over new chords in ${changed} bar(s)`
      : `the tune is unchanged; ${changed} bar(s) have a new chord, the brief asks for ${r.min}`,
  };
}
function sliceBars(n: Normalized, bars: number): Normalized {
  const keep = (events: readonly NEvent[]): NEvent[] => events.filter((e) => R.floor(e.onset) < bars);
  const byTrack: Record<string, NEvent[]> = {};
  for (const [t, ev] of Object.entries(n.byTrack)) byTrack[t] = keep(ev);
  return { ...n, byTrack, all: keep(n.all), band: keep(n.band) };
}

// --- key-change: the chords move with the tune (C7) ---------------------------------------------------------------

/**
 * A lifted section whose chords are still the old key's (the tune moved through `.scale()`, the chord names never
 * did): the first bar where the new section's chord is the earlier section's chord unmoved. `null` when the chords
 * moved, differ, or one of the sections has none.
 */
export function chordsLeftBehind(
  n: Normalized,
  earlier: { startBar: number; bars: number },
  here: { startBar: number; bars: number },
  semitones: number,
): { bar: number; got: ChordId; want: ChordId; same: number; of: number } | null {
  const slots = pieceSlots(n).filter((s) => s.chord);
  if (slots.length === 0 || semitones % 12 === 0) return null;
  const len = Math.min(earlier.bars, here.bars);
  let same = 0;
  let moved = 0;
  let of = 0;
  let first: { bar: number; got: ChordId; want: ChordId } | null = null;
  for (let b = 0; b < len; b++) {
    const a = slotAt(slots, rat(earlier.startBar + b))?.chord ?? null;
    const c = slotAt(slots, rat(here.startBar + b))?.chord ?? null;
    if (!a || !c) continue;
    of++;
    const lifted: ChordId = {
      ...a,
      rootPc: mod12(a.rootPc + semitones) as ChordId["rootPc"],
      bassPc: mod12(a.bassPc + semitones) as ChordId["bassPc"],
    };
    if (coreEq(c, lifted)) moved++;
    else if (coreEq(c, a)) {
      same++;
      first ??= { bar: here.startBar + b, got: c, want: lifted };
    }
  }
  if (!first || of === 0 || same / of < 0.75 || moved > 0) return null;
  return { ...first, same, of };
}
export const liftedChordName = (want: ChordId, key: KeySpec): string => {
  const root = pcWord(want.rootPc, key);
  const sym = toLeadSheet(rootPos(want));
  // The lead-sheet symbol with the root spelled in the new key.
  return sym.replace(/^[A-G](?:♯|♭|#|b)?/, root);
};
