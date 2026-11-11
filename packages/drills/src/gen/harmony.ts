// Harmony families: Roman numerals (concept), function, bass-degree dictation, schema ID, cadence ID and
// ii–V recognition. Progressions are RnChords in a key, voiced by Oak's voicer with smooth upper voices.
import type { Answer, ChordQuality, Degree, KeySpec, ScaleMode } from "@oak/content-kit";
import { buildPiece, type TrackSpec } from "../build.ts";
import {
  chordCode,
  degreeOfMidi,
  diatonicChord,
  keysFor,
  MODE_STEPS,
  mod,
  type RnChord,
  rnRoot,
  rnRootPc,
  spellMidi,
  stepForDegree,
  tonicMidi,
} from "../kernel.ts";
import { above, rn, type Voiced, voiceProgression } from "../music.ts";
import { atom, chordOf, line, type Node, rest, seq } from "../pat.ts";
import {
  cueOf,
  type GenCtx,
  type Generator,
  jitter,
  pickKey,
  pickKit,
  pickSound,
  pickTempo,
  silentTrial,
  trialOf,
} from "./common.ts";
import { pickOctave, stepTrack, voicedNode } from "./keyed.ts";

// --- Roman numerals relative to the key's own scale ----------------------------------------------

const NUMERALS = ["I", "II", "III", "IV", "V", "VI", "VII"];
const LOWER: readonly ChordQuality[] = ["min", "dim", "m7", "m7b5", "dim7"];
const SUFFIX: Partial<Record<ChordQuality, string>> = {
  maj: "",
  min: "",
  dim: "o",
  aug: "+",
  maj7: "maj7",
  "7": "7",
  m7: "7",
  m7b5: "ø7",
  dim7: "o7",
};
/** The numeral of scale step `index` (1–7) of the key's own scale: "III" in minor, "viio" in major. */
export function scaleRn(index: number, quality: ChordQuality, prefix = ""): string {
  const base = NUMERALS[index - 1] as string;
  return `${prefix}${LOWER.includes(quality) ? base.toLowerCase() : base}${SUFFIX[quality] ?? ""}`;
}
/** The chord on scale step `index` of a key, its RN (the minor key's V is the harmonic-minor V). */
export function diatonicInKey(key: KeySpec, index: number, seventh: boolean, harmonicV = false) {
  let c = diatonicChord(key, index, seventh);
  if (harmonicV && index === 5) c = { degree: c.degree, quality: seventh ? "7" : "maj" };
  if (harmonicV && index === 7) c = { degree: "7", quality: seventh ? "dim7" : "dim" };
  const root = rnRoot(c, key);
  return { chord: c, root, symbol: chordCode(root, c.quality), rn: scaleRn(index, c.quality) };
}

const APPLIED_TARGETS: readonly { index: number; degree: Degree }[] = [
  { index: 2, degree: "2" },
  { index: 4, degree: "4" },
  { index: 5, degree: "5" },
  { index: 6, degree: "6" },
];
const BORROWED: readonly { rn: string; chord: RnChord }[] = [
  { rn: "iv", chord: rn("4", "min") },
  { rn: "bVI", chord: rn("b6", "maj") },
  { rn: "bVII", chord: rn("b7", "maj") },
  { rn: "bIII", chord: rn("b3", "maj") },
];

export const rnFacts: Generator = {
  name: "harmony-rn",
  generate(ctx) {
    const cue = cueOf(ctx, { replays: -1 });
    const cat = ctx.category;
    const minor = cat === "minor-triads";
    const key = pickKey(ctx, minor ? "minor" : "major");
    let rnText: string;
    let symbol: string;
    if (cat === "applied") {
      const t = ctx.rng.pick(APPLIED_TARGETS);
      const target = diatonicInKey(key, t.index, false);
      const c: RnChord = { degree: "5", quality: "7", of: t.degree };
      const root = rnRoot(c, key);
      symbol = chordCode(root, "7");
      rnText = `V7/${target.rn}`;
    } else if (cat === "borrowed") {
      const b = ctx.rng.pick(BORROWED);
      symbol = chordCode(rnRoot(b.chord, key), b.chord.quality);
      rnText = b.rn;
    } else {
      const index = ctx.rng.int(1, 7);
      const d = diatonicInKey(key, index, cat === "sevenths", minor);
      symbol = d.symbol;
      rnText = d.rn;
    }
    const keyName = `${key.tonic} ${key.mode}`;
    const toChord = ctx.rng.next() < 0.5;
    return toChord
      ? silentTrial({ text: [symbol] }, cue, {
          key,
          ui: "text",
          textKind: "chord",
          rn: rnText,
          prompt: `In ${keyName}, which chord is ${rnText}? (code spelling, e.g. F#m)`,
        })
      : silentTrial({ rn: [rnText] }, cue, {
          key,
          ui: "rn-palette",
          symbol,
          prompt: `In ${keyName}, ${symbol} is which Roman numeral?`,
        });
  },
};

// --- function -----------------------------------------------------------------------------------

const FUNCTIONS: Readonly<Record<string, { index: number; fn: "T" | "PD" | "D" }[]>> = {
  major: [
    { index: 1, fn: "T" },
    { index: 6, fn: "T" },
    { index: 2, fn: "PD" },
    { index: 4, fn: "PD" },
    { index: 5, fn: "D" },
    { index: 7, fn: "D" },
  ],
  minor: [
    { index: 1, fn: "T" },
    { index: 2, fn: "PD" },
    { index: 4, fn: "PD" },
    { index: 5, fn: "D" },
    { index: 7, fn: "D" },
  ],
};
export const functionId: Generator = {
  name: "harmony-function",
  generate(ctx) {
    const minor = ctx.level.minor === true && ctx.rng.next() < 0.5;
    const key = pickKey(ctx, minor ? "minor" : "major");
    const pool = (FUNCTIONS[minor ? "minor" : "major"] ?? []).filter((f) => f.fn === ctx.category);
    const pick = ctx.rng.pick(pool);
    const seventh = ctx.level.sevenths === true && ctx.rng.next() < 0.5;
    const d = diatonicInKey(key, pick.index, seventh, minor);
    if (ctx.level.heard !== true)
      return silentTrial({ choice: [pick.fn] }, cueOf(ctx, { replays: -1 }), {
        key,
        rn: d.rn,
        prompt: `In ${key.tonic} ${key.mode}, what is the function of ${d.rn}?`,
      });
    // Heard: a four-chord loop I – x – … with the marked chord in bar 3.
    const chords: RnChord[] = [
      diatonicInKey(key, 1, false, minor).chord,
      diatonicInKey(key, ctx.rng.pick([4, 6, 2]), false, minor).chord,
      d.chord,
      diatonicInKey(key, 1, false, minor).chord,
    ];
    const voiced = voiceProgression(chords, key);
    const piece = buildPiece({
      bpm: pickTempo(ctx),
      bars: 4,
      tracks: [
        {
          label: "chords",
          src: "note",
          pat: { t: "alt", items: voiced.map((v) => seq([voicedNode(v, key)])) },
          s: pickSound(ctx),
          gain: jitter(ctx, 0.55),
        },
      ],
    });
    return trialOf(piece, { choice: [pick.fn] }, cueOf(ctx), { mode: "choice", key, markedBar: 3, rn: d.rn });
  },
};

// --- shared progression arrangement --------------------------------------------------------------

/** Chords (upper voices) and bass (roots or inversion bass) of a progression, one slot per bar or `perBar`. */
function arrangement(
  ctx: GenCtx,
  key: KeySpec,
  slots: readonly (readonly RnChord[])[],
  opts: { drums?: boolean; bassSound?: string; chordSound?: string; passing?: boolean } = {},
): { tracks: TrackSpec[]; bass: number[] } {
  const flat = slots.flat();
  const voiced = voiceProgression(flat, key);
  const bassMidis: number[] = [];
  let k = 0;
  const chordBars: Node[] = [];
  const bassBars: Node[] = [];
  for (const bar of slots) {
    const cs: Node[] = [];
    const bs: Node[] = [];
    for (let i = 0; i < bar.length; i++) {
      const v = voiced[k++] as Voiced;
      const bassPc = mod(v.midis[0] as number, 12);
      const bass = above(bassPc, 36);
      bassMidis.push(bass);
      cs.push(chordOf(v.midis.slice(1).map((m) => spellMidi(m, key).code)));
      bs.push(atom(spellMidi(bass, key).code));
    }
    chordBars.push(seq(cs));
    bassBars.push(seq(bs));
  }
  const tracks: TrackSpec[] = [
    {
      label: "chords",
      src: "note",
      pat: chordBars.length === 1 ? (chordBars[0] as Node) : { t: "alt", items: chordBars },
      s: opts.chordSound ?? pickSound(ctx),
      gain: jitter(ctx, 0.5),
    },
    {
      label: "bass",
      src: "note",
      pat: bassBars.length === 1 ? (bassBars[0] as Node) : { t: "alt", items: bassBars },
      s: opts.bassSound ?? ctx.rng.pick(["ebass", "upright"]),
      gain: jitter(ctx, 0.8),
    },
  ];
  if (opts.drums) {
    const bank = pickKit(ctx);
    const kit = bank ? { bank } : {};
    tracks.push({
      label: "kick",
      src: "s",
      pat: line(["bd", null, "bd", null]),
      gain: jitter(ctx, 0.8),
      ...kit,
    });
    tracks.push({
      label: "snare",
      src: "s",
      pat: line([null, "sd", null, "sd"]),
      gain: jitter(ctx, 0.6),
      ...kit,
    });
    tracks.push({ label: "hats", src: "s", pat: seq([atom("hh", 8)]), gain: jitter(ctx, 0.35), ...kit });
  }
  return { tracks, bass: bassMidis };
}

// --- har.bass -----------------------------------------------------------------------------------

const BASS_LOOPS: Readonly<Record<string, { mode: ScaleMode; chords: RnChord[][] }[]>> = {
  "schema-roots": [
    { mode: "major", chords: [[rn("1", "maj")], [rn("5", "maj")], [rn("6", "min")], [rn("4", "maj")]] },
    { mode: "major", chords: [[rn("1", "maj")], [rn("6", "min")], [rn("4", "maj")], [rn("5", "maj")]] },
    { mode: "major", chords: [[rn("6", "min")], [rn("4", "maj")], [rn("1", "maj")], [rn("5", "maj")]] },
    { mode: "major", chords: [[rn("1", "maj")], [rn("4", "maj")], [rn("5", "maj")], [rn("1", "maj")]] },
  ],
  inversions: [
    { mode: "major", chords: [[rn("1", "maj")], [rn("5", "maj", 1)], [rn("6", "min")], [rn("4", "maj")]] },
    { mode: "major", chords: [[rn("1", "maj")], [rn("1", "maj", 1)], [rn("4", "maj")], [rn("5", "maj")]] },
    { mode: "major", chords: [[rn("4", "maj")], [rn("1", "maj", 2)], [rn("5", "maj")], [rn("1", "maj")]] },
  ],
  "two-per-bar": [
    {
      mode: "major",
      chords: [
        [rn("1", "maj"), rn("5", "maj", 1)],
        [rn("6", "min"), rn("1", "maj", 2)],
        [rn("4", "maj"), rn("1", "maj", 1)],
        [rn("2", "min"), rn("5", "maj")],
      ],
    },
    {
      mode: "major",
      chords: [
        [rn("1", "maj"), rn("3", "min")],
        [rn("4", "maj"), rn("5", "maj")],
        [rn("6", "min"), rn("5", "maj", 1)],
        [rn("4", "maj"), rn("5", "maj")],
      ],
    },
  ],
  minor: [
    { mode: "minor", chords: [[rn("1", "min")], [rn("b6", "maj")], [rn("b3", "maj")], [rn("b7", "maj")]] },
    { mode: "minor", chords: [[rn("1", "min")], [rn("4", "min")], [rn("5", "maj")], [rn("1", "min")]] },
    { mode: "dorian", chords: [[rn("1", "min")], [rn("4", "maj")], [rn("1", "min")], [rn("4", "maj")]] },
  ],
  chromatic: [
    { mode: "major", chords: [[rn("1", "maj")], [rn("b6", "maj")], [rn("b7", "maj")], [rn("1", "maj")]] },
    {
      mode: "major",
      chords: [
        [rn("1", "maj")],
        [rn("6", "min")],
        [{ degree: "5", quality: "maj", of: "5" }],
        [rn("5", "maj")],
      ],
    },
    {
      mode: "major",
      chords: [
        [rn("1", "maj")],
        [{ degree: "5", quality: "maj", of: "6" }],
        [rn("6", "min")],
        [rn("4", "maj")],
      ],
    },
  ],
};
function diatonicRootsLoop(ctx: GenCtx): { mode: ScaleMode; chords: RnChord[][] } {
  const key: KeySpec = { tonic: "C", mode: "major" };
  const indices = [1, ...Array.from({ length: 3 }, () => ctx.rng.int(2, 7))];
  return { mode: "major", chords: indices.map((i) => [diatonicChord(key, i)]) };
}
export const bassDegrees: Generator = {
  name: "harmony-bass",
  generate(ctx) {
    const loop =
      ctx.category === "diatonic-roots"
        ? diatonicRootsLoop(ctx)
        : ctx.rng.pick(BASS_LOOPS[ctx.category] ?? (BASS_LOOPS["schema-roots"] as never));
    const key = pickKey(ctx, loop.mode);
    const { tracks, bass } = arrangement(ctx, key, loop.chords);
    const piece = buildPiece({ bpm: pickTempo(ctx), bars: loop.chords.length, tracks });
    const degrees = bass.map((m) => degreeOfMidi(m, { tonic: key.tonic, mode: "major" }));
    return trialOf(piece, { degrees }, cueOf(ctx), {
      mode: "choice",
      key,
      ui: "degree-pad",
      sequenceLen: degrees.length,
      singMode: "bassline",
    });
  },
};

// --- har.schema ---------------------------------------------------------------------------------

export const SCHEMA_LOOPS: Readonly<Record<string, { mode: ScaleMode; chords: RnChord[][] }>> = {
  axis: { mode: "major", chords: [[rn("1", "maj")], [rn("5", "maj")], [rn("6", "min")], [rn("4", "maj")]] },
  "three-chord": {
    mode: "major",
    chords: [[rn("1", "maj")], [rn("4", "maj")], [rn("5", "maj")], [rn("1", "maj")]],
  },
  "axis-vi": {
    mode: "major",
    chords: [[rn("6", "min")], [rn("4", "maj")], [rn("1", "maj")], [rn("5", "maj")]],
  },
  "doo-wop": {
    mode: "major",
    chords: [[rn("1", "maj")], [rn("6", "min")], [rn("4", "maj")], [rn("5", "maj")]],
  },
  aeolian: {
    mode: "minor",
    chords: [[rn("1", "min")], [rn("b6", "maj")], [rn("b7", "maj")], [rn("1", "min")]],
  },
  andalusian: {
    mode: "minor",
    chords: [[rn("1", "min")], [rn("b7", "maj")], [rn("b6", "maj")], [rn("5", "maj")]],
  },
  blues12: {
    mode: "major",
    chords: ["1", "1", "1", "1", "4", "4", "1", "1", "5", "4", "1", "5"].map((d) => [rn(d as Degree, "7")]),
  },
  mixolydian: {
    mode: "mixolydian",
    chords: [[rn("1", "maj")], [rn("b7", "maj")], [rn("4", "maj")], [rn("1", "maj")]],
  },
  "dorian-vamp": {
    mode: "dorian",
    chords: [[rn("1", "min")], [rn("4", "maj")], [rn("1", "min")], [rn("4", "maj")]],
  },
  "ii-V-I": {
    mode: "major",
    chords: [[rn("2", "m7")], [rn("5", "7")], [rn("1", "maj7")], [rn("1", "maj7")]],
  },
};
export const schema: Generator = {
  name: "harmony-schema",
  generate(ctx) {
    const loop = SCHEMA_LOOPS[ctx.category] ?? (SCHEMA_LOOPS.axis as (typeof SCHEMA_LOOPS)[string]);
    const key = pickKey(ctx, loop.mode);
    const { tracks } = arrangement(ctx, key, loop.chords, { drums: ctx.level.full === true });
    const piece = buildPiece({ bpm: pickTempo(ctx), bars: loop.chords.length, tracks });
    return trialOf(piece, { choice: [ctx.category] }, cueOf(ctx), { mode: "choice", key });
  },
};

// --- har.cadence --------------------------------------------------------------------------------

/** Phrase chords and the soprano's last two scale steps (0 = tonic). */
const CADENCE_PHRASES: Readonly<
  Record<string, { mode: ScaleMode; answer: string; chords: RnChord[]; soprano: number[][] }>
> = {
  PAC: {
    mode: "major",
    answer: "PAC",
    chords: [rn("1", "maj"), rn("4", "maj"), rn("5", "maj"), rn("1", "maj")],
    soprano: [
      [2, 3, 1, 0],
      [4, 5, 6, 7],
      [2, 0, 1, 0],
    ],
  },
  IAC: {
    mode: "major",
    answer: "IAC",
    chords: [rn("1", "maj"), rn("4", "maj"), rn("5", "maj"), rn("1", "maj")],
    soprano: [
      [0, 0, 1, 2],
      [4, 5, 4, 2],
      [4, 3, 4, 4],
    ],
  },
  HC: {
    mode: "major",
    answer: "HC",
    chords: [rn("1", "maj"), rn("6", "min"), rn("2", "min"), rn("5", "maj")],
    soprano: [
      [2, 2, 1, 1],
      [4, 5, 5, 4],
      [0, 0, 3, 1],
    ],
  },
  PC: {
    mode: "major",
    answer: "PC",
    chords: [rn("1", "maj"), rn("5", "maj"), rn("4", "maj"), rn("1", "maj")],
    soprano: [
      [2, 1, 0, 0],
      [4, 4, 5, 4],
      [0, 1, 3, 2],
    ],
  },
  DC: {
    mode: "major",
    answer: "DC",
    chords: [rn("1", "maj"), rn("4", "maj"), rn("5", "maj"), rn("6", "min")],
    soprano: [
      [2, 3, 1, 0],
      [4, 5, 6, 7],
      [0, 0, 6, 7],
    ],
  },
  "bVII-I": {
    mode: "major",
    answer: "bVII-I",
    chords: [rn("1", "maj"), rn("4", "maj"), rn("b7", "maj"), rn("1", "maj")],
    soprano: [
      [2, 3, 3, 2],
      [4, 3, 3, 4],
      [0, 0, 1, 0],
    ],
  },
  "minor-PAC": {
    mode: "minor",
    answer: "PAC",
    chords: [rn("1", "min"), rn("4", "min"), rn("5", "maj"), rn("1", "min")],
    soprano: [
      [2, 3, 1, 0],
      [4, 5, 6, 7],
    ],
  },
  "minor-HC": {
    mode: "minor",
    answer: "HC",
    chords: [rn("1", "min"), rn("b6", "maj"), rn("4", "min"), rn("5", "maj")],
    soprano: [
      [2, 2, 3, 1],
      [4, 5, 5, 4],
    ],
  },
};
export const cadence: Generator = {
  name: "harmony-cadence",
  generate(ctx) {
    const phrase = CADENCE_PHRASES[ctx.category] ?? (CADENCE_PHRASES.PAC as (typeof CADENCE_PHRASES)[string]);
    const key = pickKey(ctx, phrase.mode);
    const voiced = voiceProgression(phrase.chords, key);
    const sop = ctx.rng.pick(phrase.soprano).map((s) => {
      // The minor key's leading tone is the raised 7th: step 6 of the scale sharpened.
      if (phrase.mode === "minor" && s === 6) return "6#";
      return s;
    });
    const octave = pickOctave(ctx.rng, key, 64, 75);
    const piece = buildPiece({
      bpm: pickTempo(ctx),
      bars: 1,
      tracks: [
        {
          label: "chords",
          src: "note",
          pat: seq(voiced.map((v) => voicedNode(v, key))),
          s: pickSound(ctx),
          gain: jitter(ctx, 0.5),
        },
        stepTrack(key, octave, [line(sop)], "piano", { gain: 0.7 }),
      ],
    });
    return trialOf(piece, { choice: [phrase.answer] }, cueOf(ctx), {
      mode: "choice",
      key,
      phrase: ctx.category,
    });
  },
};

// --- jzz.ii-v -----------------------------------------------------------------------------------

const II_V: Readonly<Record<string, { mode: ScaleMode; chords: RnChord[] }>> = {
  "ii-V-I": { mode: "major", chords: [rn("2", "m7"), rn("5", "7"), rn("1", "maj7"), rn("1", "maj7")] },
  "I-IV-V": { mode: "major", chords: [rn("1", "maj7"), rn("4", "maj7"), rn("5", "7"), rn("1", "maj7")] },
  "major-ii-V": { mode: "major", chords: [rn("2", "m7"), rn("5", "7"), rn("1", "maj7"), rn("1", "maj7")] },
  "minor-ii-V": { mode: "minor", chords: [rn("2", "m7b5"), rn("5", "7"), rn("1", "min"), rn("1", "min")] },
};
export const iiV: Generator = {
  name: "jazz-ii-v",
  generate(ctx) {
    if (ctx.category === "locate") {
      // Eight bars of I/vi/IV fillers with one or two ii–V pairs; answer: the bars where each ii starts.
      const key = pickKey(ctx, "major");
      const bars: RnChord[] = [];
      const starts: number[] = [];
      while (bars.length < 8) {
        const room = 8 - bars.length;
        if (room >= 3 && starts.length < 2 && ctx.rng.next() < 0.45) {
          starts.push(bars.length + 1);
          bars.push(rn("2", "m7"), rn("5", "7"), rn("1", "maj7"));
        } else bars.push(ctx.rng.pick([rn("1", "maj7"), rn("6", "m7"), rn("4", "maj7"), rn("3", "m7")]));
      }
      if (starts.length === 0) {
        starts.push(5);
        bars.splice(4, 3, rn("2", "m7"), rn("5", "7"), rn("1", "maj7"));
      }
      const { tracks } = arrangement(
        ctx,
        key,
        bars.map((b) => [b]),
        { chordSound: ctx.rng.pick(["rhodes", "piano"]), bassSound: "upright" },
      );
      const piece = buildPiece({ bpm: pickTempo(ctx), bars: 8, tracks });
      return trialOf(piece, { choice: starts.map(String) }, cueOf(ctx), {
        mode: "choice",
        ui: "bar-buttons",
        bars: 8,
        key,
      });
    }
    if (ctx.category === "chain") {
      // Descending ii–V–I chain by whole steps: name the key of each.
      const first = pickKey(ctx, "major");
      const keys = [0, -2, -4].map((s) => {
        const pc = mod(tonicMidi(first.tonic, 4) + s, 12);
        return keysFor("all", "major").find((k) => mod(tonicMidi(k.tonic, 4), 12) === pc) as KeySpec;
      });
      const slots: RnChord[][] = [];
      const tracks: TrackSpec[] = [];
      const chordNodes: Node[] = [];
      for (const k of keys) {
        const voiced = voiceProgression([rn("2", "m7"), rn("5", "7"), rn("1", "maj7")], k);
        for (const v of voiced) chordNodes.push(seq([voicedNode(v, k)]));
        slots.push([]);
      }
      tracks.push({
        label: "chords",
        src: "note",
        pat: { t: "alt", items: chordNodes },
        s: "rhodes",
        gain: jitter(ctx, 0.55),
      });
      const piece = buildPiece({ bpm: pickTempo(ctx), bars: chordNodes.length, tracks });
      return trialOf(piece, { text: keys.map((k) => k.tonic) }, cueOf(ctx), {
        mode: "choice",
        ui: "text",
        textKind: "pc",
        keys,
        prompt: "Name the key each ii–V–I lands in.",
      });
    }
    const prog = II_V[ctx.category] ?? (II_V["ii-V-I"] as (typeof II_V)[string]);
    const key = pickKey(ctx, prog.mode);
    const { tracks } = arrangement(
      ctx,
      key,
      prog.chords.map((c) => [c]),
      { chordSound: ctx.rng.pick(["rhodes", "piano"]), bassSound: "upright" },
    );
    const piece = buildPiece({ bpm: pickTempo(ctx), bars: 4, tracks });
    return trialOf(piece, { choice: [ctx.category] }, cueOf(ctx), { mode: "choice", key });
  },
};

export const _harmony = { stepForDegree, rnRootPc, MODE_STEPS, rest, pickOctave, tonicMidi };
export type { Answer };
