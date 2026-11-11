// Groove families: `fam.rhy.groove-lock` (does the bass lock with the kick? which bass note anticipates?)
// and `fam.rhy.polyrhythm` (3:2, 2:3, 4:3, 5:4, polymeter; tap the 3 over 2). Exercises §4.4 "Rhythm".
import type { KeySpec } from "@oak/content-kit";
import { buildPiece, type TrackSpec } from "../build.ts";
import { spellMidi, stepToMidi } from "../kernel.ts";
import { atom, line, type Node, rest, seq } from "../pat.ts";
import type { Rng } from "../types.ts";
import {
  cueOf,
  type GenCtx,
  type Generator,
  jitter,
  pickKey,
  pickKit,
  pickSound,
  pickTempo,
  trialOf,
} from "./common.ts";

// --- fam.rhy.groove-lock ------------------------------------------------------------------------

/** Kick patterns on a 16-step bar (positions of the kick), and the snare's backbeat. */
const KICKS_8: readonly number[][] = [
  [0, 8],
  [0, 6, 8],
  [0, 8, 10],
  [0, 4, 8, 12],
  [0, 6, 10],
];
const KICKS_16: readonly number[][] = [
  [0, 3, 8, 11],
  [0, 6, 9, 12],
  [0, 3, 6, 10],
  [0, 7, 10],
];
const SNARE = [4, 12];

/** One bar of 16 steps: `hits` sounding `word`, the rest silent; printed with the smallest grid that holds them. */
function gridBar(hits: readonly (number | null)[], steps: number, word: (i: number) => string): Node {
  for (const div of [4, 8, 16]) {
    const k = steps / div;
    if (hits.every((h, i) => h === null || i % k === 0)) {
      return line(Array.from({ length: div }, (_, j) => (hits[j * k] !== null ? word(j * k) : null)));
    }
  }
  return line(hits.map((h, i) => (h !== null ? word(i) : null)));
}

/** Root, fifth and octave notes of the key's tonic (or of a chosen degree) in the bass register. */
function bassNotes(key: KeySpec, rng: Rng, n: number): string[] {
  const pool = [0, 0, 4, 7].map((s) => spellMidi(stepToMidi(s, key, 2), key).code);
  return Array.from({ length: n }, (_, i) => (i === 0 ? (pool[0] as string) : rng.pick(pool)));
}

function drumTracks(ctx: GenCtx, kick: readonly number[], hatsDiv: 8 | 16): TrackSpec[] {
  const bank = pickKit(ctx);
  const kit = bank ? { bank } : {};
  const hits = (pos: readonly number[]) => Array.from({ length: 16 }, (_, i) => (pos.includes(i) ? i : null));
  return [
    { label: "kick", src: "s", pat: gridBar(hits(kick), 16, () => "bd"), gain: jitter(ctx, 0.9), ...kit },
    { label: "snare", src: "s", pat: gridBar(hits(SNARE), 16, () => "sd"), gain: jitter(ctx, 0.7), ...kit },
    { label: "hats", src: "s", pat: seq([atom("hh", hatsDiv)]), gain: jitter(ctx, 0.35), ...kit },
  ];
}

export const grooveLock: Generator = {
  name: "rhythm-groove-lock",
  generate(ctx) {
    const key = pickKey(ctx, "major");
    const sound = pickSound(ctx, "ebass");
    const cat = ctx.category;
    const funk = cat === "funk";
    const kick = [...ctx.rng.pick(funk ? KICKS_16 : KICKS_8)];
    let bass: number[] = [...kick];
    let answer: string;
    let params: Record<string, unknown>;
    if (cat === "locked" || cat === "independent") {
      if (cat === "independent") {
        // Independent: a bass line on its own grid, at most one onset shared with the kick past beat 1.
        const free = [0, 2, 3, 5, 6, 7, 9, 10, 11, 13, 14].filter((i) => !kick.includes(i) || i === 0);
        bass = [0, ...ctx.rng.shuffle(free.filter((i) => i !== 0)).slice(0, ctx.rng.int(3, 4))].sort(
          (a, b) => a - b,
        );
        // Never by accident the same as the kick.
        if (bass.every((b) => kick.includes(b))) bass = [0, 3, 7, 10, 14];
      }
      answer = cat;
      params = { mode: "choice", options: ["locked", "independent"] };
    } else {
      // Anticipating (8ths) or funk (16ths): the bass doubles the kick except one note that comes just before
      // a kick (an 8th or a 16th early) and ties over it. Click that note.
      const early = funk ? 1 : 2;
      const targets = kick.filter(
        (k) => k - early > 0 && !kick.includes(k - early) && !SNARE.includes(k - early),
      );
      const k = ctx.rng.pick(targets.length > 0 ? targets : [8]);
      bass = [...kick.filter((x) => x !== k), k - early].sort((a, b) => a - b);
      // The runner names the cells of one bar c0 … c7 (8ths) or c0 … c15 (16ths); the groove repeats.
      answer = funk ? `c${k - early}` : `c${(k - early) / 2}`;
      const per = funk ? 16 : 8;
      params = {
        mode: "choice",
        ui: "click-cell",
        stepsPerBar: per,
        options: Array.from({ length: per }, (_, i) => `c${i}`),
      };
    }
    const notes = bassNotes(key, ctx.rng, bass.length);
    let j = 0;
    const bassHits = Array.from({ length: 16 }, (_, i) => (bass.includes(i) ? i : null));
    const words = new Map<number, string>();
    for (const b of bass) words.set(b, notes[j++] as string);
    const piece = buildPiece({
      bpm: pickTempo(ctx),
      bars: 2,
      tracks: [
        ...drumTracks(ctx, kick, funk ? 16 : 8),
        {
          label: "bass",
          src: "note",
          pat: gridBar(bassHits, 16, (i) => words.get(i) as string),
          s: sound,
          gain: jitter(ctx, 0.8),
        },
      ],
    });
    return trialOf(piece, { choice: [answer] }, cueOf(ctx), {
      ...params,
      key,
      kick,
      bass,
      prompt:
        cat === "locked" || cat === "independent"
          ? "Does the bass lock with the kick?"
          : "Click the bass note that comes before the kick.",
    });
  },
};

// --- fam.rhy.polyrhythm -------------------------------------------------------------------------

/** [high, low] pulses per bar of each category; the high layer is a cowbell or rim, the low one a kick. */
const POLY: Readonly<Record<string, [number, number]>> = {
  "3:2": [3, 2],
  "2:3": [2, 3],
  straight: [4, 2],
  "4:3": [4, 3],
  "3:4": [3, 4],
  "5:4": [5, 4],
  "4:5": [4, 5],
};

export const polyrhythm: Generator = {
  name: "rhythm-polyrhythm",
  generate(ctx) {
    const bank = pickKit(ctx);
    const kit = bank ? { bank } : {};
    const hi = ctx.rng.pick(["cb", "rim", "hh"]);
    const cat = ctx.category;
    if (cat === "tap-3-over-2") {
      // Bar 1 plays both layers; bars 2–4 only the 2, and the learner taps the 3 from bar 2.
      const bars = 4;
      const piece = buildPiece({
        bpm: pickTempo(ctx),
        bars,
        tracks: [
          { label: "low", src: "s", pat: seq([atom("bd", 2)]), gain: jitter(ctx, 0.9), ...kit },
          {
            label: "high",
            src: "s",
            pat: { t: "alt", items: [seq([atom(hi, 3)]), seq([rest]), seq([rest]), seq([rest])] },
            gain: jitter(ctx, 0.7),
            ...kit,
          },
        ],
      });
      const tapTargets: number[] = [];
      for (let b = 1; b < bars; b++) for (let i = 0; i < 3; i++) tapTargets.push((b + i / 3) / piece.cps);
      return trialOf(piece, {}, cueOf(ctx), {
        mode: "tap",
        tapTargets,
        responseAt: 0,
        levels: ctx.levels,
        prompt: "Tap three even beats in each bar against the two.",
      });
    }
    if (cat === "3-vs-4-polymeter") {
      // Polymeter (a 3-step cycle at 4 steps a bar) against polyrhythm (3 even pulses over 4): which is it?
      const poly = ctx.rng.next() < 0.5;
      const items = ["bd", hi, hi];
      const bars = 3;
      const highPat: Node = poly
        ? {
            t: "alt",
            items: Array.from({ length: 3 }, (_, c) =>
              line(Array.from({ length: 4 }, (_, i) => items[(c * 4 + i) % 3] as string)),
            ),
          }
        : seq([atom("bd"), atom(hi), atom(hi)]);
      const piece = buildPiece({
        bpm: pickTempo(ctx),
        bars,
        tracks: [
          { label: "pulse", src: "s", pat: seq([atom("hh", 4)]), gain: jitter(ctx, 0.4), ...kit },
          { label: "layer", src: "s", pat: highPat, gain: jitter(ctx, 0.8), ...kit },
        ],
      });
      const answer = poly ? "3-vs-4-polymeter" : "3:4";
      return trialOf(piece, { choice: [answer] }, cueOf(ctx), {
        mode: "choice",
        options: ["3-vs-4-polymeter", "3:4"],
        optionLabels: {
          "3-vs-4-polymeter": "Polymeter: a 3-step cycle at 4 a bar",
          "3:4": "Polyrhythm: 3 against 4",
        },
        prompt: "A three-step cycle against four, or three even beats against four?",
      });
    }
    const [h, l] = POLY[cat] ?? (POLY["3:2"] as [number, number]);
    const piece = buildPiece({
      bpm: pickTempo(ctx),
      bars: 2,
      tracks: [
        { label: "low", src: "s", pat: seq([atom("bd", l)]), gain: jitter(ctx, 0.9), ...kit },
        { label: "high", src: "s", pat: seq([atom(hi, h)]), gain: jitter(ctx, 0.7), ...kit },
      ],
    });
    // Options: the open categories of the level plus the mirror image (3:2 against 2:3), never the tap task.
    const mirror = `${l}:${h}`;
    const options = [
      ...new Set([
        ...ctx.level.categories.filter((c) => c in POLY && (ctx.openCategories.includes(c) || c === cat)),
        ...(mirror in POLY ? [mirror] : []),
        cat,
      ]),
    ];
    return trialOf(piece, { choice: [cat] }, cueOf(ctx), {
      mode: "choice",
      options,
      optionLabels: Object.fromEntries(
        options.map((o) => {
          const [a, b] = POLY[o] as [number, number];
          return [o, o === "straight" ? `Straight (${a} against ${b})` : `${a} high against ${b} low`];
        }),
      ),
      high: h,
      low: l,
      prompt: "How many high beats against how many low ones?",
    });
  },
};

export type { Rng };
