// Rhythm families: pulse, echo, read, dictation, count, meter, subdivision, syncopation, swing, clave,
// odd-meter grouping (exercises §4.4 "Rhythm"). Rhythms are built beat by beat; each beat prints with the
// smallest division that holds its onsets, so the shown code reads like the counting the learner does.
import type { Answer, MeterId, Rat } from "@oak/content-kit";
import { BEAT_DIVISION_OPTIONS, FEEL_OPTIONS, R, rat } from "@oak/content-kit";
import { METERS } from "@oak/theory";
import { buildPiece, fmtNum, type Piece, type TrackSpec } from "../build.ts";
import { atom, line, type Node, query, rest, seq } from "../pat.ts";
import type { Rng } from "../types.ts";
import {
  cueOf,
  type GenCtx,
  type Generator,
  jitter,
  num,
  pickClick,
  pickKit,
  pickTempo,
  str,
  type TrialBody,
  trialOf,
} from "./common.ts";
import {
  isWritten,
  type Span,
  type WrittenCategory,
  writtenMeter,
  writtenNeeds,
  writtenNode,
  writtenOnsets,
  writtenPhrase,
} from "./written.ts";

/** A quarter-note tempo expressed in the meter's tempo unit (eighths ×2, dotted quarters ×2/3). */
export function unitBpm(quarterBpm: number, meter: MeterId): number {
  const unit = METERS[meter].tempoUnit;
  return unit === "eighth"
    ? quarterBpm * 2
    : unit === "dottedQuarter"
      ? Math.round((quarterBpm * 2) / 3)
      : quarterBpm;
}

// --- beats --------------------------------------------------------------------------------------

/** One beat: `div` equal slots, `true` where a note starts. */
export interface Beat {
  div: number;
  hits: boolean[];
}
const B = (...hits: (0 | 1)[]): Beat => ({ div: hits.length, hits: hits.map((h) => h === 1) });

/** Prints a beat with the smallest division that keeps its onsets. */
function beatNode(beat: Beat, sound: string): Node {
  if (!beat.hits.some(Boolean)) return rest;
  for (const d of [1, 2, 3, 4, 6, 8, 12]) {
    if (beat.div % d !== 0) continue;
    const k = beat.div / d;
    if (beat.hits.every((h, i) => !h || i % k === 0)) {
      if (d === 1) return atom(sound);
      const slots = Array.from({ length: d }, (_, j) => (beat.hits[j * k] ? atom(sound) : rest));
      if (slots.every((s) => s.t === "atom")) return atom(sound, d);
      return seq(slots);
    }
  }
  return seq(beat.hits.map((h) => (h ? atom(sound) : rest)));
}
/** One bar of beats as a node: `bd [~ bd] bd*2 ~`. */
export function barNode(beats: readonly Beat[], sound: string): Node {
  const items = beats.map((b) => beatNode(b, sound));
  if (items.every((i) => i.t === "rest")) return seq([rest]);
  return seq(items);
}
/** Several bars: one bar plain, more bars as `< >`. */
export function barsNode(bars: readonly (readonly Beat[])[], sound: string): Node {
  if (bars.length === 1) return barNode(bars[0] as Beat[], sound);
  return { t: "alt", items: bars.map((b) => barNode(b, sound)) };
}
/** Onset positions of a grid (`steps` per bar) as beats of `perBeat` steps. */
export function gridBeats(hits: readonly number[], beats: number, perBeat: number): Beat[] {
  return Array.from({ length: beats }, (_, b) => ({
    div: perBeat,
    hits: Array.from({ length: perBeat }, (_, i) => hits.includes(b * perBeat + i)),
  }));
}

/** Onsets in seconds of a track's events. */
export function onsetsSec(
  piece: Piece,
  track: string,
  fromBar = 0,
  toBar = Number.POSITIVE_INFINITY,
): number[] {
  return piece.events
    .filter((e) => e.track === track)
    .map((e) => R.toNum(e.onset))
    .filter((t) => t >= fromBar && t < toBar)
    .map((t) => (t - fromBar) / piece.cps);
}

// --- beat vocabularies per ladder rung (rhy.echo / rhy.read / rhy.dictation) ----------------------

const VOCAB: Readonly<Record<string, Beat[]>> = {
  quarters: [B(1), B(1), B(1, 1)],
  rests: [B(0), B(0, 1), B(1, 1), B(1)],
  sixteenths: [B(1, 1, 1, 1), B(1, 1, 1, 0), B(1, 0, 1, 1)],
  // The echo family's "dotted" figure of U01.L06 (a hit, then one on the last sixteenth). Dotted values as
  // written lengths, ties, triplets and the compound bar are gen/written.ts (Rhythm II, U13).
  dotted: [B(1, 0, 0, 1)],
};
/**
 * The categories a family writes with lengths (gen/written.ts). The echo family's "dotted" is the older
 * beat figure; the reading and dictation families' "dotted" is U13.L03's dotted value.
 */
function writtenCategory(ctx: GenCtx, category: string): WrittenCategory | null {
  if (!isWritten(category)) return null;
  if (category === "dotted" && ctx.def.generator === "rhythm-echo") return null;
  return category;
}
/** Random bars from a vocabulary: the first beat always sounds (it anchors the echo), no bar is empty. */
export function randomBars(
  rng: Rng,
  vocab: readonly Beat[],
  beats: number,
  bars: number,
  newest: Beat[],
): Beat[][] {
  const out: Beat[][] = [];
  for (let b = 0; b < bars; b++) {
    const bar: Beat[] = [];
    for (let i = 0; i < beats; i++) {
      const pool = b === 0 && i === 0 ? vocab.filter((x) => x.hits[0]) : vocab;
      bar.push(rng.pick(pool.length > 0 ? pool : vocab));
    }
    // The level's new figure appears at least once, so the category is really asked.
    if (newest.length > 0 && !bar.some((x) => newest.includes(x)))
      bar[rng.int(1, beats - 1)] = rng.pick(newest);
    out.push(bar);
  }
  return out;
}

interface EchoMaterial {
  piece: Piece;
  bars: number;
  meter: MeterId;
  /** The beat-by-beat bars of the older levels (empty for a written phrase). */
  beats: Beat[][];
  /** A written phrase (Rhythm II): its spans, and what the staff needs to write it back. */
  written: { spans: Span[]; category: WrittenCategory; needs: ReturnType<typeof writtenNeeds> } | null;
}
function echoMaterial(ctx: GenCtx, over: { meter?: MeterId; bars?: number } = {}): EchoMaterial {
  // The category is the figure being asked; the vocabulary is every open figure of the level.
  const cat = ctx.category;
  const wcat = writtenCategory(ctx, cat);
  const sound = pickClick(ctx);
  if (wcat) {
    // A written phrase: dotted values, ties, triplets, 3/4 and 6/8 with their lengths in the code.
    const meter = writtenMeter(wcat);
    const bars = over.bars ?? num(ctx.level, "bars", 2);
    const tied = wcat === "tied" || wcat === "syncopation";
    const spans = writtenPhrase(ctx.rng, wcat, bars, {
      acrossBar: tied && bars >= 2 && ctx.rng.next() < 0.4,
    });
    const track: TrackSpec = {
      label: "perc",
      src: "s",
      pat: writtenNode(spans, sound),
      gain: jitter(ctx, 0.8),
    };
    const piece = buildPiece({ bpm: unitBpm(pickTempo(ctx), meter), meter, bars, tracks: [track] });
    return {
      piece,
      bars,
      meter,
      beats: [],
      written: { spans, category: wcat, needs: writtenNeeds(spans, wcat) },
    };
  }
  const meter: MeterId = str<MeterId>(ctx.level, "meter", "4/4");
  const spec = METERS[meter];
  const bars = num(ctx.level, "bars", 1);
  const open = ctx.level.categories.filter((c) => ctx.openCategories.includes(c));
  const vocab = [...new Set(["quarters", ...open])].flatMap((n) =>
    writtenCategory(ctx, n) ? [] : (VOCAB[n] ?? []),
  );
  const newest = VOCAB[cat] ?? [];
  const beats = randomBars(ctx.rng, vocab, spec.unitsPerBar, bars, newest);
  const swung = cat === "swing" && beats.flat().every((b) => b.div <= 2);
  if (cat === "swing" && !swung)
    for (const bar of beats)
      for (let i = 0; i < bar.length; i++) if ((bar[i] as Beat).div > 2) bar[i] = B(1, 1);
  const track: TrackSpec = {
    label: "perc",
    src: "s",
    pat: barsNode(beats, sound),
    gain: jitter(ctx, 0.8),
    ...(cat === "swing" ? { swing: { amount: rat(1, 3), per: spec.unitsPerBar } } : {}),
  };
  const piece = buildPiece({ bpm: unitBpm(pickTempo(ctx), meter), meter, bars, tracks: [track] });
  return { piece, bars, meter, beats, written: null };
}

// --- rhy.pulse ----------------------------------------------------------------------------------

const GROOVES: Readonly<
  Record<string, { kick: number[]; snare: number[]; hats: number[]; target: number[] }>
> = {
  "four-on-floor": { kick: [0, 4, 8, 12], snare: [4, 12], hats: [2, 6, 10, 14], target: [0, 4, 8, 12] },
  backbeat: { kick: [0, 8], snare: [4, 12], hats: [0, 2, 4, 6, 8, 10, 12, 14], target: [0, 4, 8, 12] },
  "syncopated-kick": {
    kick: [0, 6, 8, 14],
    snare: [4, 12],
    hats: [0, 2, 4, 6, 8, 10, 12, 14],
    target: [0, 4, 8, 12],
  },
  sparse: { kick: [0, 10], snare: [12], hats: [2, 6, 10, 14], target: [0, 4, 8, 12] },
  "half-time": { kick: [0, 14], snare: [8], hats: [0, 2, 4, 6, 8, 10, 12, 14], target: [0, 4, 8, 12] },
};
export const pulse: Generator = {
  name: "rhythm-pulse",
  generate(ctx) {
    const g = GROOVES[ctx.category] ?? (GROOVES.backbeat as (typeof GROOVES)[string]);
    const bank = pickKit(ctx);
    const bars = 4;
    const mk = (label: string, s: string, hits: number[], gain: number): TrackSpec => ({
      label,
      src: "s",
      pat: barNode(gridBeats(hits, 4, 4), s),
      gain: jitter(ctx, gain),
      ...(bank ? { bank } : {}),
    });
    const piece = buildPiece({
      bpm: pickTempo(ctx),
      bars,
      tracks: [mk("kick", "bd", g.kick, 0.9), mk("snare", "sd", g.snare, 0.8), mk("hats", "hh", g.hats, 0.5)],
    });
    // Tap along from bar 2: the first bar is for finding the beat.
    const tapTargets: number[] = [];
    for (let b = 1; b < bars; b++) for (const s of g.target) tapTargets.push((b + s / 16) / piece.cps);
    return trialOf(piece, {}, cueOf(ctx, { replays: 0 }), {
      mode: "tap",
      groove: ctx.category,
      tapTargets,
      responseAt: 0,
      levels: ctx.levels,
    });
  },
};

// --- rhy.echo and rhy.read ------------------------------------------------------------------------

export const echo: Generator = {
  name: "rhythm-echo",
  generate(ctx) {
    const { piece, bars, meter, written } = echoMaterial(ctx);
    // The echo is tapped in the bars right after the stimulus, over the locked click.
    return trialOf(piece, {}, cueOf(ctx, { countInBars: 1, click: true }), {
      mode: "tap",
      meter,
      ...(written ? { figure: written.category } : {}),
      tapTargets: onsetsSec(piece, "perc"),
      responseAt: bars / piece.cps,
      levels: ctx.levels,
    });
  },
};
export const read: Generator = {
  name: "rhythm-read",
  generate(ctx) {
    const { piece, meter, written } = echoMaterial(ctx);
    // Shown on the staff, tapped after a count-in; the audio is the reveal.
    return trialOf(piece, {}, cueOf(ctx, { countInBars: 1, click: true, replays: 0 }), {
      mode: "tap",
      meter,
      ...(written ? { staffNeeds: written.needs, figure: written.category } : {}),
      showStaff: true,
      playFirst: false,
      tapTargets: onsetsSec(piece, "perc"),
      responseAt: 0,
      levels: ctx.levels,
    });
  },
};

// --- rhy.dictation ------------------------------------------------------------------------------

export const dictation: Generator = {
  name: "rhythm-dictation",
  generate(ctx) {
    if (ctx.category === "compound") return compoundDictation(ctx);
    const { piece, bars, meter, beats, written } = echoMaterial(ctx);
    const spec = METERS[meter];
    const ui = str(ctx.level, "ui", "grid");
    const cue = cueOf(ctx, { countInBars: 1, click: true });
    if (ui === "grid" && !written) {
      // Grid answer: the indices of the sounding cells, `stepsPerBar` per bar.
      const per = num(ctx.level, "stepsPerBeat", 2);
      const cells: string[] = [];
      beats.forEach((bar, b) => {
        bar.forEach((beat, i) => {
          beat.hits.forEach((h, j) => {
            const cell = (j * per) / beat.div;
            if (h && Number.isInteger(cell)) cells.push(String((b * spec.unitsPerBar + i) * per + cell));
          });
        });
      });
      return trialOf(piece, { choice: cells }, cue, {
        mode: "choice",
        ui: "grid",
        stepsPerBar: per * spec.unitsPerBar,
        gridBars: bars,
      });
    }
    // Code (L3+) and staff (L5+): the learner writes the rhythm; graded on onsets. A written phrase tells the
    // staff which values it needs (dots, ties, triplets), so the palette offers them and the reveal shows them.
    return trialOf(piece, {}, cue, {
      mode: "code",
      ui: written && ui === "grid" ? "staff-input" : ui,
      answerTrack: "perc",
      answerFromBar: 0,
      answerBars: bars,
      ...(written ? { staffNeeds: written.needs, figure: written.category } : {}),
    });
  },
};

/**
 * Compound-meter dictation (U13.L04, U13.L06): one bar of 12/8 on a twelve-step grid in four groups of three
 * ("1 la li 2 la li …"), the grid U13.L06 uses. The answer is the sounding cells.
 */
function compoundDictation(ctx: GenCtx): TrialBody {
  const meter: MeterId = "12/8";
  const halves = writtenPhrase(ctx.rng, "compound", 2);
  const span: Span = { bars: 1, values: halves.flatMap((h) => h.values) };
  const sound = pickClick(ctx);
  const piece = buildPiece({
    bpm: unitBpm(pickTempo(ctx), meter),
    meter,
    bars: 1,
    tracks: [{ label: "perc", src: "s", pat: writtenNode([span], sound), gain: jitter(ctx, 0.8) }],
  });
  const cells = writtenOnsets([span]).map((u) => String(u));
  return trialOf(piece, { choice: cells }, cueOf(ctx, { countInBars: 1, click: true }), {
    mode: "choice",
    ui: "grid",
    stepsPerBar: 12,
    gridBars: 1,
    gridGroups: [3, 3, 3, 3],
    figure: "compound",
  });
}

// --- rhy.count ----------------------------------------------------------------------------------

const COUNT_GRIDS: Readonly<Record<string, { meter: MeterId; perBeat: number; syl: string[] }>> = {
  eighths: { meter: "4/4", perBeat: 2, syl: ["", "&"] },
  sixteenths: { meter: "4/4", perBeat: 4, syl: ["", "e", "&", "a"] },
  triplets: { meter: "4/4", perBeat: 3, syl: ["", "trip", "let"] },
  compound: { meter: "6/8", perBeat: 3, syl: ["", "la", "li"] },
};
export const count: Generator = {
  name: "rhythm-count",
  generate(ctx) {
    const grid = COUNT_GRIDS[ctx.category] ?? (COUNT_GRIDS.eighths as (typeof COUNT_GRIDS)[string]);
    const spec = METERS[grid.meter];
    const steps = spec.unitsPerBar * grid.perBeat;
    const label = (k: number): string => `${Math.floor(k / grid.perBeat) + 1}${grid.syl[k % grid.perBeat]}`;
    // Off-beat positions are what this family is about: the clap avoids the beat most of the time.
    const offbeats = Array.from({ length: steps }, (_, k) => k).filter((k) => k % grid.perBeat !== 0);
    const pos = ctx.rng.next() < 0.8 ? ctx.rng.pick(offbeats) : ctx.rng.int(0, steps - 1);
    const all = Array.from({ length: steps }, (_, k) => k);
    const bank = pickKit(ctx);
    const piece = buildPiece({
      bpm: unitBpm(pickTempo(ctx), grid.meter),
      meter: grid.meter,
      bars: 2,
      tracks: [
        {
          label: "hats",
          src: "s",
          pat: barNode(gridBeats(all, spec.unitsPerBar, grid.perBeat), "hh"),
          gain: jitter(ctx, 0.45),
          ...(bank ? { bank } : {}),
        },
        {
          label: "perc",
          src: "s",
          pat: {
            t: "alt",
            items: [seq([rest]), barNode(gridBeats([pos], spec.unitsPerBar, grid.perBeat), "cp")],
          },
          ...(bank ? { bank } : {}),
        },
      ],
    });
    const distractors = ctx.rng
      .shuffle(all.filter((k) => k !== pos))
      .sort((a, b) => Math.abs(a - pos) - Math.abs(b - pos))
      .slice(0, 3);
    const options = ctx.rng.shuffle([pos, ...distractors]).map(label);
    return trialOf(piece, { choice: [label(pos)] }, cueOf(ctx), {
      mode: "choice",
      options,
      prompt: "On which count does the clap land in bar 2?",
    });
  },
};

// --- rhy.meter ----------------------------------------------------------------------------------

/** Accent pattern (kick on group starts, snare on the other beats) of a meter, in eighths. */
function meterDrums(meter: MeterId): { kick: number[]; snare: number[]; hats: number[]; eighths: number } {
  const spec = METERS[meter];
  const eighths = spec.den === 8 ? spec.num : spec.num * 2;
  const groupStarts: number[] = [];
  if (spec.den === 8) {
    let at = 0;
    for (const g of spec.grouping) {
      groupStarts.push(at);
      at += g;
    }
  } else for (let b = 0; b < spec.num; b++) groupStarts.push(b * 2);
  return {
    kick: [0],
    snare: groupStarts.slice(1),
    hats: Array.from({ length: eighths }, (_, i) => i),
    eighths,
  };
}
export const meterId: Generator = {
  name: "rhythm-meter",
  generate(ctx) {
    const meter = ctx.category as MeterId;
    const spec = METERS[meter] ?? METERS["4/4"];
    const d = meterDrums(spec.id);
    const bars = 4;
    const melodyOnly = ctx.level.melodyOnly === true;
    const tracks: TrackSpec[] = [];
    const eighthBeats = (hits: number[]): Node =>
      seq(Array.from({ length: d.eighths }, (_, i) => (hits.includes(i) ? atom("x") : rest)));
    if (melodyOnly) {
      // A melody whose long notes and loud notes fall on the strong beats.
      const notes = ["c4", "e4", "g4", "d4", "f4", "a4", "b3", "g3"];
      const strong = [0, ...d.snare];
      const pat = seq(
        Array.from({ length: d.eighths }, (_, i) =>
          strong.includes(i)
            ? atom(ctx.rng.pick(notes))
            : i % 2 === 0 && spec.den === 4
              ? atom(ctx.rng.pick(notes))
              : rest,
        ),
      );
      const gain = line(
        Array.from({ length: d.eighths }, (_, i) => fmtNum(i === 0 ? 1 : strong.includes(i) ? 0.75 : 0.5)),
      );
      tracks.push({ label: "mel", src: "note", pat, s: "piano", gain });
    } else {
      const bank = pickKit(ctx);
      const kitOf = bank ? { bank } : {};
      const sub = (hits: number[], s: string): Node => {
        const n = eighthBeats(hits);
        return replaceAtoms(n, s);
      };
      tracks.push({ label: "kick", src: "s", pat: sub(d.kick, "bd"), gain: jitter(ctx, 0.9), ...kitOf });
      if (d.snare.length > 0)
        tracks.push({ label: "snare", src: "s", pat: sub(d.snare, "sd"), gain: jitter(ctx, 0.7), ...kitOf });
      tracks.push({ label: "hats", src: "s", pat: sub(d.hats, "hh"), gain: jitter(ctx, 0.4), ...kitOf });
    }
    const piece = buildPiece({ bpm: unitBpm(pickTempo(ctx), spec.id), meter: spec.id, bars, tracks });
    return trialOf(piece, { choice: [spec.id] }, cueOf(ctx), {
      mode: "choice",
      options: (ctx.level.categories as string[]).filter((c) => ctx.openCategories.includes(c)),
    });
  },
};
function replaceAtoms(node: Node, s: string): Node {
  switch (node.t) {
    case "atom":
      return { ...node, v: s };
    case "seq":
      return { ...node, items: node.items.map((n) => replaceAtoms(n, s)) };
    case "stack":
    case "alt":
      return { ...node, items: node.items.map((n) => replaceAtoms(n, s)) };
    default:
      return node;
  }
}

// --- rhy.subdivision ----------------------------------------------------------------------------

const SUBDIVISIONS: Readonly<Record<string, number>> = { eighths: 2, triplets: 3, sixteenths: 4 };
/** The answers in U13.L05's words (BEAT_DIVISION_OPTIONS for two and three to the beat). */
const DIVISION_LABELS: Readonly<Record<string, string>> = {
  eighths: BEAT_DIVISION_OPTIONS.find((o) => o.id === "duple")?.label ?? "Two to the beat (eighths)",
  triplets: BEAT_DIVISION_OPTIONS.find((o) => o.id === "triplet")?.label ?? "Three to the beat (triplets)",
  sixteenths: "Four to the beat (sixteenths)",
};
export const subdivision: Generator = {
  name: "rhythm-subdivision",
  generate(ctx) {
    const mixed = ctx.level.mixed === true;
    const bank = pickKit(ctx);
    const per = SUBDIVISIONS[ctx.category] ?? 2;
    const beats: Beat[] = Array.from({ length: 4 }, (_, i) => {
      // Mixed level: the asked subdivision fills beats 3 and 4; beats 1–2 move in another one.
      const d = mixed && i < 2 ? ctx.rng.pick(Object.values(SUBDIVISIONS).filter((x) => x !== per)) : per;
      return { div: d, hits: Array.from({ length: d }, () => true) };
    });
    const piece = buildPiece({
      bpm: pickTempo(ctx),
      bars: 2,
      tracks: [
        {
          label: "hats",
          src: "s",
          pat: barNode(beats, "hh"),
          gain: jitter(ctx, 0.6),
          ...(bank ? { bank } : {}),
        },
        { label: "kick", src: "s", pat: line(["bd", null, "bd", null]), ...(bank ? { bank } : {}) },
        { label: "snare", src: "s", pat: line([null, "sd", null, "sd"]), ...(bank ? { bank } : {}) },
      ],
    });
    // The level's divisions the learner has met, slowest first, in BEAT_DIVISION_OPTIONS' words.
    const open = ctx.level.categories.filter((c) => ctx.openCategories.includes(c) || c === ctx.category);
    const options = Object.keys(SUBDIVISIONS).filter((c) => open.includes(c));
    return trialOf(piece, { choice: [ctx.category] }, cueOf(ctx), {
      mode: "choice",
      options,
      optionLabels: Object.fromEntries(options.map((o) => [o, DIVISION_LABELS[o] as string])),
      prompt: mixed ? "How do the hats move in beats 3 and 4?" : "How do the hats move?",
    });
  },
};

// --- rhy.syncopation ----------------------------------------------------------------------------

export const syncopation: Generator = {
  name: "rhythm-syncopation",
  generate(ctx) {
    const bank = pickKit(ctx);
    const kitOf = bank ? { bank } : {};
    const cells = (() => {
      switch (ctx.category) {
        case "anticipation":
          return [ctx.rng.pick([6, 14])];
        case "offbeat-8th":
          return [ctx.rng.pick([2, 6, 10, 14])];
        case "offbeat-16th":
          return [ctx.rng.pick([1, 3, 5, 7, 9, 11, 13, 15])];
        default: {
          const a = ctx.rng.pick([2, 3, 6, 7]);
          const b = ctx.rng.pick([10, 11, 13, 14, 15]);
          return [a, b];
        }
      }
    })();
    // The kick keeps beats 1 and 3, except that a push into beat 3 takes its place ("it arrives early"): the
    // near miss of every pushed kick is the kick on the beat next to it.
    const pushesThree = cells.some((c) => c === 6 || c === 7);
    const bassHits = [...new Set([0, ...(pushesThree ? [] : [8]), ...cells])].sort((a, b) => a - b);
    const piece = buildPiece({
      bpm: pickTempo(ctx),
      bars: 2,
      tracks: [
        {
          label: "hats",
          src: "s",
          pat: barNode(gridBeats([0, 2, 4, 6, 8, 10, 12, 14], 4, 4), "hh"),
          gain: jitter(ctx, 0.45),
          ...kitOf,
        },
        {
          label: "snare",
          src: "s",
          pat: barNode(gridBeats([4, 12], 4, 4), "sd"),
          gain: jitter(ctx, 0.7),
          ...kitOf,
        },
        {
          label: "kick",
          src: "s",
          pat: barNode(gridBeats(bassHits, 4, 4), "bd"),
          gain: jitter(ctx, 0.9),
          ...kitOf,
        },
      ],
    });
    return trialOf(piece, { choice: cells.map((c) => `c${c}`) }, cueOf(ctx), {
      mode: "choice",
      ui: "click-cell",
      stepsPerBar: 16,
      prompt: cells.length > 1 ? "Click the two kicks off the beat." : "Click the kick that is off the beat.",
    });
  },
};

// --- rhy.swing ----------------------------------------------------------------------------------

const SWING: Readonly<Record<string, Rat | null>> = {
  straight: null,
  light: rat(1, 6),
  swung: rat(1, 3),
  hard: rat(1, 2),
};
/**
 * The feels as U11.L07 names them (FEEL_OPTIONS for straight and swung): "swung" puts the off-beat eighth two
 * thirds of the way through the beat (long–short, 2:1); light swing a little less (7:5), hard swing more (3:1).
 */
const FEEL_LABELS: Readonly<Record<string, string>> = {
  ...Object.fromEntries(FEEL_OPTIONS.map((o) => [o.id, o.label])),
  light: "Light swing: a little long–short",
  hard: "Hard swing: very long–short",
};
export const swingFeel: Generator = {
  name: "rhythm-swing",
  generate(ctx) {
    const sixteenths = ctx.level.sixteenths === true;
    const full = ctx.level.full === true;
    const amount = SWING[ctx.category] ?? null;
    const bank = pickKit(ctx);
    const kitOf = bank ? { bank } : {};
    const tracks: TrackSpec[] = [
      {
        label: "hats",
        src: "s",
        pat: seq([atom("hh", sixteenths ? 16 : 8)]),
        gain: jitter(ctx, 0.6),
        ...(amount ? { swing: { amount, per: sixteenths ? 8 : 4 } } : {}),
        ...kitOf,
      },
      { label: "kick", src: "s", pat: line(["bd", null, "bd", null]), ...kitOf },
      { label: "snare", src: "s", pat: line([null, "sd", null, "sd"]), ...kitOf },
    ];
    if (full) {
      const k = ctx.rng.pick([0, 5, 7, 9]);
      const roots = [36 + k, 36 + k, 41 + k, 43 + k].map((m) => m);
      tracks.push({
        label: "bass",
        src: "note",
        pat: { t: "alt", items: roots.map((m) => line([midiName(m), null, midiName(m), midiName(m + 7)])) },
        s: "upright",
        ...(amount ? { swing: { amount, per: 4 } } : {}),
      });
    }
    const piece = buildPiece({ bpm: pickTempo(ctx), bars: 2, tracks });
    // Only the feels the level offers and the learner has met, in order from straight to hard.
    const open = ctx.level.categories.filter((c) => ctx.openCategories.includes(c) || c === ctx.category);
    const options = ["straight", "light", "swung", "hard"].filter((c) => open.includes(c));
    return trialOf(piece, { choice: [ctx.category] }, cueOf(ctx), {
      mode: "choice",
      options,
      optionLabels: Object.fromEntries(options.map((o) => [o, FEEL_LABELS[o] as string])),
      prompt: options.length > 2 ? "Straight, or how much swing?" : "Straight or swung?",
    });
  },
};
const NAMES = ["c", "c#", "d", "eb", "e", "f", "f#", "g", "ab", "a", "bb", "b"];
const midiName = (m: number): string => `${NAMES[m % 12]}${Math.floor(m / 12) - 1}`;

// --- rhy.clave ----------------------------------------------------------------------------------

/** Onsets on a 16-step grid per bar. */
const CLAVES: Readonly<Record<string, number[][]>> = {
  tresillo: [[0, 6, 12]],
  cinquillo: [[0, 4, 6, 10, 12]],
  straight: [[0, 4, 8, 12]],
  "son-3-2": [
    [0, 6, 12],
    [4, 8],
  ],
  "son-2-3": [
    [4, 8],
    [0, 6, 12],
  ],
  "rumba-3-2": [
    [0, 6, 14],
    [4, 8],
  ],
  "rumba-2-3": [
    [4, 8],
    [0, 6, 14],
  ],
};
export const clave: Generator = {
  name: "rhythm-clave",
  generate(ctx) {
    const bars = CLAVES[ctx.category] ?? (CLAVES.tresillo as number[][]);
    const full = ctx.level.full === true;
    const bank = pickKit(ctx);
    const kitOf = bank ? { bank } : {};
    const tracks: TrackSpec[] = [
      {
        label: "perc",
        src: "s",
        pat: barsNode(
          bars.map((b) => gridBeats(b, 4, 4)),
          "rim",
        ),
        gain: jitter(ctx, 0.85),
        ...kitOf,
      },
    ];
    if (full) {
      tracks.push({ label: "hats", src: "s", pat: seq([atom("hh", 8)]), gain: jitter(ctx, 0.35), ...kitOf });
      tracks.push({
        label: "kick",
        src: "s",
        pat: line(["bd", null, null, "bd"]),
        gain: jitter(ctx, 0.7),
        ...kitOf,
      });
    }
    const piece = buildPiece({ bpm: pickTempo(ctx), bars: Math.max(2, bars.length), tracks });
    return trialOf(piece, { choice: [ctx.category] }, cueOf(ctx), { mode: "choice" });
  },
};

// --- rhy.odd-grouping ---------------------------------------------------------------------------

export const oddGrouping: Generator = {
  name: "rhythm-odd-grouping",
  generate(ctx) {
    // Category "7/8:2+2+3".
    const [meterText, groupText] = ctx.category.split(":") as [string, string];
    const meter = meterText as MeterId;
    const groups = groupText.split("+").map(Number);
    const total = groups.reduce((s, g) => s + g, 0);
    const starts: number[] = [];
    let at = 0;
    for (const g of groups) {
      starts.push(at);
      at += g;
    }
    const melodyOnly = ctx.level.melodyOnly === true;
    const tracks: TrackSpec[] = [];
    const accents = line(Array.from({ length: total }, (_, i) => fmtNum(starts.includes(i) ? 1 : 0.5)));
    if (melodyOnly) {
      const notes = ["d4", "e4", "f#4", "a4", "b4"];
      tracks.push({
        label: "mel",
        src: "note",
        pat: seq(
          Array.from({ length: total }, (_, i) => atom(starts.includes(i) ? "a4" : ctx.rng.pick(notes))),
        ),
        s: "piano",
        gain: accents,
      });
    } else {
      const bank = pickKit(ctx);
      const kitOf = bank ? { bank } : {};
      tracks.push({ label: "hats", src: "s", pat: seq([atom("hh", total)]), gain: accents, ...kitOf });
      tracks.push({
        label: "kick",
        src: "s",
        pat: seq(
          Array.from({ length: total }, (_, i) =>
            i === 0 ? atom("bd") : starts.includes(i) ? atom("sd") : rest,
          ),
        ),
        ...kitOf,
      });
    }
    const piece = buildPiece({ bpm: pickTempo(ctx), meter, bars: 2, tracks });
    return trialOf(piece, { choice: [groupText] }, cueOf(ctx), { mode: "choice", meter });
  },
};

/** Tap targets helper for tests and the app: onsets of a track inside bars [from, to). */
export function trackOnsets(trial: TrialBody, track: string): Rat[] {
  return trial.events.filter((e) => e.track === track).map((e) => e.onset);
}
export const _test = { VOCAB, GROOVES, CLAVES, query };
export type { Answer };
