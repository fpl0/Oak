// Custom rubric rules of the corrections pass (before the learner starts the course): checks of the musical EFFECT a
// step asks for, where a rule that sees only the syntax let a no-op through (a `~` under hats that still play, `@1`,
// `<[one bar]>`, `.slow(1)`, `.transpose(0)`, a "second key" that is the first, `.orbit(2)` on both parts, a call
// doubled instead of answered, a "third" a sixth below, a progression whose bars are all one chord).
//
// Content uses them as `{ rule: "custom", fn: "<name>", params: { … } }` (contracts §5.6 `custom`), each listed in
// `IMPLEMENTED.customRules` and unit-tested on a right and a wrong piece in corrections-rules.test.ts. Every rule
// returns a detail line a learner can act on; the step's own label says what was asked.
import type { KeySpec, NEvent, Rat } from "@oak/content-kit";
import { R, rat } from "@oak/content-kit";
import type { ChordId } from "@oak/theory";
import { keyFromScaleCtx, METERS, parseChordSymbol, scalePcs, toLeadSheet, triadCore } from "@oak/theory";
import type { ChordSlot } from "../analyze/chords.ts";
import { chordsOfRomans } from "../analyze/chords.ts";
import { locAt, mod12, onsets, pitched, ratKey } from "../analyze/events.ts";
import { periodOf, selectTrack, selectTracks } from "../analyze/tracks.ts";
import { noteName } from "../match/common.ts";
import { adsrValues } from "../match/controls.ts";
import type { Normalized } from "../types.ts";
import type { RubricContext } from "./context.ts";
import { voicedChords } from "./harmony-rules.ts";

/** What a custom rule returns (the `RuleEval` of rules.ts, restated to keep this module free of a cycle). */
export interface CorrectionEval {
  ok: boolean;
  value?: number;
  target?: number;
  credit?: number;
  detail: string;
  where?: { bar?: number; beat?: number; beatLabel?: string; track?: string };
}
export type CorrectionRule = (
  n: Normalized,
  ctx: RubricContext,
  params: Record<string, unknown>,
) => CorrectionEval;

/** What the rules need from rules.ts, passed in so the two modules do not import each other. */
export interface CorrectionDeps {
  pieceSlots: (n: Normalized, track?: string, opts?: { exclude?: string }) => ChordSlot[];
  ruleKeys: (n: Normalized, ctx: RubricContext) => KeySpec[];
  pieceBars: (n: Normalized, ctx: RubricContext) => number;
  /** Whether the code uses one of these toolbox IDs, and their names for the learner (the `uses` rule's reading). */
  toolUse: (ctx: RubricContext, tools: readonly string[], n?: Normalized) => { used: boolean; label: string };
}

// --- params -----------------------------------------------------------------------------------------

const num = (p: Record<string, unknown>, k: string, d: number): number =>
  typeof p[k] === "number" && Number.isFinite(p[k]) ? (p[k] as number) : d;
const str = (p: Record<string, unknown>, k: string, d: string): string =>
  typeof p[k] === "string" && (p[k] as string).length > 0 ? (p[k] as string) : d;
const strs = (p: Record<string, unknown>, k: string): string[] | undefined =>
  Array.isArray(p[k]) && (p[k] as unknown[]).every((x) => typeof x === "string")
    ? (p[k] as string[])
    : undefined;
const nums = (p: Record<string, unknown>, k: string): number[] | undefined =>
  Array.isArray(p[k]) && (p[k] as unknown[]).every((x) => typeof x === "number")
    ? (p[k] as number[])
    : undefined;
const rats = (p: Record<string, unknown>, k: string): Rat[] | undefined =>
  Array.isArray(p[k]) &&
  (p[k] as unknown[]).every(
    (x) => Array.isArray(x) && x.length === 2 && x.every((y) => typeof y === "number") && x[1] !== 0,
  )
    ? (p[k] as [number, number][]).map(([a, b]) => rat(a, b))
    : undefined;

// --- shared helpers ---------------------------------------------------------------------------------

const plural = (k: number, word: string): string => `${k} ${word}${k === 1 ? "" : "s"}`;
/** A track for the learner: `mel`, or "your lines" for every learner track (`*`). */
const ROLE_WORDS: Record<string, string> = {
  "@melody": "the tune",
  "@bass": "the bass",
  "@drums": "the drums",
  "@chords": "the chords",
};
const trackWord = (ref: string): string =>
  ref === "*" ? "your lines" : (ROLE_WORDS[ref] ?? `\`${ref.replace(/^@/, "")}\``);

/** Bars of the events' reach, capped by the bars the grader queried. */
function windowOf(events: readonly NEvent[], ctx: RubricContext): number {
  const reach = events.reduce((m, e) => Math.max(m, R.floor(e.onset) + 1), 0);
  return Math.max(1, Math.min(ctx.bars ?? reach, reach || 1));
}
/** One pass of the line's own loop (a 1-bar groove queried for 16 bars is read as its 1 bar). */
function passBars(events: readonly NEvent[], ctx: RubricContext): number {
  return periodOf(events, 16, windowOf(events, ctx));
}
const beatOf = (ctx: RubricContext): Rat => rat(1, METERS[ctx.meter].unitsPerBar);
/** "bar 2, beat 1" (a beat's own number), "bar 2, 1&" (a place inside a beat). */
export const placeText = (at: Rat, ctx: Pick<RubricContext, "meter" | "pickup">): string => {
  const l = locAt(at, ctx);
  const label = String(l.beatLabel ?? "");
  return `bar ${l.bar}, ${/^\d+$/.test(label) ? `beat ${label}` : label}`;
};
const where = placeText;
/** What starts or still sounds in [from, to): onsets of every event, plus pitched notes held into it. */
function heardIn(events: readonly NEvent[], from: Rat, to: Rat): NEvent[] {
  return events.filter((e) => {
    const end = R.add(e.onset, e.clipDur ?? e.dur);
    if (R.lte(from, e.onset) && R.lt(e.onset, to)) return true;
    // A drum hit is heard where it starts; a pitched note for as long as it is written to last.
    return e.midi !== null && R.lt(e.onset, from) && R.lt(from, end);
  });
}
const nameOf = (e: NEvent, key: KeySpec | null): string =>
  e.midi !== null ? noteName(e.midi, key) : (e.s ?? "a sound");

// --- silent-beat ---------------------------------------------------------------------------------------

/**
 * `silent-beat` (U01.L02 "at least one silent beat"; U02.L07 "keep the rest at the end"). A beat is silent when no
 * listed track starts a sound in it and no pitched note is still sounding there. Read on one pass of the loop.
 * params: `tracks` (default every learner track: a rest in the drums under hats that still play is no silent
 * beat); `min` silent beats (default 1); `at`: `"end"` (the last beat of the pass) or in-bar beat starts as
 * `[n, d]` cycles (`[[3, 4]]` = beat 4 of every bar), each of which must be silent.
 */
const silentBeat: CorrectionRule = (n, ctx, p) => {
  const refs = strs(p, "tracks");
  const events = refs ? selectTracks(n, refs) : n.all;
  if (events.length === 0) return { ok: false, value: 0, target: 1, detail: "nothing plays yet" };
  const beat = beatOf(ctx);
  const units = METERS[ctx.meter].unitsPerBar;
  const bars = passBars(events, ctx);
  const key = ctx.key ?? null;
  const at = p.at === "end" ? "end" : rats(p, "at");
  const busy = (from: Rat): NEvent[] => heardIn(events, from, R.add(from, beat));
  const say = (from: Rat, got: NEvent[]): string => {
    const first = got[0] as NEvent;
    const held = R.lt(first.onset, from);
    return `${where(from, ctx)} is not silent: ${nameOf(first, key)} ${held ? "still sounds there" : "plays there"}`;
  };
  if (at === "end") {
    const from = R.sub(rat(bars), beat);
    const got = busy(from);
    return got.length === 0
      ? { ok: true, detail: `the last beat (${where(from, ctx)}) is silent` }
      : {
          ok: false,
          value: 0,
          target: 1,
          detail: `${say(from, got)}; leave the last beat empty with \`~\``,
          where: locAt(from, ctx),
        };
  }
  if (at) {
    for (let b = 0; b < bars; b++)
      for (const pos of at) {
        const from = R.add(rat(b), R.frac(pos));
        const got = busy(from);
        if (got.length > 0)
          return {
            ok: false,
            value: 0,
            target: 1,
            detail: `${say(from, got)}; keep that beat empty with \`~\``,
            where: locAt(from, ctx),
          };
      }
    return {
      ok: true,
      detail: `beat ${at.map((x) => R.floor(R.mul(R.frac(x), [units, 1])) + 1).join(", ")} silent`,
    };
  }
  const min = num(p, "min", 1);
  const silent: Rat[] = [];
  let firstBusy: { from: Rat; got: NEvent[] } | null = null;
  for (let b = 0; b < bars; b++)
    for (let u = 0; u < units; u++) {
      const from = rat(b * units + u, units);
      const got = busy(from);
      if (got.length === 0) silent.push(from);
      else firstBusy ??= { from, got };
    }
  const ok = silent.length >= min;
  const tracksText = refs ? refs.map(trackWord).join(", ") : "every part";
  return {
    ok,
    value: silent.length,
    target: min,
    detail: ok
      ? `${plural(silent.length, "silent beat")} (${where(silent[0] as Rat, ctx)} first)`
      : `${plural(silent.length, "silent beat")}; at least ${min}. A silent beat is empty in ${tracksText}: a \`~\` in one part does not silence the others${firstBusy ? ` (${where(firstBusy.from, ctx)}: ${nameOf(firstBusy.got[0] as NEvent, key)})` : ""}`,
  };
};

// --- split-beat ----------------------------------------------------------------------------------------

/**
 * `split-beat` (U01.L04 "splits a beat with `[ ]`"): at least `min` (default 1) beats in which `track` (default
 * every learner track) starts a sound after the beat's own start: two or more sounds in one beat (`[sd sd]`), or
 * one off the beat (`[~ sd]`). `[hh hh hh hh]` over a whole bar is four quarter notes: no beat is split.
 */
const splitBeat: CorrectionRule = (n, ctx, p) => {
  const ref = str(p, "track", "*");
  const events = selectTrack(n, ref);
  if (events.length === 0)
    return { ok: false, value: 0, target: 1, detail: `nothing plays in ${trackWord(ref)}` };
  const units = METERS[ctx.meter].unitsPerBar;
  const bars = passBars(events, ctx);
  const min = num(p, "min", 1);
  const beatsSplit = new Set<number>();
  for (const o of onsets(events, { dedupe: true })) {
    if (R.floor(o) >= bars) continue;
    const pos = R.mul(o, [units, 1]);
    if (pos[1] !== 1) beatsSplit.add(R.floor(pos));
  }
  const split = beatsSplit.size;
  const first = split > 0 ? rat(Math.min(...beatsSplit), units) : null;
  const ok = split >= min;
  return {
    ok,
    value: split,
    target: min,
    detail: ok
      ? `${plural(split, "beat")} split (${where(first as Rat, ctx)} first)`
      : `no beat is split: every sound in ${trackWord(ref)} starts on a beat. Put two sounds inside one beat, such as \`[hh hh]\` in place of one \`hh\``,
  };
};

// --- held --------------------------------------------------------------------------------------------

/**
 * `held` (U01.L05 "holds a sound with `@` or `_`"): at least `min` (default 1) sounds in `track` (default every
 * learner track) that last two beats or more, or at least twice as long as another sound of the same track in the
 * same bar. `cr@1 bd sd sd` holds nothing: every sound is one beat.
 */
const held: CorrectionRule = (n, ctx, p) => {
  const ref = str(p, "track", "*");
  const events = selectTrack(n, ref);
  if (events.length === 0)
    return { ok: false, value: 0, target: 1, detail: `nothing plays in ${trackWord(ref)}` };
  const bars = passBars(events, ctx);
  const beat = beatOf(ctx);
  const min = num(p, "min", 1);
  const inPass = events.filter((e) => R.floor(e.onset) < bars);
  const longOnes = inPass.filter((e) => {
    if (R.lte(R.mul(beat, [2, 1]), e.dur)) return true;
    const sameBar = inPass.filter(
      (o) => o !== e && o.track === e.track && R.floor(o.onset) === R.floor(e.onset),
    );
    return sameBar.some((o) => R.lte(R.mul(o.dur, [2, 1]), e.dur));
  });
  const ok = longOnes.length >= min;
  const first = longOnes[0];
  return {
    ok,
    value: longOnes.length,
    target: min,
    detail: ok
      ? `${plural(longOnes.length, "held sound")} (${where((first as NEvent).onset, ctx)}: ${nameOf(first as NEvent, ctx.key ?? null)})`
      : `no sound lasts longer than the others: each one takes one step of its bar. \`@1\` keeps a sound one step long; write \`@2\` or more, or \`_\` after it`,
  };
};

// --- bars-differ ---------------------------------------------------------------------------------------

/**
 * `bars-differ` (U01.L07 "changes a bar with `< >`"): `track` (default every learner track) plays at least `min`
 * (default 2) different bars before its loop repeats. `<[~ sd ~ sd]>` holds one choice: every bar is the same.
 */
const barsDiffer: CorrectionRule = (n, ctx, p) => {
  const ref = str(p, "track", "*");
  const events = selectTrack(n, ref);
  if (events.length === 0)
    return { ok: false, value: 0, target: 1, detail: `nothing plays in ${trackWord(ref)}` };
  const min = num(p, "min", 2);
  const bars = passBars(events, ctx);
  // `last: true` (corrections gate, AS-32; C0 "a fill: the last bar changes"): the loop's last bar plays something
  // the bar before it does not.
  if (p.last === true && bars >= 2) {
    const sig = (b: number): string =>
      events
        .filter((e) => R.floor(e.onset) === b)
        .map((e) => `${ratKey(R.sub(e.onset, rat(b)))}:${e.midi ?? e.s}`)
        .sort()
        .join(",");
    if (sig(bars - 1) === sig(bars - 2))
      return {
        ok: false,
        value: 0,
        target: 1,
        detail: `bar ${bars}, the last of the loop, plays what bar ${bars - 1} plays: a fill changes the last bar. Put it there with \`< >\`, such as \`<~ ~ ~ [ht ht mt lt]>\``,
      };
  }
  const ok = bars >= min;
  return {
    ok,
    value: bars,
    target: min,
    detail: ok
      ? `${trackWord(ref)} change${ref === "*" ? "" : "s"} over a ${bars}-bar loop`
      : `every bar of ${trackWord(ref)} plays the same thing: a \`< >\` with one choice repeats it. Put two or more bars inside \`< >\``,
  };
};

// --- speed-change --------------------------------------------------------------------------------------

/** The factors written in `.slow(…)`, `.fast(…)`, `.hurry(…)` calls, comments left out. */
export function speedFactors(code: string): { fn: string; arg: string; values: number[] | null }[] {
  const clean = code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const out: { fn: string; arg: string; values: number[] | null }[] = [];
  const re = /\.(slow|fast|hurry)\s*\(\s*([^()]*?)\s*\)/g;
  for (let m = re.exec(clean); m; m = re.exec(clean)) {
    const arg = m[2] as string;
    const quoted = /^(["'`])(.*)\1$/.exec(arg);
    const text = quoted ? (quoted[2] as string) : arg;
    // Numbers, fractions and mini-notation atoms; anything else (a variable, a signal) cannot be read.
    if (!/^[\d\s./<>[\]~!*,]+$/.test(text) || text.trim() === "") {
      out.push({ fn: m[1] as string, arg, values: null });
      continue;
    }
    const values = (text.match(/\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)?/g) ?? []).map((t) => {
      const [a, b] = t.split("/").map((x) => Number(x.trim()));
      return b === undefined ? (a as number) : (a as number) / b;
    });
    out.push({ fn: m[1] as string, arg, values: quoted ? values : values.slice(0, 1) });
  }
  return out;
}

/** A labelled line of the code (`kick: …` and its indented continuation), or the whole code when it has no label. */
function codeBlocks(code: string): { label: string | null; text: string }[] {
  const clean = code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const out: { label: string | null; text: string }[] = [];
  let cur: { label: string | null; text: string } = { label: null, text: "" };
  for (const line of clean.split("\n")) {
    const m = /^([A-Za-z_$][\w$]*)\s*:(?!:)/.exec(line);
    if (m) {
      out.push(cur);
      cur = { label: m[1] as string, text: line };
    } else if (cur.label !== null && /^\s/.test(line)) cur.text += `\n${line}`;
    else {
      out.push(cur);
      cur = { label: null, text: line };
    }
  }
  out.push(cur);
  return out.filter((b) => b.text.trim() !== "");
}

/** A tempo factor that is heard as a new feel: half-time, double-time, 1.5 … not 1.01 (|log2 f| ≥ 0.4). */
const FELT_SPEED = 0.4;
const felt = (f: number): boolean => f > 0 && Math.abs(Math.log2(f)) >= FELT_SPEED;

/**
 * `speed-change` (U01.L09 "`.slow(2)` for half-time or `.fast(2)` for double-time"): at least `min` (default 1)
 * heard lines whose `.slow()` / `.fast()` / `.hurry()` calls, taken together, change their speed by a factor you
 * can feel (2, ½, 1.5; not 1 or 1.01). `.slow(2).fast(2)` cancels out; a line that is muted (`_x:`), silent
 * (`.gain(0)`, only rests) or masked does not count. A factor written as a variable or a signal counts (it cannot
 * be read without playing), and so does a call outside a labelled line (a `const` a line plays).
 */
const speedChange: CorrectionRule = (n, ctx, p) => {
  const min = num(p, "min", 1);
  const heard = (label: string | null): boolean => {
    if (label === null) return true;
    if (label.startsWith("_")) return false;
    if (label === "$") return Object.entries(n.byTrack).some(([t, es]) => /^\$\d*$/.test(t) && es.length > 0);
    return (n.byTrack[label]?.length ?? 0) > 0;
  };
  let real = 0;
  let still: { fn: string; arg: string } | null = null;
  let silent: string | null = null;
  for (const b of codeBlocks(ctx.code)) {
    const calls = speedFactors(b.text);
    if (calls.length === 0) continue;
    if (!heard(b.label)) {
      silent ??= b.label;
      continue;
    }
    let net = 1;
    let changes = false;
    for (const c of calls) {
      if (c.values === null) changes = true;
      else if (c.values.length > 1) changes ||= c.values.some((v) => felt(c.fn === "slow" ? 1 / v : v));
      else if (c.values.length === 1)
        net *= c.fn === "slow" ? 1 / (c.values[0] as number) : (c.values[0] as number);
    }
    if (changes || felt(net)) real++;
    else still ??= calls.length === 1 ? (calls[0] as { fn: string; arg: string }) : { fn: "", arg: "" };
  }
  const ok = real >= min;
  return {
    ok,
    value: real,
    target: min,
    detail: ok
      ? `${plural(real, "line")} changes speed`
      : still && still.fn !== ""
        ? `\`.${still.fn}(${still.arg})\` keeps the speed it had, or nearly: a factor of 1 changes nothing you can feel. Use \`.slow(2)\` for half-time or \`.fast(2)\` for double-time`
        : still
          ? "the speed calls on that line cancel out: `.slow(2).fast(2)` plays it as fast as before. Keep one of them"
          : silent !== null
            ? `the line that changes speed (\`${silent}\`) is not heard: it is muted, silent or only rests. Add \`.slow(2)\` or \`.fast(2)\` to a line that plays`
            : "no line changes speed yet: add `.slow(2)` or `.fast(2)` to one",
  };
};

// --- transposed-copy -----------------------------------------------------------------------------------

interface Unit {
  track: string;
  /** First bar of the unit (0-based). */
  bar: number;
  /** Onset in the unit → MIDI notes there, ascending. */
  times: string[];
  midis: number[][];
  /** The sounds (`s`) the unit plays. */
  sounds: Set<string>;
  /** The key each onset is read in (its own `.scale()`, else the key of its bar). */
  keys: (KeySpec | null)[];
}
function unitsOf(
  events: readonly NEvent[],
  bars: number,
  unitBars = 1,
  keyAt: (e: NEvent) => KeySpec | null = () => null,
): Unit[] {
  const out: Unit[] = [];
  const byTrack = new Map<string, NEvent[]>();
  for (const e of pitched(events)) byTrack.set(e.track, [...(byTrack.get(e.track) ?? []), e]);
  for (const [track, list] of byTrack)
    for (let b = 0; b + unitBars <= bars; b += unitBars) {
      const here = list.filter((e) => R.floor(e.onset) >= b && R.floor(e.onset) < b + unitBars);
      if (here.length === 0) continue;
      const at = new Map<string, NEvent[]>();
      const pos = new Map<string, Rat>();
      for (const e of here) {
        const rel = R.sub(e.onset, rat(b));
        const k = ratKey(rel);
        at.set(k, [...(at.get(k) ?? []), e]);
        pos.set(k, rel);
      }
      const keys = [...at.keys()].sort((x, y) => R.cmp(pos.get(x) as Rat, pos.get(y) as Rat));
      const sorted = keys.map((k) =>
        [...(at.get(k) as NEvent[])].sort((x, y) => (x.midi as number) - (y.midi as number)),
      );
      out.push({
        track,
        bar: b,
        times: keys,
        midis: sorted.map((es) => es.map((e) => e.midi as number)),
        sounds: new Set(here.map((e) => e.s ?? "triangle")),
        keys: sorted.map((es) => keyAt(es[0] as NEvent)),
      });
    }
  return out;
}
/** The note's place on its key's ladder of scale steps (7 to the octave), or `null` for a note outside the key. */
function stepIndex(midi: number, key: KeySpec | null): number | null {
  if (!key) return null;
  const pcs = [...new Set(scalePcs(key).map(mod12))].sort((a, b) => a - b);
  const i = pcs.indexOf(mod12(midi));
  return i < 0 ? null : pcs.length * Math.floor(midi / 12) + i;
}
/**
 * The constant interval that moves `a` onto `b`, or `null` when no single interval does. In half steps; with
 * `diatonic`, in scale steps of each note's key (C E G moved up a step is D F A).
 */
function shiftBetween(a: Unit, b: Unit, sameRhythm: boolean, diatonic = false): number | null {
  if (a.midis.length !== b.midis.length || a.midis.length === 0) return null;
  if (sameRhythm && a.times.join() !== b.times.join()) return null;
  const val = (u: Unit, i: number, j: number): number | null => {
    const m = u.midis[i]?.[j] as number;
    return diatonic ? stepIndex(m, u.keys[i] ?? null) : m;
  };
  const a0 = val(a, 0, 0);
  const b0 = val(b, 0, 0);
  if (a0 === null || b0 === null) return null;
  const k = b0 - a0;
  for (let i = 0; i < a.midis.length; i++) {
    const x = a.midis[i] as number[];
    const y = b.midis[i] as number[];
    if (x.length !== y.length) return null;
    for (let j = 0; j < x.length; j++) {
      const p = val(a, i, j);
      const q = val(b, i, j);
      if (p === null || q === null || q - p !== k) return null;
    }
  }
  return k;
}

/**
 * `transposed-copy` (U02.L05 "play it again higher or lower"; U04.L04 "every distance keeps its size"): a bar of
 * one line comes back, in a later bar or on another line, with every note moved by the same interval of at least
 * `minSemis` (default 1) half steps. params: `track` (default every pitched learner track), `min` copies (default
 * 1), `rhythm`: `"same"` (default: the copy keeps the rhythm) or `"any"`. `.transpose(0)` moves nothing.
 *
 * Leftovers of the corrections pass, each optional:
 * - `unitBars` (default 1): the unit compared is this many bars, starting on a multiple of it (U03.L10: bars 3–4
 *   answer bars 1–2 with ONE move for both bars, so `[5 5 5 7] [1 0 1 2]` is no answer).
 * - `steps: "diatonic"`: the move is counted in scale steps of each note's key (a tonal sequence: `n` numbers
 *   moved by the same amount); `minSemis` then counts steps. `"either"`: in scale steps, or else in half steps
 *   (an exact transposition out of the key), as `motif-reuse` reads `shape: "either"`.
 * - `pairs: [[from, to], …]` (1-based bars where the units start): only these copies count (U03.L11: bar 5 brings
 *   back bar 1, not bar 2 or 3).
 * - `together: true`: only a copy on ANOTHER line in the SAME bars counts (a doubling, U02.L06); `semis` lists
 *   the moves allowed (`[0, 12, -12]`: the same height or an octave apart), `otherSound: true` asks the copy to
 *   play other sounds than the line it doubles, and `minRatio` the share of the bars with a pitched note that are
 *   doubled (default: `min` copies). With `semis` that leave out 0 the copy is a harmony (U04.L02), and the
 *   learner reads about a harmony, not a doubling.
 * - `alone: true` (corrections gate): the copy is what its bar plays (U04.L04: bar 2 answers bar 1; a copy on a
 *   second line under a bar 2 of another shape, heard at the same time, is no answer).
 */
const transposedCopy: (deps: CorrectionDeps) => CorrectionRule = (deps) => (n, ctx, p) => {
  const ref = str(p, "track", "*");
  const events = pitched(selectTrack(n, ref));
  if (events.length === 0) return { ok: false, value: 0, target: 1, detail: "no pitched notes yet" };
  const minSemis = num(p, "minSemis", 1);
  const min = num(p, "min", 1);
  const same = str(p, "rhythm", "same") !== "any";
  const unitBars = Math.max(1, Math.round(num(p, "unitBars", 1)));
  const stepsMode = str(p, "steps", "semitones");
  const diatonic = stepsMode === "diatonic" || stepsMode === "either";
  const together = p.together === true;
  const otherSound = p.otherSound === true;
  const alone = p.alone === true;
  const allowed = nums(p, "semis");
  const pairs = Array.isArray(p.pairs)
    ? (p.pairs as unknown[])
        .filter(
          (x): x is [number, number] =>
            Array.isArray(x) && x.length === 2 && x.every((y) => typeof y === "number"),
        )
        .map(([a, b]) => [a - 1, b - 1] as [number, number])
    : null;
  const minRatio = typeof p.minRatio === "number" ? (p.minRatio as number) : null;
  const ruleKeys = diatonic ? deps.ruleKeys(n, ctx) : [];
  const keyAt = (e: NEvent): KeySpec | null =>
    (e.scaleCtx ? keyFromScaleCtx(e.scaleCtx) : null) ??
    ruleKeys[Math.max(0, Math.min(ruleKeys.length - 1, R.floor(e.onset)))] ??
    ctx.key ??
    null;
  // One pass of the piece's loop (a 2-bar riff played 4 times is read as its 2 bars, so a repeat is no copy).
  const pass = passBars(selectTrack(n, "*"), ctx);
  const units = unitsOf(events, pass, unitBars, keyAt);
  const fits = (k: number): boolean => (allowed ? allowed.includes(k) : Math.abs(k) >= minSemis);
  const copies = new Set<string>();
  const coveredBars = new Set<number>();
  let k0: number | null = null;
  let k0Steps = false;
  let sameOnly = false;
  let sameSound: { a: Unit; b: Unit } | null = null;
  let notAllowed: { a: Unit; b: Unit; k: number } | null = null;
  for (let i = 0; i < units.length; i++)
    for (let j = 0; j < units.length; j++) {
      if (i === j) continue;
      const a = units[i] as Unit;
      const b = units[j] as Unit;
      if (together) {
        if (b.bar !== a.bar || b.track === a.track || j < i) continue;
      } else {
        // The copy comes later, or at the same time on another line.
        if (b.bar < a.bar || (b.bar === a.bar && b.track === a.track)) continue;
        if (b.bar === a.bar && j < i) continue;
        // `alone` (corrections gate, U04.L04 "answer it in bar 2"): the answer is what that bar plays; a copy
        // under another line that plays a different shape at the same time is no answer.
        if (
          alone &&
          units.some(
            (u) =>
              u !== b &&
              u !== a &&
              u.bar === b.bar &&
              shiftBetween(a, u, same, false) === null &&
              shiftBetween(b, u, same, false) === null,
          )
        )
          continue;
      }
      if (pairs && !pairs.some(([x, y]) => x === a.bar && y === b.bar)) continue;
      let k = diatonic ? shiftBetween(a, b, same, true) : null;
      const inSteps = k !== null;
      if (k === null && stepsMode !== "diatonic") k = shiftBetween(a, b, same, false);
      if (k === null) continue;
      if (fits(k)) {
        if (otherSound && [...b.sounds].some((s) => a.sounds.has(s))) {
          sameSound ??= { a, b };
          continue;
        }
        copies.add(`${b.track}|${b.bar}`);
        for (let x = 0; x < unitBars; x++) coveredBars.add(b.bar + x);
        if (k0 === null) {
          k0 = k;
          k0Steps = inSteps;
        }
      } else {
        if (k === 0 && (b.bar !== a.bar || b.track !== a.track)) sameOnly = true;
        notAllowed ??= { a, b, k };
      }
    }
  const unitText = (bar: number): string =>
    unitBars === 1 ? `bar ${bar + 1}` : `bars ${bar + 1}–${bar + unitBars}`;
  const moveText = (k: number): string =>
    k0Steps
      ? `${Math.abs(k)} step${Math.abs(k) === 1 ? "" : "s"} ${k > 0 ? "higher" : "lower"}`
      : `${Math.abs(k)} half step${Math.abs(k) === 1 ? "" : "s"} ${k > 0 ? "higher" : "lower"}`;
  if (together) {
    // A harmony (corrections gate, U04.L02): the allowed moves leave out the unison, so the copy is a second voice.
    const harmony = allowed !== undefined && !allowed.includes(0);
    const playing = new Set(units.flatMap((u) => Array.from({ length: unitBars }, (_, x) => u.bar + x)));
    const ratio = playing.size === 0 ? 0 : coveredBars.size / playing.size;
    const ok = minRatio !== null ? ratio >= minRatio - 1e-9 : copies.size >= min;
    const pair = [...copies][0]?.split("|")[0];
    const kText = (k: number): string =>
      k % 12 === 0
        ? `${k === 0 ? "at the same height" : `${Math.abs(k / 12) === 1 ? "an octave" : "two octaves"} ${k > 0 ? "above" : "below"}`}, which only doubles it`
        : `${moveText(k)}, a distance this step does not count`;
    return {
      ok,
      value: minRatio !== null ? ratio : copies.size,
      target: minRatio ?? min,
      detail: ok
        ? harmony
          ? `${trackWord(pair ?? "copy")} follows the line ${moveText(k0 as number)} in ${plural(coveredBars.size, "bar")}`
          : `${trackWord(pair ?? "copy")} doubles the line in ${plural(coveredBars.size, "bar")}`
        : copies.size > 0
          ? harmony
            ? `the harmony moves with the line in ${coveredBars.size} of its ${plural(playing.size, "bar")}: keep every note of it with the line, the same distance away, all the way through`
            : `the line is doubled in ${coveredBars.size} of its ${plural(playing.size, "bar")}: double it all the way through`
          : sameSound
            ? `${trackWord(sameSound.b.track)} doubles ${trackWord(sameSound.a.track)} on the same sound: give the copy another sound with \`.s()\``
            : harmony && notAllowed
              ? `${trackWord(notAllowed.b.track)} moves with ${trackWord(notAllowed.a.track)} ${kText(notAllowed.k)}: put it a 3rd, a 4th, a 5th or a 6th away`
              : harmony
                ? "no line moves with the riff: a harmony plays every note of it, in its rhythm and at the same time, on a second line a named distance away"
                : "no line doubles another: a doubling plays the same notes, in the same rhythm, at the same time on a second line, at the same height or an octave apart",
    };
  }
  const ok = copies.size >= min;
  // `.transpose(0)` (or `"0"`) in the code: the copy it was meant to make sounds where the riff does.
  const zero = /\.transpose\(\s*(["'`]?)\s*0\s*\1\s*\)/.test(ctx.code.replace(/\/\/[^\n]*/g, ""));
  if (pairs) {
    const [from, to] = pairs[0] as [number, number];
    const repeats = to >= pass && pass < windowOf(selectTrack(n, "*"), ctx);
    return {
      ok,
      value: copies.size,
      target: min,
      detail: ok
        ? `${unitText(to)} bring${unitBars === 1 ? "s" : ""} back ${unitText(from)}${k0 ? `, ${moveText(k0)}` : " as it was"}`
        : repeats || sameOnly
          ? `${unitText(to)} play${unitBars === 1 ? "s" : ""} ${unitText(from)} again at the same height: move every note by the same amount`
          : `${unitText(to)} do${unitBars === 1 ? "es" : ""} not bring back ${unitText(from)}: keep the rhythm and move every note by the same ${diatonic ? "number of scale steps (in `n`, add the same amount to every number)" : "number of half steps"}`,
    };
  }
  return {
    ok,
    value: copies.size,
    target: min,
    detail: ok
      ? `the riff comes back ${moveText(k0 as number)}`
      : sameOnly || zero
        ? "the riff comes back at the same pitch: `.transpose(0)` moves nothing. Move the copy up or down by a number of half steps"
        : `no bar comes back moved: a copy keeps the riff's ${same ? "rhythm and " : ""}shape, with every note moved by the same number of half steps`,
  };
};

// --- distinct-keys -------------------------------------------------------------------------------------

/**
 * `distinct-keys` (U03.L05 "visit a second key"): the pitched notes of `track` (default every learner line) are in at least `min`
 * (default 2) different keys, read from their own `.scale()` (else the key of each bar). `<C4:major!2
 * C4:major!2>` names one key twice. `differentNotes: true` asks for different notes too (C major and A minor
 * then count once).
 */
const distinctKeys: (deps: CorrectionDeps) => CorrectionRule = (deps) => (n, ctx, p) => {
  const min = num(p, "min", 2);
  // Corrections gate (AS-06): `track` (default every learner line); U03.L05 reads the tune, not a bass line.
  const ref = str(p, "track", "*");
  const notes = pitched(selectTrack(n, ref));
  if (notes.length === 0)
    return {
      ok: false,
      value: 0,
      target: min,
      detail: `no pitched notes${ref === "*" ? "" : ` in ${trackWord(ref)}`} yet`,
    };
  const byNotes = p.differentNotes === true;
  const seen = new Map<string, string>();
  const add = (k: KeySpec | null): void => {
    if (!k) return;
    const pcs = [...scalePcs(k)]
      .map(mod12)
      .sort((a, b) => a - b)
      .join(",");
    const id = byNotes ? pcs : `${mod12(scalePcs(k)[0] as number)}|${k.mode}`;
    if (!seen.has(id)) seen.set(id, `${k.tonic} ${k.mode}`);
  };
  const ctxKeys = notes.map((e) => e.scaleCtx).filter((s): s is string => typeof s === "string");
  if (ctxKeys.length > 0) for (const s of new Set(ctxKeys)) add(keyFromScaleCtx(s));
  else {
    const keys = deps.ruleKeys(n, ctx);
    for (const e of notes) add(keys[Math.max(0, Math.min(keys.length - 1, R.floor(e.onset)))] ?? null);
  }
  const names = [...seen.values()];
  const ok = names.length >= min;
  return {
    ok,
    value: names.length,
    target: min,
    detail: ok
      ? `${names.length} keys: ${names.join(", ")}`
      : `the tune stays in ${names[0] ?? "one key"}: every \`.scale()\` names the same key. Make one of them another key, such as \`G4:major\``,
  };
};

// --- orbits-differ -------------------------------------------------------------------------------------

/**
 * `orbits-differ` (A1.L04 "two rooms"): tracks `a` and `b` never share an orbit, so their reverb and delay are
 * apart. An event without `.orbit()` is on orbit 1. `.orbit(2)` on both, or on a third part, keeps them together.
 */
const orbitsDiffer: CorrectionRule = (n, _ctx, p) => {
  const a = str(p, "a", "");
  const b = str(p, "b", "");
  if (!a || !b) return { ok: false, detail: "the rule needs two tracks, `a` and `b`" };
  const orbitsOf = (ref: string): Set<string> =>
    new Set(selectTrack(n, ref).map((e) => String(e.controls?.orbit ?? 1)));
  const oa = orbitsOf(a);
  const ob = orbitsOf(b);
  if (oa.size === 0 || ob.size === 0)
    return { ok: false, detail: `nothing plays in ${trackWord(oa.size === 0 ? a : b)}` };
  const shared = [...oa].filter((o) => ob.has(o));
  return shared.length === 0
    ? {
        ok: true,
        detail: `${trackWord(a)} on orbit ${[...oa].join(", ")}, ${trackWord(b)} on ${[...ob].join(", ")}`,
      }
    : {
        ok: false,
        value: 0,
        target: 1,
        detail: `${trackWord(a)} and ${trackWord(b)} share orbit ${shared[0]}, so they share one reverb: give one of them an \`.orbit()\` the other does not use`,
      };
};

// --- call-response -------------------------------------------------------------------------------------

/**
 * `call-response` (U07.L07 "two parts that take turns"): tracks `a` and `b` each play, and they start notes together
 * in at most `maxOverlap` (default 0.25) of the beats where either of them starts one; each has at least
 * `minTurns` (default 1) beats of its own. `unit: "bar"` reads whole bars instead of beats. Copying the call onto a
 * second line doubles it: they play together everywhere.
 */
const callResponse: CorrectionRule = (n, ctx, p) => {
  const a = str(p, "a", "");
  const b = str(p, "b", "");
  if (!a || !b) return { ok: false, detail: "the rule needs two tracks, `a` and `b`" };
  const ea = selectTrack(n, a);
  const eb = selectTrack(n, b);
  if (ea.length === 0 || eb.length === 0)
    return {
      ok: false,
      value: 0,
      target: 1,
      detail: `nothing plays in ${trackWord(ea.length === 0 ? a : b)}`,
    };
  // Corrections gate (AS-18): a reply to a tune is a line of notes; hi-hats in the gaps take turns but answer nothing.
  for (const [ref, es] of [
    [a, ea],
    [b, eb],
  ] as const)
    if (pitched(es).length === 0)
      return {
        ok: false,
        value: 0,
        target: 1,
        detail: `${trackWord(ref)} plays no notes, only ${es[0]?.s ?? "drum hits"}: a call and its reply are both tunes. Give it notes on a pitched sound`,
      };
  const unit = str(p, "unit", "beat") === "bar" ? rat(1) : beatOf(ctx);
  const maxOverlap = num(p, "maxOverlap", 0.25);
  const minTurns = num(p, "minTurns", 1);
  const bars = Math.max(passBars(ea, ctx), passBars(eb, ctx));
  const slotsOf = (es: readonly NEvent[]): Set<number> =>
    new Set(
      onsets(es, { dedupe: true })
        .filter((o) => R.floor(o) < bars)
        .map((o) => R.floor(R.div(o, unit))),
    );
  const sa = slotsOf(ea);
  const sb = slotsOf(eb);
  const both = [...sa].filter((x) => sb.has(x));
  const either = new Set([...sa, ...sb]).size;
  const aloneA = sa.size - both.length;
  const aloneB = sb.size - both.length;
  const overlap = either === 0 ? 1 : both.length / either;
  const ok = overlap <= maxOverlap + 1e-9 && aloneA >= minTurns && aloneB >= minTurns;
  const word = str(p, "unit", "beat") === "bar" ? "bar" : "beat";
  const firstBoth = both.length ? Math.min(...both) : null;
  return {
    ok,
    value: ok ? 1 : Math.max(0, 1 - overlap),
    target: 1,
    detail: ok
      ? `${trackWord(a)} and ${trackWord(b)} take turns: together in ${both.length} of ${plural(either, word)}`
      : aloneB < minTurns && aloneA >= minTurns
        ? `${trackWord(b)} never plays in ${trackWord(a)}'s gaps: put the reply where the call rests`
        : `${trackWord(a)} and ${trackWord(b)} play together in ${both.length} of the ${plural(either, word)} where either plays${firstBoth !== null ? ` (${where(R.mul(unit, [firstBoth, 1]), ctx)} first)` : ""}: a reply waits for the call to stop, then answers in its gap`,
  };
};

// --- stack-intervals -----------------------------------------------------------------------------------

/**
 * `stack-intervals` (U04.CP "a second note a 3rd above"): every group of notes `track` (default every pitched learner
 * track) starts together has its notes this many half steps apart (`semitones`, required: `[3, 4]` for a third).
 * By default the intervals are read between neighbours from the lowest note up; `above: true` reads them from the
 * note written first in each `[a,b]` to the others, which must lie above it ("a 3rd above the tune": `[0,-5]` is a
 * sixth below). `minRatio` (default 1) of the groups must fit; single notes are not groups.
 */
const stackIntervals: CorrectionRule = (n, ctx, p) => {
  const ref = str(p, "track", "*");
  const want = nums(p, "semitones");
  if (!want || want.length === 0) return { ok: false, detail: "the rule needs `semitones`" };
  const above = p.above === true;
  const minRatio = num(p, "minRatio", 1);
  const events = selectTrack(n, ref);
  const bars = passBars(events, ctx);
  const groups = voicedChords(events.filter((e) => R.floor(e.onset) < bars)).filter(
    (c) => c.voices.length > 1,
  );
  if (groups.length === 0)
    return {
      ok: false,
      value: 0,
      target: minRatio,
      detail: `no two notes start together in ${trackWord(ref)}`,
    };
  const key = ctx.key ?? null;
  const name = (m: number): string => noteName(m, key);
  let good = 0;
  let firstBad: { at: Rat; text: string } | null = null;
  for (const g of groups) {
    const gaps = above
      ? g.voices.slice(1).map((m) => m - (g.voices[0] as number))
      : [...g.voices]
          .sort((x, y) => x - y)
          .slice(1)
          .map((m, i) => m - ([...g.voices].sort((x, y) => x - y)[i] as number));
    if (gaps.every((d) => want.includes(d))) good++;
    else {
      const bad = gaps.find((d) => !want.includes(d)) as number;
      const lo = above ? (g.voices[0] as number) : Math.min(...g.voices);
      firstBad ??= {
        at: g.at,
        text:
          above && bad < 0
            ? `${name(lo + bad)} is ${-bad} half steps below ${name(lo)}, not above it`
            : `${name(lo)} to ${name(lo + bad)} is ${bad} half steps`,
      };
    }
  }
  const ratio = good / groups.length;
  const ok = ratio >= minRatio - 1e-9;
  return {
    ok,
    value: ratio,
    target: minRatio,
    detail: ok
      ? `${good} of ${groups.length} stacks are ${want.join(" or ")} half steps apart`
      : `${good} of ${groups.length} stacks are ${want.join(" or ")} half steps apart${firstBad ? ` (${where(firstBad.at, ctx)}: ${firstBad.text})` : ""}`,
    ...(firstBad ? { where: locAt(firstBad.at, ctx) } : {}),
  };
};

// --- chords-per-bar ------------------------------------------------------------------------------------

const coreOf = (c: ChordId): string => {
  const t = triadCore(c);
  return `${t.rootPc}|${t.quality}`;
};

/**
 * `chords-per-bar` (U06.L08 "one chord in some bars, two in others"): one pass of the harmony is read bar by bar;
 * a bar's chords are the ones sounding in it, in order, with a repeated neighbour counted once (a chord that starts
 * in the bar before and is still sounding counts for this bar too; a bar's last chord never merges with the next
 * bar's first). params: `one` (at least this many bars with a single chord), `two` (at least this many bars with two
 * or more), `max` (no bar has more), `harmony` (the chord track; default the piece's chords).
 */
const chordsPerBar: (deps: CorrectionDeps) => CorrectionRule = (deps) => (n, ctx, p) => {
  const harmony = typeof p.harmony === "string" ? p.harmony : undefined;
  const slots = deps.pieceSlots(n, harmony).filter((s) => s.chord);
  if (slots.length === 0) return { ok: false, value: 0, target: 1, detail: "no chords found" };
  const chordEvents = harmony ? selectTrack(n, harmony) : n.all;
  const bars = passBars(chordEvents, ctx);
  const counts: number[] = [];
  for (let b = 0; b < bars; b++) {
    const inBar = slots.filter((s) => R.lt(s.span[0], rat(b + 1)) && R.lt(rat(b), s.span[1]));
    let k = 0;
    let last: string | null = null;
    for (const s of inBar) {
      const c = coreOf(s.chord as ChordId);
      if (c !== last) k++;
      last = c;
    }
    counts.push(k);
  }
  const ones = counts.filter((c) => c === 1).length;
  const twos = counts.filter((c) => c >= 2).length;
  const most = Math.max(0, ...counts);
  const wantOne = num(p, "one", 0);
  const wantTwo = num(p, "two", 0);
  const max = num(p, "max", Number.POSITIVE_INFINITY);
  const problems: string[] = [];
  if (ones < wantOne) problems.push(`at least ${plural(wantOne, "bar")} with one chord`);
  if (twos < wantTwo) problems.push(`at least ${plural(wantTwo, "bar")} with two chords`);
  if (most > max)
    problems.push(`no bar with more than ${max} chords (bar ${counts.indexOf(most) + 1} has ${most})`);
  const summary = `over ${plural(bars, "bar")}: ${ones} with one chord, ${twos} with two or more`;
  return {
    ok: problems.length === 0,
    value: problems.length === 0 ? 1 : 0,
    target: 1,
    detail: problems.length === 0 ? summary : `${summary}; the brief asks for ${problems.join(" and ")}`,
  };
};

// --- last-chord ----------------------------------------------------------------------------------------

const coreSame = (a: ChordId | null | undefined, b: ChordId | null | undefined): boolean =>
  !!a && !!b && coreOf(a) === coreOf(b);

/**
 * `last-chord` (U16.L04 "make the last chord A major", a Picardy ending): the last chord that sounds in the piece is
 * one of `rn` (numerals read in the key in force there: `["I"]` in A minor is A major), compared on the triad core.
 * `[A Am]` ends on A minor, `[A E]` on E: neither is the major home chord, though bar 8 contains it. params: `rn`
 * (required), `harmony` (the chord track; default the piece's chords).
 */
const lastChord: (deps: CorrectionDeps) => CorrectionRule = (deps) => (n, ctx, p) => {
  const want = strs(p, "rn");
  if (!want || want.length === 0) return { ok: false, detail: "the rule needs `rn`" };
  const harmony = typeof p.harmony === "string" ? p.harmony : undefined;
  const end = deps.pieceBars(n, ctx);
  const slots = deps.pieceSlots(n, harmony).filter((s) => s.chord && R.lt(s.span[0], rat(end)));
  const final = slots[slots.length - 1];
  if (!final?.chord) return { ok: false, value: 0, target: 1, detail: "no chords found" };
  // Corrections gate (AS-27): the chord the last bar rests on, not a 16th tucked in at its end: the last chord in
  // that bar that lasts a beat or more (else the longest one).
  const lastBar = R.floor(final.span[0]);
  const inBar = slots.filter((s) => R.floor(s.span[0]) === lastBar);
  const len = (s: ChordSlot): number => R.toNum(R.sub(s.span[1], s.span[0]));
  const beat = R.toNum(beatOf(ctx));
  const long = inBar.filter((s) => len(s) >= beat - 1e-9);
  const last = long[long.length - 1] ?? [...inBar].sort((x, y) => len(y) - len(x))[0] ?? (final as ChordSlot);
  if (!last.chord) return { ok: false, value: 0, target: 1, detail: "no chords found" };
  const keys = deps.ruleKeys(n, ctx);
  const bar = R.floor(last.span[0]);
  const key = keys[Math.min(bar, keys.length - 1)] ?? ctx.key ?? null;
  if (!key) return { ok: false, detail: "no key to read the numerals in" };
  const chords = chordsOfRomans(want, key);
  // A dominant seventh on the home root leans on to the next key (A7 → D): it is no resting home chord unless the
  // numeral asks for a 7th (AS-27).
  const dominant = ["7", "9", "13", "7b9", "7#9", "7#11", "7b13"].includes(last.chord.quality);
  const ok =
    chords.some((c) => coreSame(c, last.chord)) && !(dominant && !want.some((w) => /7|9|13/.test(w)));
  const name = toLeadSheet({ ...last.chord, bassPc: last.chord.rootPc });
  const asked = want
    .map((rn, i) => {
      const c = chords[i];
      return c ? `${rn.replace(/^b/, "♭")} (${toLeadSheet({ ...c, ext: [], bassPc: c.rootPc })})` : rn;
    })
    .join(" or ");
  return ok
    ? { ok: true, detail: `the piece ends on ${name}` }
    : {
        ok: false,
        value: 0,
        target: 1,
        detail:
          dominant && chords.some((c) => coreSame(c, last.chord))
            ? `the last chord is ${name}, a dominant seventh: it leans on to the chord a 5th below and does not rest. The brief asks the piece to end on ${asked}, with no 7th`
            : `the last chord ${last === final ? "that sounds" : "the last bar rests on"} is ${name}, in bar ${bar + 1}; the brief asks the piece to end on ${asked}`,
        where: locAt(last.span[0], ctx),
      };
};

// --- song-kept -----------------------------------------------------------------------------------------

/**
 * `song-kept` (CF-T.S4 "the arrangement keeps the song"): the song's changes, bar by bar, are in the arrangement.
 * The song's chords come from `ctx.songForm` (`songFormOf`: each section's lead-sheet symbols per bar). The
 * arrangement is laid against the song at every whole-bar offset (an intro is free) and the best one counts; a bar
 * matches when one of its chords has the triad core of one of the song bar's chords (E7 or E for E7). params:
 * `minRatio` (default 0.75), `harmony` (the chord track; default the piece's chords). Without a song chart the rule
 * cannot read: it fails and says so.
 */
const songKept: (deps: CorrectionDeps) => CorrectionRule = (deps) => (n, ctx, p) => {
  const minRatio = num(p, "minRatio", 0.75);
  const song = (ctx.songForm ?? []).flatMap((s) => (s.chords ? [...s.chords] : []));
  if (song.length === 0 || song.every((b) => b.length === 0))
    return { ok: false, detail: "the song's chart is not available to compare with" };
  const songCores = song.map((b) =>
    b.map((sym) => parseChordSymbol(sym)).filter((c): c is ChordId => c !== null),
  );
  const harmony = typeof p.harmony === "string" ? p.harmony : undefined;
  const slots = deps.pieceSlots(n, harmony).filter((s) => s.chord);
  const total = Math.max(1, deps.pieceBars(n, ctx));
  const barChords = Array.from({ length: total }, (_, b) =>
    slots
      .filter((s) => R.lt(s.span[0], rat(b + 1)) && R.lt(rat(b), s.span[1]))
      .map((s) => s.chord as ChordId),
  );
  const counted = songCores.filter((b) => b.length > 0).length;
  let best = { offset: 0, hits: -1, miss: -1 };
  for (let o = 0; o <= Math.max(0, total - song.length); o++) {
    let hits = 0;
    let miss = -1;
    songCores.forEach((want, i) => {
      if (want.length === 0) return;
      const got = barChords[o + i] ?? [];
      if (got.some((g) => want.some((w) => coreSame(g, w)))) hits++;
      else if (miss < 0) miss = i;
    });
    if (hits > best.hits) best = { offset: o, hits, miss };
  }
  const ratio = counted === 0 ? 0 : best.hits / counted;
  // Corrections gate (AS-30): every section of the song keeps its changes too (default half its bars), so a whole
  // bridge replaced by one chord cannot hide under a 75% total.
  const sectionMin = num(p, "sectionRatio", 0.5);
  let weak: { label: string; from: number; bars: number; hits: number; counted: number } | null = null;
  let at = 0;
  for (const sec of ctx.songForm ?? []) {
    const n0 = sec.chords?.length ?? 0;
    let hits = 0;
    let c = 0;
    for (let i = at; i < at + n0; i++) {
      const want = songCores[i] ?? [];
      if (want.length === 0) continue;
      c++;
      const got = barChords[best.offset + i] ?? [];
      if (got.some((g) => want.some((w) => coreSame(g, w)))) hits++;
    }
    if (c > 0 && hits / c < sectionMin - 1e-9 && !weak)
      weak = { label: sec.label, from: at, bars: n0, hits, counted: c };
    at += n0;
  }
  const ok = ratio >= minRatio - 1e-9 && !weak;
  const missText = (): string => {
    const i = best.miss;
    if (i < 0) return "";
    const got = barChords[best.offset + i] ?? [];
    const gotText = got.length
      ? [...new Set(got.map((c) => toLeadSheet({ ...c, bassPc: c.rootPc })))].join(" ")
      : "no chord";
    return ` (bar ${i + 1} of the song is ${(song[i] ?? []).join(" ")}; your bar ${best.offset + i + 1} plays ${gotText})`;
  };
  return {
    ok,
    value: ratio,
    target: minRatio,
    detail: ok
      ? `${best.hits} of the song's ${counted} bars keep its chords${best.offset ? `, after a ${plural(best.offset, "bar")} intro` : ""}`
      : ratio >= minRatio - 1e-9 && weak
        ? `${best.hits} of the song's ${counted} bars keep its chords, but its ${weak.label} section (song bars ${weak.from + 1}–${weak.from + weak.bars}) keeps only ${weak.hits} of ${weak.counted}: an arrangement keeps every section's changes (bar ${weak.from + 1} of the song is ${(song[weak.from] ?? []).join(" ")})`
        : `${best.hits} of the song's ${counted} bars keep its chords; at least ${Math.round(minRatio * 100)}%${missText()}. An arrangement keeps the song's changes`,
  };
};

// --- tuplets-every-bar ---------------------------------------------------------------------------------

/**
 * `tuplets-every-bar` (U13.L05 "set the piano or the hats in triplets and keep them going through every bar"): one
 * line (`track`, default: any one learner line) starts a note on every one of the `division` (default 3) equal
 * places of at least `min` beats (default every beat) in every bar of one pass of its loop. Two hits near the start
 * of each bar are not a triplet line.
 */
const tupletsEveryBar: CorrectionRule = (n, ctx, p) => {
  const division = Math.max(2, Math.round(num(p, "division", 3)));
  const units = METERS[ctx.meter].unitsPerBar;
  const min = Math.min(units, num(p, "min", units));
  // `track`: one line, or (corrections gate, AS-25) a list of lines any one of which may carry the triplets.
  const refs = typeof p.track === "string" ? [p.track] : (strs(p, "track") ?? null);
  const ref = refs ? refs.join(" or ") : null;
  // `drums`: also any line played on these drum roles (a ride line in triplets is the hats' job done on a cymbal).
  const drums = strs(p, "drums");
  const byDrum = drums
    ? Object.entries(n.byTrack)
        .filter(([t, es]) => !t.startsWith("band.") && !refs?.includes(t) && es.length > 0)
        .filter(([, es]) => es.every((e) => e.drum !== undefined && drums.includes(e.drum)))
        .map(([t, es]) => ({ name: t, events: es }))
    : [];
  const candidates = refs
    ? [...refs.map((x) => ({ name: x.replace(/^@/, ""), events: selectTrack(n, x) })), ...byDrum]
    : Object.entries(n.byTrack)
        .filter(([t, es]) => !t.startsWith("band.") && es.length > 0)
        .map(([t, es]) => ({ name: t, events: es }));
  if (candidates.every((c) => c.events.length === 0))
    return { ok: false, value: 0, target: 1, detail: `nothing plays${ref ? ` in ${trackWord(ref)}` : ""}` };
  let best: { name: string; fullBars: number; bars: number; firstShort: number; count: number } | null = null;
  for (const c of candidates) {
    const bars = passBars(c.events, ctx);
    const on = new Set(onsets(c.events, { dedupe: true }).map(ratKey));
    let fullBars = 0;
    let firstShort = -1;
    let count = Number.POSITIVE_INFINITY;
    for (let b = 0; b < bars; b++) {
      let groups = 0;
      for (let u = 0; u < units; u++) {
        const all = Array.from({ length: division }, (_, k) =>
          ratKey(R.add(rat(b), rat(u * division + k, units * division))),
        ).every((x) => on.has(x));
        if (all) groups++;
      }
      count = Math.min(count, groups);
      if (groups >= min) fullBars++;
      else if (firstShort < 0) firstShort = b;
    }
    const cand = { name: c.name, fullBars, bars, firstShort, count: Number.isFinite(count) ? count : 0 };
    if (!best || cand.fullBars / cand.bars > best.fullBars / best.bars) best = cand;
  }
  const b = best as NonNullable<typeof best>;
  const ok = b.fullBars === b.bars;
  const word = division === 3 ? "triplet" : `${division}-note group`;
  return {
    ok,
    value: b.fullBars / Math.max(1, b.bars),
    target: 1,
    detail: ok
      ? `\`${b.name}\` plays ${word}s through every bar`
      : `no line keeps ${word}s going through every bar: in \`${b.name}\`, bar ${b.firstShort + 1} has ${b.count} beat${b.count === 1 ? "" : "s"} of ${division} even notes; ${min === units ? "every beat" : `at least ${min} beats`} of every bar needs ${division}, as \`.ply(${division})\` on a line of quarter notes gives`,
  };
};

// --- swung-offbeats ------------------------------------------------------------------------------------

/**
 * `swung-offbeats` (U13.L06 "the kick and the hats both need swinging"): every note `track` starts between two
 * beats sits late in its beat, long–short, at a ratio in `ratio` (default [1.6, 2.4]: 2:1 is the triplet shuffle);
 * at least `min` (default 1) such notes. Unlike `swing` it needs no steady 8ths, so a sparse kick is read: its
 * "and" of 2 at 3/8 of the bar (1:1) is straight, at 5/12 (2:1) it shuffles.
 */
const swungOffbeats: CorrectionRule = (n, ctx, p) => {
  const ref = str(p, "track", "*");
  const events = selectTrack(n, ref);
  if (events.length === 0)
    return { ok: false, value: 0, target: 1, detail: `nothing plays in ${trackWord(ref)}` };
  const [lo, hi] = ((): [number, number] => {
    const r = nums(p, "ratio");
    return r && r.length === 2 ? [r[0] as number, r[1] as number] : [1.6, 2.4];
  })();
  const min = num(p, "min", 1);
  const units = METERS[ctx.meter].unitsPerBar;
  const bars = passBars(events, ctx);
  const offs = onsets(events, { dedupe: true })
    .filter((o) => R.floor(o) < bars)
    .map((o) => {
      const pos = R.mul(o, [units, 1]);
      const f = R.toNum(R.frac(pos));
      return { at: o, ratio: f === 0 ? null : f / (1 - f) };
    })
    .filter((x): x is { at: Rat; ratio: number } => x.ratio !== null);
  const bad = offs.find((x) => x.ratio < lo - 1e-6 || x.ratio > hi + 1e-6);
  const ok = !bad && offs.length >= min;
  const ratioText = (x: number): string => `${Number(x.toFixed(2))}:1`;
  return {
    ok,
    value: ok ? 1 : 0,
    target: 1,
    detail: ok
      ? `${plural(offs.length, "note")} between the beats in ${trackWord(ref)}, all long–short`
      : bad
        ? `${placeText(bad.at, ctx)} in ${trackWord(ref)} divides its beat ${ratioText(bad.ratio)}${bad.ratio < lo ? ", straight" : ""}; a shuffle plays it later, ${ratioText(lo)} to ${ratioText(hi)}`
        : `${trackWord(ref)} has no note between the beats to swing`,
    ...(bad ? { where: locAt(bad.at, ctx) } : {}),
  };
};

// --- voiced-with ---------------------------------------------------------------------------------------

/**
 * `voiced-with` (U12.L06 "the chords are voiced for the left hand"): the chords of `track` (default `@chords`) are
 * voiced by `voicing()` reading `dict` (`.dict("lefthand")` written before `.voicing()`), at least `minRatio`
 * (default 1) of their notes. A `.dict()` after `.voicing()`, or on another line, voices nothing.
 */
const voicedWith: CorrectionRule = (n, _ctx, p) => {
  const ref = str(p, "track", "@chords");
  const dict = str(p, "dict", "");
  if (!dict) return { ok: false, detail: "the rule needs `dict`" };
  const minRatio = num(p, "minRatio", 1);
  // A line that voices chord names: notes from a chord symbol, two or more at once (a bass on `rootNotes` is one).
  const voicedIn = (es: readonly NEvent[]): NEvent[] => {
    const v = es.filter((e) => e.chordSymbol !== undefined && e.midi !== null);
    const at = new Map<string, number>();
    for (const e of v) at.set(ratKey(e.onset), (at.get(ratKey(e.onset)) ?? 0) + 1);
    return [...at.values()].some((k) => k >= 2) ? v : [];
  };
  let voiced = selectTrack(n, ref).filter((e) => e.chordSymbol !== undefined && e.midi !== null);
  // Corrections gate (now-fails A.1): the brief lets the chords be comped on the jazz guitar too, under a line the
  // learner may label `gtr:`. With nothing voiced in `track`, the learner line that voices chord names is read.
  if (voiced.length === 0) {
    const lines = Object.entries(n.byTrack)
      .filter(([t]) => !t.startsWith("band."))
      .map(([, es]) => voicedIn(es))
      .filter((es) => es.length > 0)
      .sort(
        (a, b) =>
          b.filter((e) => e.voicedWith === dict).length / b.length -
          a.filter((e) => e.voicedWith === dict).length / a.length,
      );
    voiced = lines[0] ?? [];
  }
  if (voiced.length === 0)
    return {
      ok: false,
      value: 0,
      target: minRatio,
      detail: `no chord in ${trackWord(ref)} is voiced from a chord name with the \`${dict}\` dictionary yet`,
    };
  const good = voiced.filter((e) => e.voicedWith === dict).length;
  const ratio = good / voiced.length;
  const ok = ratio >= minRatio - 1e-9;
  const other = voiced.find((e) => e.voicedWith !== dict)?.voicedWith;
  const shown = voiced[0]?.track ?? ref;
  return {
    ok,
    value: ratio,
    target: minRatio,
    detail: ok
      ? `${trackWord(shown)} is voiced with \`${dict}\``
      : `${trackWord(shown)} is voiced with ${other ? `\`${other}\`` : "the default dictionary"}, not \`${dict}\`: \`.dict("${dict}")\` goes before \`.voicing()\` on that line, since a dictionary written after it changes nothing`,
  };
};

// --- broken-chord --------------------------------------------------------------------------------------

/**
 * `broken-chord` (corrections gate, AS-41; U05.L04 "break the chords with `.arp()`"): in at least `minRatio`
 * (default .5) of the bars of one pass, `track` (default `chords`) plays two or more different notes at two or more
 * different times, and never three or more notes at once. `.arp("0")` plays one note a chord and `.arp("[0,1,2]")`
 * stacks the block again: neither breaks the chord.
 */
const brokenChord: CorrectionRule = (n, ctx, p) => {
  const ref = str(p, "track", "chords");
  const events = pitched(selectTrack(n, ref));
  if (events.length === 0) return { ok: false, value: 0, target: 1, detail: `no notes in ${trackWord(ref)}` };
  const minRatio = num(p, "minRatio", 0.5);
  const bars = passBars(events, ctx);
  let broken = 0;
  let block: number | null = null;
  let single: number | null = null;
  for (let b = 0; b < bars; b++) {
    const here = events.filter((e) => R.floor(e.onset) === b);
    if (here.length === 0) continue;
    const at = new Map<string, Set<number>>();
    for (const e of here)
      at.set(ratKey(e.onset), (at.get(ratKey(e.onset)) ?? new Set()).add(e.midi as number));
    const stacked = [...at.values()].some((m) => m.size >= 3);
    const pitches = new Set(here.map((e) => e.midi));
    if (stacked) block ??= b;
    else if (at.size < 2 || pitches.size < 2) single ??= b;
    else broken++;
  }
  const ratio = bars === 0 ? 0 : broken / bars;
  const ok = ratio >= minRatio - 1e-9;
  return {
    ok,
    value: ratio,
    target: minRatio,
    detail: ok
      ? `${trackWord(ref)} plays its chords one note at a time in ${broken} of ${plural(bars, "bar")}`
      : block !== null
        ? `in bar ${block + 1} ${trackWord(ref)} still plays three notes at once: the chord is a block again. Give \`.arp()\` one position at a time, such as \`.arp("0 1 2 1")\``
        : single !== null
          ? `in bar ${single + 1} ${trackWord(ref)} plays one note of each chord over and over: name two or more positions in \`.arp()\`, such as \`.arp("0 1 2 1")\``
          : `${trackWord(ref)} does not break its chords: play their notes one after another with \`.arp("0 1 2 1")\``,
  };
};

// --- black-keys ----------------------------------------------------------------------------------------

/**
 * `black-keys` (corrections gate, AS-38; U02.L03 "one black key"): at least `min` (default 1) notes of `track`
 * (default every learner line) land on a black key (C♯/D♭, D♯/E♭, F♯/G♭, G♯/A♭, A♯/B♭). `e#4` is spelt with a sharp
 * but sounds F, a white key.
 */
const BLACK_PCS: readonly number[] = [1, 3, 6, 8, 10];
const blackKeys: CorrectionRule = (n, _ctx, p) => {
  const ref = str(p, "track", "*");
  const notes = pitched(selectTrack(n, ref));
  if (notes.length === 0) return { ok: false, value: 0, target: 1, detail: "no notes yet" };
  const min = num(p, "min", 1);
  const black = notes.filter((e) => BLACK_PCS.includes(mod12(Math.round(e.midi as number))));
  const ok = black.length >= min;
  const spelt = notes.find((e) => /^[a-gA-G](#|b|♯|♭)/.test(String(e.written ?? "")));
  return {
    ok,
    value: black.length,
    target: min,
    detail: ok
      ? `${plural(black.length, "note")} on a black key`
      : spelt
        ? `\`${spelt.written}\` is written with a sharp or a flat, but it sounds ${noteName(spelt.midi as number, null)}, a white key. Choose one that lands on a black key, such as \`f#4\` or \`bb4\``
        : "every note is on a white key: add a sharp or a flat that lands on a black key, such as `f#4` or `bb4`",
  };
};

// --- chance-varies -------------------------------------------------------------------------------------

/**
 * `chance-varies` (corrections gate, AS-44; U07.L10 "let chance change a repeat"): over the bars graded, `track`
 * (default every learner line) never settles into a repeating loop: chance changed at least one pass. A chance tool
 * that changes nothing (`.degradeBy(0)`, `.sometimesBy(.25, x => x)`, a `?` on a rest) leaves the written loop
 * repeating exactly. params: `bars` (the written loop, default 4).
 */
const chanceVaries: CorrectionRule = (n, ctx, p) => {
  const ref = str(p, "track", "*");
  const events = selectTrack(n, ref);
  if (events.length === 0) return { ok: false, value: 0, target: 1, detail: "nothing plays yet" };
  const loop = Math.max(1, Math.round(num(p, "bars", 4)));
  const window = windowOf(events, ctx);
  const sig = (b: number): string =>
    events
      .filter((e) => R.floor(e.onset) === b)
      .map((e) => `${ratKey(R.sub(e.onset, rat(b)))}:${e.midi ?? e.s}`)
      .sort()
      .join(",");
  let changed: number | null = null;
  // Compared from the second pass on when the window allows: Strudel's random stream is 0 at time 0, so the very
  // first note of a piece can drop even under `.degradeBy(0)`; a real chance changes later passes too.
  const from = window >= 3 * loop ? 2 * loop : loop;
  for (let b = from; b < window && changed === null; b++) if (sig(b) !== sig(b - loop)) changed = b;
  const ok = changed !== null;
  return {
    ok,
    value: ok ? 1 : 0,
    target: 1,
    detail: ok
      ? `chance changes bar ${(changed as number) + 1} from bar ${(changed as number) - loop + 1}`
      : window <= loop
        ? "the loop is not played twice yet, so no repeat can change"
        : `every repeat of the ${plural(loop, "bar")} loop is the same: the chance you added changes nothing. Give it an amount above 0, such as \`.degradeBy(.2)\`, on notes that play`,
  };
};

// --- echo ------------------------------------------------------------------------------------------------

/**
 * `echo` (corrections gate, AS-43; U07.L07 "the call echoes itself with `.off()`"): `track` (default every learner
 * line) plays its notes again later, by one delay that is not a whole number of loops, each moved by the same
 * number of scale steps (or half steps): most of the call's notes have their echo. `.off(0, …)` sounds with the
 * call, `.off(4, …)` in a four-bar loop lands on the next pass of the call itself, and an echo at `.gain(0)` is not
 * heard: none of them is an echo.
 */
const echo: (deps: CorrectionDeps) => CorrectionRule = (deps) => (n, ctx, p) => {
  const ref = str(p, "track", "*");
  const all = pitched(selectTrack(n, ref));
  if (all.length === 0) return { ok: false, value: 0, target: 1, detail: "no notes yet" };
  const window = windowOf(all, ctx);
  const pass = passBars(all, ctx);
  const notes = [
    ...new Map(
      all.filter((e) => R.floor(e.onset) < window).map((e) => [`${ratKey(e.onset)}|${e.midi}`, e]),
    ).values(),
  ];
  const keys = deps.ruleKeys(n, ctx);
  const keyAt = (e: NEvent): KeySpec | null =>
    (e.scaleCtx ? keyFromScaleCtx(e.scaleCtx) : null) ??
    keys[Math.min(R.floor(e.onset), keys.length - 1)] ??
    ctx.key ??
    null;
  const at = new Map<string, NEvent[]>();
  for (const e of notes) at.set(ratKey(e.onset), [...(at.get(ratKey(e.onset)) ?? []), e]);
  const tally = new Map<string, number>();
  for (const a of notes)
    for (const b of notes) {
      const d = R.sub(b.onset, a.onset);
      if (!R.lt(rat(0), d) || !R.lt(d, rat(Math.max(1, pass)))) continue;
      const semis = (b.midi as number) - (a.midi as number);
      const sa = stepIndex(a.midi as number, keyAt(a));
      const sb = stepIndex(b.midi as number, keyAt(b));
      const tag = ratKey(d);
      tally.set(`${tag}|h${semis}`, (tally.get(`${tag}|h${semis}`) ?? 0) + 1);
      if (sa !== null && sb !== null)
        tally.set(`${tag}|s${sb - sa}`, (tally.get(`${tag}|s${sb - sa}`) ?? 0) + 1);
    }
  const best = [...tally.entries()].sort((x, y) => y[1] - x[1])[0];
  const pairs = best?.[1] ?? 0;
  const originals = Math.max(1, notes.length - pairs);
  const ok = pairs >= 2 && pairs >= 0.75 * originals - 1e-9;
  return {
    ok,
    value: ok ? 1 : pairs / originals,
    target: 1,
    detail: ok
      ? `${plural(pairs, "note")} of the call come back later as its echo`
      : "no echo is heard: the copy `.off()` makes must sound later than the call, and be heard. A delay of 0, or of a whole loop, puts it on top of the call; try `.off(1/4, x => x.scaleTranspose(2))`",
  };
};

// --- control-set ---------------------------------------------------------------------------------------

/**
 * `control-set` (U02.L08 "put the tune in a room with `.room()`"; the A1 Makes): at least one sound of `track`
 * (default every learner track) has the sound control `control` (Strudel's value key, as `NEvent.controls` keeps it:
 * `room`, `lpenv`, `attack`, `delaytime`, …) set to a number that changes the sound: above `above` (default 0), or,
 * with `not`, any number other than `not` (the control's neutral value). `.room(0)` is a dry sound. params: `call`
 * (the method name the learner writes, default `control`), `example` (a value to suggest; none by default, so the
 * detail names no answer below rung 4 unless the content chooses to), `share`
 * (corrections gate: at least this share of the line's notes must have it, so `"<0 0 0 .4>"` is three bars dry;
 * default any one note).
 */
/**
 * Wave 7 Build (A1.L01–L07, AC1; the A1 spec's grader request 2): a control set to a value that is heard is not
 * enough when another control silences it. superdough builds the vibrato only with depth (`vibmod`), the phaser and
 * the tremolo only with depth, the filter LFO (`lprate`, `lpdepth`) only on a filtered sound, the delay's time and
 * feedback only with a delay level, the reverb's size only with a reverb level, FM only on a synth (a sample has no
 * oscillator to modulate). `partials` sounds when it holds two or more harmonics (one is a sine).
 */
const SYNTHS = new Set(["sine", "sawtooth", "saw", "square", "triangle", "supersaw", "pulse", "sbd"]);
function silencedBy(control: string, e: NEvent): string | null {
  const c = e.controls ?? {};
  const v = (k: string): number | null => (typeof c[k] === "number" ? (c[k] as number) : null);
  const zero = (k: string) => v(k) !== null && Math.abs(v(k) as number) < 1e-9;
  if (control === "vib" && zero("vibmod")) return "the vibrato has no depth";
  if (control === "phaserrate" && zero("phaserdepth")) return "the phaser has no depth";
  if (control === "tremolosync" && zero("tremolodepth")) return "the tremolo has no depth";
  if ((control === "lprate" || control === "lpdepth") && v("cutoff") === null)
    return "there is no filter for it to move";
  // superdough builds the lowpass, and with it the filter envelope, only when a cutoff is set (superdough@1.3.0
  // superdough.mjs `if (fx.cutoff !== undefined)`): `.lpenv(4)` on an unfiltered sound changes nothing
  // (review:robustness).
  if (control === "lpenv" && v("cutoff") === null) return "there is no filter for the envelope to open";
  if (control === "lprate" && zero("lpdepth")) return "the filter's movement has no depth";
  if (
    (control === "delaytime" || control === "delayfeedback") &&
    !(v("delay") !== null && (v("delay") as number) > 0)
  )
    return "the delay itself is off";
  if (control === "roomsize" && !(v("room") !== null && (v("room") as number) > 0))
    return "the reverb itself is off";
  if (control === "fmi" && e.s !== undefined && !SYNTHS.has(e.s))
    return "a sample has no oscillator to modulate";
  return null;
}
/** The number a control holds on an event (`partials` as its count of harmonics), or null. */
function controlNumber(control: string, e: NEvent): number | null {
  const raw = e.controls?.[control];
  if (raw === undefined) return null;
  if (control === "partials") {
    // The harmonics superdough builds (synth.mjs `getOscillator`/`waveformN`, @1.3.0): none on a sine (the stock
    // oscillator) or a sample; on a square or a triangle only the odd harmonics have a level; on a sawtooth or
    // `user` wave every one (build-author-A1a: `.s("sine").partials([1,1,1,1])` is a plain sine).
    const alias: Record<string, string> = { tri: "triangle", sqr: "square", saw: "sawtooth", sin: "sine" };
    const wave = alias[e.s ?? ""] ?? e.s ?? "triangle";
    if (!["triangle", "square", "sawtooth", "user"].includes(wave)) return 0;
    const oddOnly = wave === "square" || wave === "triangle";
    const parts = String(raw)
      .split(",")
      .map(Number)
      .filter((x, i) => Number.isFinite(x) && Math.abs(x) > 1e-9 && (!oddOnly || i % 2 === 0));
    return parts.length;
  }
  const x = typeof raw === "number" ? raw : Number(String(raw).split(",")[0]);
  return Number.isFinite(x) ? x : null;
}
interface ControlWant {
  control: string;
  above?: number;
  below?: number;
  not?: number;
}
const CONTROL_WORDS: Record<string, string> = {
  lpenv: "the filter envelope",
  distort: "the distortion",
  crush: "the bit crusher",
  coarse: "the sample-rate reducer",
  vib: "the vibrato",
  phaserrate: "the phaser",
  tremolosync: "the tremolo",
  lprate: "the filter's movement",
  fmi: "the FM",
  roomsize: "the reverb's size",
  room: "the reverb",
  delaytime: "the delay",
  partials: "the harmonics",
  attack: "the attack",
  release: "the release",
  decay: "the decay",
  sustain: "the sustain",
};
/** `control-set` with `anyOf` (Wave 7 Build): any one of the controls set to a value that is heard. */
const controlSetAnyOf = (
  events: readonly NEvent[],
  wants: readonly ControlWant[],
  ref: string,
): CorrectionEval => {
  let firstMuted: string | null = null;
  for (const w of wants) {
    const heard = events.filter((e) => {
      const x = controlNumber(w.control, e);
      if (x === null) return false;
      const changes =
        w.not !== undefined
          ? Math.abs(x - w.not) > 1e-9
          : (w.above === undefined || x > w.above + 1e-9) && (w.below === undefined || x < w.below - 1e-9);
      if (!changes) return false;
      const why = silencedBy(w.control, e);
      if (why) firstMuted ??= `${CONTROL_WORDS[w.control] ?? w.control} is set, but ${why}`;
      return !why;
    });
    if (heard.length > 0)
      return {
        ok: true,
        value: 1,
        target: 1,
        detail: `${CONTROL_WORDS[w.control] ?? w.control} shapes the sound`,
      };
  }
  return {
    ok: false,
    value: 0,
    target: 1,
    detail: firstMuted
      ? `${firstMuted}: you do not hear it yet`
      : `no sound${ref === "*" ? "" : ` in ${trackWord(ref)}`} has one of the sound-design controls set far enough to hear`,
  };
};
/**
 * `control-set` with `envelope: true` (Wave 7 Build, carry f4: A1.L03): the amplitude envelope superdough plays for
 * what the code set (`adsrValues`) is shaped beyond the synth's default: a slow attack (20 ms or more), a release you
 * hear (100 ms or more), or a fall to a sustain at .4 or under (a pluck). `.attack(.001)` or `.sustain(.6)` is where
 * the sound already is.
 */
const envelopeShaped = (events: readonly NEvent[], ref: string): CorrectionEval => {
  const shaped = events.find((e) => {
    const c = e.controls ?? {};
    const set: { attack?: number; decay?: number; sustain?: number; release?: number } = {};
    for (const k of ["attack", "decay", "sustain", "release"] as const)
      if (typeof c[k] === "number") set[k] = c[k] as number;
    if (Object.keys(set).length === 0) return false;
    const v = adsrValues(set);
    return v.attack >= 0.02 || v.release >= 0.1 || v.sustain <= 0.4;
  });
  return shaped
    ? {
        ok: true,
        value: 1,
        target: 1,
        detail: "a part has a shape of its own: its notes start, fall or ring as you set them",
      }
    : {
        ok: false,
        value: 0,
        target: 1,
        detail: `every note${ref === "*" ? "" : ` in ${trackWord(ref)}`} still has the default shape: a start, a fall or a tail you can hear is not set yet`,
      };
};
const controlSet: CorrectionRule = (n, _ctx, p) => {
  if (p.envelope === true) {
    const refE = str(p, "track", "*");
    const evs = selectTrack(n, refE);
    if (evs.length === 0)
      return { ok: false, value: 0, target: 1, detail: `nothing plays in ${trackWord(refE)}` };
    return envelopeShaped(evs, refE);
  }
  if (Array.isArray(p.anyOf)) {
    const ref0 = str(p, "track", "*");
    const events0 = selectTrack(n, ref0);
    if (events0.length === 0)
      return { ok: false, value: 0, target: 1, detail: `nothing plays in ${trackWord(ref0)}` };
    const wants = (p.anyOf as unknown[]).filter(
      (x): x is ControlWant =>
        typeof x === "object" && x !== null && typeof (x as ControlWant).control === "string",
    );
    return controlSetAnyOf(events0, wants, ref0);
  }
  const control = str(p, "control", "");
  if (!control) return { ok: false, detail: "the rule needs `control`" };
  const call = str(p, "call", control);
  // A value is suggested only where the content names one (`example`): by default the detail names no answer.
  const example = typeof p.example === "string" && p.example !== "" ? p.example : null;
  const ref = str(p, "track", "*");
  const neutral = typeof p.not === "number" ? (p.not as number) : null;
  const above = num(p, "above", 0);
  const events = selectTrack(n, ref);
  if (events.length === 0)
    return { ok: false, value: 0, target: 1, detail: `nothing plays in ${trackWord(ref)}` };
  const below = typeof p.below === "number" ? (p.below as number) : null;
  const set = events.filter((e) => controlNumber(control, e) !== null);
  const values = set.map((e) => controlNumber(control, e) as number);
  const changes = (v: number): boolean =>
    neutral !== null
      ? Math.abs(v - neutral) > 1e-9
      : below !== null
        ? v < below - 1e-9 && (typeof p.above !== "number" || v > above + 1e-9)
        : v > above + 1e-9;
  // Wave 7 Build: a value that changes the sound counts only where no other control silences it.
  const muted = set.find((e) => changes(controlNumber(control, e) as number) && silencedBy(control, e));
  const good = set
    .filter((e) => changes(controlNumber(control, e) as number) && !silencedBy(control, e))
    .map((e) => controlNumber(control, e) as number);
  if (good.length === 0 && muted)
    return {
      ok: false,
      value: 0,
      target: 1,
      detail: `\`.${call}()\` is set, but ${silencedBy(control, muted)}: you do not hear it yet`,
    };
  const fmtNum = (v: number): string => String(Number(v.toFixed(3))).replace(/^0\./, ".");
  const share = num(p, "share", 0);
  if (good.length > 0 && good.length / events.length < share)
    return {
      ok: false,
      value: good.length / events.length,
      target: share,
      detail: `only ${good.length} of ${events.length} notes in ${trackWord(ref)} have \`.${call}()\` you can hear; the rest are dry. Set it for the whole line${example ? `, such as \`.${call}(${example})\`` : ""}`,
    };
  if (good.length > 0)
    return { ok: true, value: 1, target: 1, detail: `\`.${call}()\` set to ${fmtNum(good[0] as number)}` };
  if (values.length === 0)
    return {
      ok: false,
      value: 0,
      target: 1,
      detail: `no sound${ref === "*" ? "" : ` in ${trackWord(ref)}`} has \`.${call}()\` yet${example ? `: add \`.${call}(${example})\` to the line` : ""}`,
    };
  const v = values[0] as number;
  return {
    ok: false,
    value: 0,
    target: 1,
    detail: `\`.${call}(${fmtNum(v)})\` changes nothing you can hear: ${neutral !== null ? `${fmtNum(neutral)} is where the sound already is` : `at ${fmtNum(v)} it adds nothing`}${example ? `. Try \`.${call}(${example})\`` : ""}`,
  };
};

// --- parts-enter ---------------------------------------------------------------------------------------

/**
 * `parts-enter` (U09.L05 "an intro that brings the parts in one at a time"): at least `min` (default 2) times, a
 * learner part is silent for one whole bar or more while another part plays, and plays elsewhere in the piece: a
 * part coming in late, or dropping out and back. Read over the piece's bars (an `arrange()` total). `.mask("1")`
 * silences nothing, so it counts for nothing. params: `min`.
 */
const partsEnter: (deps: CorrectionDeps) => CorrectionRule = (deps) => (n, ctx, p) => {
  const min = num(p, "min", 2);
  const tracks = Object.entries(n.byTrack).filter(([t, es]) => !t.startsWith("band.") && es.length > 0);
  if (tracks.length === 0) return { ok: false, value: 0, target: min, detail: "nothing plays yet" };
  const bars = Math.max(1, Math.min(deps.pieceBars(n, ctx), windowOf(n.all, ctx)));
  const active = new Map<string, boolean[]>(
    tracks.map(([t, es]) => [
      t,
      Array.from({ length: bars }, (_, b) => heardIn(es, rat(b), rat(b + 1)).length > 0),
    ]),
  );
  const runs: { track: string; from: number; to: number; entry: boolean }[] = [];
  for (const [t, act] of active) {
    if (!act.some(Boolean)) continue;
    for (let b = 0; b < bars; b++) {
      if (act[b]) continue;
      let e = b;
      while (e + 1 < bars && !act[e + 1]) e++;
      let othersPlay = false;
      for (let x = b; x <= e && !othersPlay; x++)
        for (const [u, a2] of active) if (u !== t && a2[x]) othersPlay = true;
      if (othersPlay) runs.push({ track: t, from: b, to: e, entry: e + 1 < bars && !!act[e + 1] });
      b = e;
    }
  }
  const barsText = (r: { from: number; to: number }): string =>
    r.from === r.to ? `bar ${r.from + 1}` : `bars ${r.from + 1}–${r.to + 1}`;
  const ok = runs.length >= min;
  const list = runs
    .slice(0, 3)
    .map((r) => `\`${r.track}\` waits ${barsText(r)}`)
    .join(", ");
  return {
    ok,
    value: runs.length,
    target: min,
    detail: ok
      ? `${runs.length} ${runs.length === 1 ? "entry or drop-out" : "entries or drop-outs"}: ${list}`
      : runs.length === 0
        ? "every part plays in every bar: no part comes in late or drops out. A `.mask()` with a 0 in it silences a part for that bar"
        : `a part comes in late or drops out ${runs.length === 1 ? "once" : `${runs.length} times`} (${list}); the brief asks for ${min}. Mask another part, so the parts come in one at a time`,
  };
};

/**
 * Every correction rule also takes `alsoUses` (toolbox IDs): once the effect is there, the code must also write it
 * with one of these tools ("splits a beat, written with `[ ]`"), so one required rule carries both the effect and
 * the notation the step teaches. The effect is checked first; the notation only after it.
 */
export function withAlsoUses(rule: CorrectionRule, deps: CorrectionDeps): CorrectionRule {
  return (n, ctx, p) => {
    const res = rule(n, ctx, p);
    const also = strs(p, "alsoUses");
    if (!also || also.length === 0 || !res.ok) return res;
    const u = deps.toolUse(ctx, also, n);
    return u.used
      ? res
      : {
          ok: false,
          value: 0.5,
          target: 1,
          credit: 0.5,
          detail: `${res.detail}; now write it with ${u.label}, as the step asks`,
        };
  };
}

/** The custom rules of the corrections pass, by name (merged into `CUSTOM_RULES`). */
export function correctionRules(deps: CorrectionDeps): Record<string, CorrectionRule> {
  const rules = correctionRuleTable(deps);
  return Object.fromEntries(Object.entries(rules).map(([k, r]) => [k, withAlsoUses(r, deps)]));
}
function correctionRuleTable(deps: CorrectionDeps): Record<string, CorrectionRule> {
  return {
    "last-chord": lastChord(deps),
    "song-kept": songKept(deps),
    "tuplets-every-bar": tupletsEveryBar,
    "swung-offbeats": swungOffbeats,
    "voiced-with": voicedWith,
    "silent-beat": silentBeat,
    "split-beat": splitBeat,
    held,
    "bars-differ": barsDiffer,
    "speed-change": speedChange,
    "broken-chord": brokenChord,
    "black-keys": blackKeys,
    "chance-varies": chanceVaries,
    echo: echo(deps),
    "transposed-copy": transposedCopy(deps),
    "distinct-keys": distinctKeys(deps),
    "orbits-differ": orbitsDiffer,
    "call-response": callResponse,
    "stack-intervals": stackIntervals,
    "chords-per-bar": chordsPerBar(deps),
    "control-set": controlSet,
    "parts-enter": partsEnter(deps),
  };
}
