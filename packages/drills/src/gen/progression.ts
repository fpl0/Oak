// Harmony families built from whole progressions: `fam.har.progression` (Roman-numeral dictation),
// `fam.har.chromatic` (find and name the secondary or borrowed chord) and `fam.har.modulation` (did the
// key change, and where?). Chords are voiced by Oak's voicer with smooth upper voices over a bass line.
import type { ChordQuality, Degree, KeySpec } from "@oak/content-kit";
import { buildPiece, type TrackSpec } from "../build.ts";
import {
  CHORD_TONES,
  chordPcs,
  keysFor,
  MODE_STEPS,
  mod,
  parsePc,
  type RnChord,
  rnRootPc,
  spellAs,
} from "../kernel.ts";
import { above, rn, spellVoiced, type Voiced, voiceProgression } from "../music.ts";
import { atom, chordOf, type Node, seq } from "../pat.ts";
import type { Rng } from "../types.ts";
import {
  CTX,
  contextOpen,
  cueOf,
  type GenCtx,
  type Generator,
  jitter,
  pickKey,
  pickSound,
  pickTempo,
  trialOf,
} from "./common.ts";
import { scaleRn } from "./harmony.ts";

/** A chord of a progression with the Roman numeral the learner writes for it. */
export interface ProgChord {
  chord: RnChord;
  rn: string;
}

/** The bass note of a voiced chord in the second octave, spelled as a member of its chord. */
export function bassName(v: Voiced, key: KeySpec): string {
  const pc = (spellVoiced(v, key)[0] as string).replace(/-?\d+$/, "");
  return spellAs(above(mod(v.midis[0] as number, 12), 36), pc[0]?.toUpperCase() + pc.slice(1)).code;
}

/** Chords and bass, `perBar` chords to a bar. */
export function progressionTracks(
  ctx: GenCtx,
  key: KeySpec,
  chords: readonly RnChord[],
  perBar = 1,
  opts: { chordSound?: string; bassSound?: string } = {},
): { tracks: TrackSpec[]; voiced: Voiced[] } {
  const voiced = voiceProgression(chords, key);
  const bars: Node[] = [];
  const bassBars: Node[] = [];
  for (let b = 0; b < chords.length / perBar; b++) {
    const slice = voiced.slice(b * perBar, (b + 1) * perBar);
    bars.push(seq(slice.map((v) => chordOf(spellVoiced(v, key).slice(1)))));
    bassBars.push(seq(slice.map((v) => atom(bassName(v, key)))));
  }
  const alt = (ns: Node[]): Node => (ns.length === 1 ? (ns[0] as Node) : { t: "alt", items: ns });
  return {
    voiced,
    tracks: [
      {
        label: "chords",
        src: "note",
        pat: alt(bars),
        s: opts.chordSound ?? pickSound(ctx),
        gain: jitter(ctx, 0.5),
      },
      {
        label: "bass",
        src: "note",
        pat: alt(bassBars),
        s: opts.bassSound ?? ctx.rng.pick(["ebass", "upright"]),
        gain: jitter(ctx, 0.75),
      },
    ],
  };
}

// --- RN vocabulary --------------------------------------------------------------------------------

/** The diatonic chord on scale step `i` (1–7) of a key's own scale, the minor key with its harmonic V. */
export function diatonic(
  key: KeySpec,
  i: number,
  opts: { seventh?: boolean; inversion?: 0 | 1; natural?: boolean } = {},
): ProgChord {
  const steps = MODE_STEPS[key.mode];
  const at = (k: number) => (steps[mod(k, 7)] as number) + 12 * Math.floor(k / 7);
  const root = at(i - 1);
  const third = at(i + 1) - root;
  const fifth = at(i + 3) - root;
  const seventh = at(i + 5) - root;
  let quality: ChordQuality = third === 4 ? (fifth === 8 ? "aug" : "maj") : fifth === 6 ? "dim" : "min";
  if (opts.seventh)
    quality =
      third === 4 ? (seventh === 11 ? "maj7" : "7") : fifth === 6 ? (seventh === 10 ? "m7b5" : "dim7") : "m7";
  const minor = key.mode === "minor" && opts.natural !== true;
  // The minor key's V and vii° take the raised 7th (harmonic minor), as the course teaches (U10.L06); with
  // `natural` they stay v and VII (natural minor, U10.L04).
  if (minor && i === 5) quality = opts.seventh ? "7" : "maj";
  if (minor && i === 7) quality = opts.seventh ? "dim7" : "dim";
  const semis = minor && i === 7 ? 11 : root;
  const degree = (["1", "b2", "2", "b3", "3", "4", "#4", "5", "b6", "6", "b7", "7"] as const)[
    mod(semis, 12)
  ] as Degree;
  const inv = opts.inversion ?? 0;
  const chord: RnChord = inv ? { degree, quality, inversion: inv } : { degree, quality };
  const figure = inv === 1 ? (CHORD_TONES[quality].semis.length === 4 ? "65" : "6") : "";
  const base = scaleRn(i, quality);
  const text =
    inv === 1 && CHORD_TONES[quality].semis.length === 4 ? base.replace(/7$/, "") + figure : base + figure;
  return { chord, rn: text };
}

/** Next scale step by function: tonic → predominant → dominant → tonic, with the usual detours. */
const NEXT: Readonly<Record<number, readonly number[]>> = {
  1: [4, 6, 2, 5],
  2: [5, 5, 7],
  3: [6, 4],
  4: [5, 2, 1],
  5: [1, 6],
  6: [4, 2],
  7: [1],
};
/**
 * Next scale step in a minor key as U10 plays it (natural minor, pop and soul): i to iv, VI, III or VII; the
 * subtonic VII back to i or on to III; v (later V) home or to VI. No ii°, which U10 names but never loops.
 */
const NEXT_MINOR: Readonly<Record<number, readonly number[]>> = {
  1: [4, 6, 3, 7, 5],
  3: [6, 7, 4],
  4: [5, 7, 1],
  5: [1, 6],
  6: [7, 3, 4, 5],
  7: [1, 3],
};
function functionalWalk(
  rng: Rng,
  length: number,
  pool: readonly number[],
  next: Readonly<Record<number, readonly number[]>> = NEXT,
): number[] {
  for (let tries = 0; tries < 50; tries++) {
    const out = [1];
    while (out.length < length) {
      const prev = out[out.length - 1] as number;
      const nexts = (next[prev] ?? [1]).filter((x) => pool.includes(x));
      out.push(rng.pick(nexts.length > 0 ? nexts : [1]));
    }
    if (new Set(out).size >= Math.min(3, length)) return out;
  }
  return [1, 4, 5, 1].slice(0, length);
}

/** Chromatic chords of the progression family's last level: applied dominants and borrowed chords. */
const CHROMATIC_PROGS: readonly ProgChord[][] = [
  [
    { chord: rn("1", "maj"), rn: "I" },
    { chord: rn("6", "min"), rn: "vi" },
    { chord: { degree: "5", quality: "7", of: "5" }, rn: "V7/V" },
    { chord: rn("5", "maj"), rn: "V" },
  ],
  [
    { chord: rn("1", "maj"), rn: "I" },
    { chord: { degree: "5", quality: "maj", of: "6" }, rn: "V/vi" },
    { chord: rn("6", "min"), rn: "vi" },
    { chord: rn("4", "maj"), rn: "IV" },
  ],
  [
    { chord: rn("1", "maj"), rn: "I" },
    { chord: rn("b7", "maj"), rn: "bVII" },
    { chord: rn("4", "maj"), rn: "IV" },
    { chord: rn("1", "maj"), rn: "I" },
  ],
  [
    { chord: rn("1", "maj"), rn: "I" },
    { chord: rn("4", "maj"), rn: "IV" },
    { chord: rn("4", "min"), rn: "iv" },
    { chord: rn("1", "maj"), rn: "I" },
  ],
  [
    { chord: rn("1", "maj"), rn: "I" },
    { chord: rn("b6", "maj"), rn: "bVI" },
    { chord: rn("5", "maj"), rn: "V" },
    { chord: rn("1", "maj"), rn: "I" },
  ],
];

/** The Roman-numeral palette a level needs (the drill runner's `rn-palette.allow`). */
const ALLOW: Readonly<Record<string, string[]>> = {
  diatonic: ["triads"],
  inversions: ["triads", "inversions"],
  cadential: ["triads"],
  minor: ["triads"],
  sevenths: ["triads", "sevenths"],
  chromatic: ["triads", "sevenths", "secondary", "borrowed"],
};

export const progression: Generator = {
  name: "harmony-progression",
  generate(ctx) {
    const cat = ctx.category;
    const minor = cat === "minor";
    const key = pickKey(ctx, minor ? "minor" : "major");
    let prog: ProgChord[];
    let perBar = 1;
    if (cat === "chromatic") {
      prog = ctx.rng.pick(CHROMATIC_PROGS);
    } else if (cat === "cadential") {
      // Eight chords, two a bar, closing with a perfect authentic cadence (… PD V I).
      const walk = functionalWalk(ctx.rng, 5, [1, 2, 4, 5, 6]);
      // The phrase moves on to the cadence from a tonic-function chord, never back from V.
      if (walk[4] === 5 || walk[4] === 2 || walk[4] === 4) walk[4] = ctx.rng.pick([1, 6]);
      const pd = ctx.rng.pick([2, 4]);
      prog = [...walk, pd, 5, 1].map((i) => diatonic(key, i));
      perBar = 2;
    } else if (minor) {
      // Natural minor from U10.L04 (v and VII); from U10.L06 the major V takes v's place on most trials (v against
      // V is the near miss); from U10.L07 the Andalusian descent i–VII–VI–V is one of the progressions.
      const majorV = contextOpen(ctx, CTX.majorV);
      if (contextOpen(ctx, CTX.andalusian) && majorV && ctx.rng.next() < 0.25) {
        prog = [1, 7, 6, 5].map((i) => diatonic(key, i, { natural: i !== 5 }));
      } else {
        const steps = functionalWalk(ctx.rng, 4, [1, 3, 4, 5, 6, 7], NEXT_MINOR);
        const harmonicV = majorV && ctx.rng.next() < 0.7;
        prog = steps.map((i) => diatonic(key, i, { natural: !(i === 5 && harmonicV) }));
      }
    } else {
      const pool = [1, 2, 4, 5, 6];
      const steps = functionalWalk(ctx.rng, 4, pool);
      const seventh = cat === "sevenths";
      prog = steps.map((i) =>
        diatonic(key, i, { seventh: seventh && i !== 1 ? true : seventh && ctx.rng.next() < 0.5 }),
      );
      if (cat === "inversions") {
        // One chord in first inversion, never the first (the progression must still start from the tonic).
        const at = ctx.rng.int(1, 3);
        prog[at] = diatonic(key, steps[at] as number, { inversion: 1 });
      }
    }
    const { tracks } = progressionTracks(
      ctx,
      key,
      prog.map((p) => p.chord),
      perBar,
    );
    const bars = prog.length / perBar;
    const piece = buildPiece({ bpm: pickTempo(ctx), bars, tracks });
    return trialOf(piece, { rn: prog.map((p) => p.rn) }, cueOf(ctx), {
      mode: "choice",
      ui: "rn-palette",
      key,
      slots: prog.length,
      rnAllow: ALLOW[cat] ?? ["triads"],
      prompt: `Write the Roman numerals in ${key.tonic} ${key.mode}.`,
    });
  },
};

// --- fam.har.chromatic --------------------------------------------------------------------------

interface ChromaticCase {
  bars: ProgChord[];
  /** 0-based bar of the chromatic chord. */
  at: number;
}
/** Two settings per chromatic chord, the chord in different bars. Every other chord is diatonic. */
const CHROMATIC_CASES: Readonly<Record<string, ChromaticCase[]>> = {
  "V/V": [
    { bars: [p("1", "maj", "I"), p("6", "min", "vi"), ap("5", "V7/V"), p("5", "maj", "V")], at: 2 },
    { bars: [p("1", "maj", "I"), ap("5", "V7/V"), p("5", "maj", "V"), p("1", "maj", "I")], at: 1 },
  ],
  "V/vi": [
    { bars: [p("1", "maj", "I"), ap("6", "V7/vi"), p("6", "min", "vi"), p("4", "maj", "IV")], at: 1 },
    { bars: [p("1", "maj", "I"), p("4", "maj", "IV"), ap("6", "V7/vi"), p("6", "min", "vi")], at: 2 },
  ],
  "V/ii": [
    { bars: [p("1", "maj", "I"), ap("2", "V7/ii"), p("2", "min", "ii"), p("5", "maj", "V")], at: 1 },
    { bars: [p("1", "maj", "I"), p("6", "min", "vi"), ap("2", "V7/ii"), p("2", "min", "ii")], at: 2 },
  ],
  "V/IV": [
    { bars: [p("1", "maj", "I"), ap("4", "V7/IV"), p("4", "maj", "IV"), p("5", "maj", "V")], at: 1 },
    { bars: [p("1", "maj", "I"), p("5", "maj", "V"), ap("4", "V7/IV"), p("4", "maj", "IV")], at: 2 },
  ],
  iv: [
    { bars: [p("1", "maj", "I"), p("4", "maj", "IV"), p("4", "min", "iv"), p("1", "maj", "I")], at: 2 },
    { bars: [p("1", "maj", "I"), p("4", "min", "iv"), p("1", "maj", "I"), p("5", "maj", "V")], at: 1 },
  ],
  bVI: [
    { bars: [p("1", "maj", "I"), p("b6", "maj", "bVI"), p("5", "maj", "V"), p("1", "maj", "I")], at: 1 },
    { bars: [p("1", "maj", "I"), p("4", "maj", "IV"), p("b6", "maj", "bVI"), p("1", "maj", "I")], at: 2 },
  ],
  bVII: [
    { bars: [p("1", "maj", "I"), p("b7", "maj", "bVII"), p("4", "maj", "IV"), p("1", "maj", "I")], at: 1 },
    { bars: [p("1", "maj", "I"), p("4", "maj", "IV"), p("b7", "maj", "bVII"), p("1", "maj", "I")], at: 2 },
  ],
};
function p(degree: Degree, quality: ChordQuality, rnText: string): ProgChord {
  return { chord: rn(degree, quality), rn: rnText };
}
/** V7 of a target degree. */
function ap(target: Degree, rnText: string): ProgChord {
  return { chord: { degree: "5", quality: "7", of: target }, rn: rnText };
}
/** Pitch classes of a chord that are not in the key's scale. */
export function foreignPcs(chord: RnChord, key: KeySpec): number[] {
  const tonic = parsePc(key.tonic).pc;
  const scale = MODE_STEPS[key.mode].map((s) => mod(tonic + s, 12));
  return chordPcs(rnRootPc(chord, key), chord.quality).filter((pc) => !scale.includes(pc));
}

export const chromaticChord: Generator = {
  name: "harmony-chromatic",
  generate(ctx) {
    const key = pickKey(ctx, "major");
    const c = ctx.rng.pick(CHROMATIC_CASES[ctx.category] ?? (CHROMATIC_CASES["V/V"] as ChromaticCase[]));
    const { tracks } = progressionTracks(
      ctx,
      key,
      c.bars.map((b) => b.chord),
    );
    const piece = buildPiece({ bpm: pickTempo(ctx), bars: c.bars.length, tracks });
    const named = ctx.level.categories.filter((x) => ctx.openCategories.includes(x) || x === ctx.category);
    const name = named.length >= 2 && ctx.rng.next() < 0.5;
    if (name) {
      return trialOf(piece, { choice: [ctx.category] }, cueOf(ctx), {
        mode: "choice",
        key,
        options: [...new Set([...named, ctx.category])],
        markedBar: c.at + 1,
        chromaticBar: c.at + 1,
        prompt: `The chord in bar ${c.at + 1} is not from the key. Which chord is it?`,
      });
    }
    const options = c.bars.map((_, i) => String(i + 1)).filter((b) => b !== "1");
    return trialOf(piece, { choice: [String(c.at + 1)] }, cueOf(ctx), {
      mode: "choice",
      ui: "bar-buttons",
      key,
      bars: c.bars.length,
      options,
      optionLabels: Object.fromEntries(options.map((o) => [o, `Bar ${o}`])),
      chromaticBar: c.at + 1,
      prompt: "In which bar does a chord step outside the key?",
    });
  },
};

// --- fam.har.modulation -------------------------------------------------------------------------

interface Modulation {
  chords: { chord: RnChord; key: KeySpec }[];
  /** 1-based bar where the new key's first foreign chord sounds, or `null` with no key change. */
  at: number | null;
  newKey: KeySpec | null;
}
const shiftKey = (key: KeySpec, semis: number, mode: KeySpec["mode"] = key.mode): KeySpec => {
  const pc = mod(parsePc(key.tonic).pc + semis, 12);
  return keysFor("all", mode).find((k) => parsePc(k.tonic).pc === pc) as KeySpec;
};

export function modulationPlan(rng: Rng, cat: string, key: KeySpec): Modulation {
  const inKey = (k: KeySpec, ...cs: RnChord[]) => cs.map((chord) => ({ chord, key: k }));
  const head = [rn("1", "maj"), rn("4", "maj"), rn("5", "maj"), rn("1", "maj"), rn("6", "min")];
  if (cat === "truck-driver") {
    const len = rng.int(3, 5);
    const up = shiftKey(key, rng.pick([1, 2]));
    const phrase = [rn("1", "maj"), rn("6", "min"), rn("4", "maj"), rn("5", "maj"), rn("1", "maj")];
    const first = phrase.slice(0, len);
    const second = phrase.slice(0, 8 - len);
    return { chords: [...inKey(key, ...first), ...inKey(up, ...second)], at: len + 1, newKey: up };
  }
  if (cat === "relative") {
    // Pivot: vi of the old key is i of the new; its V (with the raised leading tone) is the first foreign chord.
    const len = rng.int(2, 3);
    const minorKey = shiftKey(key, 9, "minor");
    const tail = [rn("5", "maj"), rn("1", "min"), rn("4", "min"), rn("5", "maj"), rn("1", "min")];
    const chords = [
      ...inKey(key, ...head.slice(0, len)),
      ...inKey(key, rn("6", "min")),
      ...inKey(minorKey, ...tail),
    ].slice(0, 8);
    return { chords, at: len + 2, newKey: minorKey };
  }
  if (cat === "dominant-pivot") {
    // Pivot: vi of the old key is ii of the new (dominant) key; V7 of the new key brings its leading tone.
    const len = rng.int(2, 3);
    const dom = shiftKey(key, 7);
    const tail = [rn("5", "7"), rn("1", "maj"), rn("4", "maj"), rn("5", "7"), rn("1", "maj")];
    const chords = [
      ...inKey(key, ...head.slice(0, len)),
      ...inKey(key, rn("6", "min")),
      ...inKey(dom, ...tail),
    ].slice(0, 8);
    return { chords, at: len + 2, newKey: dom };
  }
  const stay = [
    rn("1", "maj"),
    rn("6", "min"),
    rn("4", "maj"),
    rn("5", "maj"),
    rn("1", "maj"),
    rn("2", "min"),
    rn("5", "maj"),
    rn("1", "maj"),
  ];
  return { chords: inKey(key, ...stay), at: null, newKey: null };
}

export const modulation: Generator = {
  name: "harmony-modulation",
  generate(ctx) {
    const key = pickKey(ctx, "major");
    const plan = modulationPlan(ctx.rng, ctx.category, key);
    // Voice each chord in its own key (so it is spelled there), around one centre so the upper voices
    // stay in the middle register across the change.
    const voicedAll: Voiced[] = plan.chords.map(
      (c) => voiceProgression([c.chord], c.key, { center: 62 })[0] as Voiced,
    );
    const keyOf = (i: number): KeySpec => (plan.chords[i] as { key: KeySpec }).key;
    const chordBars = voicedAll.map((v, i) => seq([chordOf(spellVoiced(v, keyOf(i)).slice(1))]));
    const bassBars = voicedAll.map((v, i) => seq([atom(bassName(v, keyOf(i)))]));
    const piece = buildPiece({
      bpm: pickTempo(ctx),
      bars: plan.chords.length,
      tracks: [
        {
          label: "chords",
          src: "note",
          pat: { t: "alt", items: chordBars },
          s: pickSound(ctx),
          gain: jitter(ctx, 0.5),
        },
        {
          label: "bass",
          src: "note",
          pat: { t: "alt", items: bassBars },
          s: ctx.rng.pick(["ebass", "upright"]),
          gain: jitter(ctx, 0.75),
        },
      ],
    });
    const options = ["none", ...Array.from({ length: plan.chords.length - 1 }, (_, i) => String(i + 2))];
    const answer = plan.at === null ? "none" : String(plan.at);
    return trialOf(piece, { choice: [answer] }, cueOf(ctx), {
      mode: "choice",
      ui: "bar-buttons",
      key,
      newKey: plan.newKey,
      bars: plan.chords.length,
      options,
      optionLabels: Object.fromEntries(options.map((o) => [o, o === "none" ? "No key change" : `Bar ${o}`])),
      prompt: "Does the key change? If it does, in which bar does the new key begin?",
    });
  },
};
