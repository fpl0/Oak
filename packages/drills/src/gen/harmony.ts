// Harmony families: Roman numerals (concept), function, bass-degree dictation, schema ID, cadence ID and
// ii–V recognition. Progressions are RnChords in a key, voiced by Oak's voicer with smooth upper voices.
import type { Answer, ChordQuality, Degree, KeySpec, ScaleMode } from "@oak/content-kit";
import { chordSymbol, displayRN, parseRN } from "@oak/theory";
import { buildPiece, type TrackSpec } from "../build.ts";
import {
  chordCode,
  chordPcs,
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
  stepToMidi,
  tonicMidi,
} from "../kernel.ts";
import { above, closeVoices, rn, spellVoiced, type Voiced, voiceProgression } from "../music.ts";
import { atom, chordOf, line, type Node, rest, seq } from "../pat.ts";
import {
  CTX,
  contextOpen,
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

/** V7 of a target degree: [scale step of the target, the target's degree]. */
const APPLIED_TARGETS: Readonly<Record<string, readonly { index: number; degree: Degree }[]>> = {
  // U15.L02 "Five of Five"; U15.L03 "Visiting Other Chords" (V7/vi, V7/ii, V7/IV).
  applied: [{ index: 5, degree: "5" }],
  "applied-visitors": [
    { index: 6, degree: "6" },
    { index: 2, degree: "2" },
    { index: 4, degree: "4" },
  ],
};
/**
 * Borrowed chords by lesson, each with the key's own chord it is the near miss of (one changed note, or the
 * chord on the same degree): iv against IV (U16.L01), ♭VI against vi and ♭VII against vii° (U16.L02), ♭III
 * against iii (U16.L03).
 */
const BORROWED: Readonly<Record<string, readonly { rn: string; chord: RnChord; twin: number }[]>> = {
  borrowed: [{ rn: "iv", chord: rn("4", "min"), twin: 4 }],
  "borrowed-flats": [
    { rn: "bVI", chord: rn("b6", "maj"), twin: 6 },
    { rn: "bVII", chord: rn("b7", "maj"), twin: 7 },
  ],
  "borrowed-bIII": [{ rn: "bIII", chord: rn("b3", "maj"), twin: 3 }],
};
/** The palette a numeral answer needs (the drill runner's `rn-palette.allow`). */
const RN_ALLOW: Readonly<Record<string, string[]>> = {
  sevenths: ["triads", "sevenths"],
  "minor-sevenths": ["triads", "sevenths"],
  applied: ["triads", "sevenths", "secondary"],
  "applied-visitors": ["triads", "sevenths", "secondary"],
  borrowed: ["triads", "borrowed"],
  "borrowed-flats": ["triads", "borrowed"],
  "borrowed-bIII": ["triads", "borrowed"],
};
/** How often a chromatic category asks for the key's own chord on the same root instead (the near miss). */
const TWIN_SHARE = 0.25;

export const rnFacts: Generator = {
  name: "harmony-rn",
  generate(ctx) {
    const cue = cueOf(ctx, { replays: -1 });
    const cat = ctx.category;
    const minor = cat === "minor-triads" || cat === "minor-sevenths";
    // Natural minor (i ii° III iv v VI VII) from U10.L04; the major V and vii° of harmonic minor join at U10.L06,
    // so v against V and VII against vii° become the near misses.
    const majorV = minor && contextOpen(ctx, CTX.majorV);
    // Minor keys up to four sharps or flats (C♭ as VI of E♭ minor is a spelling for later).
    const key = pickKey(ctx, minor ? "minor" : "major", minor ? "≤4acc" : ctx.level.keys);
    let rnText: string;
    let symbol: string;
    let twinOf: string | null = null;
    const applied = APPLIED_TARGETS[cat];
    const borrowed = BORROWED[cat];
    if (applied) {
      const t = ctx.rng.pick(applied);
      const target = diatonicInKey(key, t.index, false);
      const c: RnChord = { degree: "5", quality: "7", of: t.degree };
      const root = rnRoot(c, key);
      symbol = chordCode(root, "7");
      rnText = `V7/${target.rn}`;
      // The near miss: the key's own chord on the same root (D7 is V7/V in C; Dm is ii).
      if (ctx.rng.next() < TWIN_SHARE) {
        const twin = diatonicInKey(key, ((t.index + 3) % 7) + 1, false);
        twinOf = rnText;
        symbol = twin.symbol;
        rnText = twin.rn;
      }
    } else if (borrowed) {
      const b = ctx.rng.pick(borrowed);
      symbol = chordCode(rnRoot(b.chord, key), b.chord.quality);
      rnText = b.rn;
      // The near miss: the key's own chord on that degree (A♭ is ♭VI in C; Am is vi).
      if (ctx.rng.next() < TWIN_SHARE) {
        const twin = diatonicInKey(key, b.twin, false);
        twinOf = rnText;
        symbol = twin.symbol;
        rnText = twin.rn;
      }
    } else {
      const index = ctx.rng.int(1, 7);
      const sevenths = cat === "sevenths" || cat === "minor-sevenths";
      // Sevenths in a minor key (U12.L05) are written with the key's V7 and vii°7 as often as with v7 and VII7.
      const harmonic = majorV && (index === 5 || index === 7) && ctx.rng.next() < 0.5;
      const d = diatonicInKey(key, index, sevenths, harmonic);
      symbol = d.symbol;
      rnText = d.rn;
    }
    const keyName = shownKey(key);
    const toChord = ctx.rng.next() < 0.5;
    const extra = {
      ...(RN_ALLOW[cat] ? { rnAllow: RN_ALLOW[cat] } : {}),
      ...(twinOf ? { nearMissOf: twinOf } : {}),
    };
    return toChord
      ? silentTrial({ text: [symbol] }, cue, {
          key,
          ui: "text",
          textKind: "chord",
          rn: rnText,
          ...extra,
          prompt: `In ${keyName}, which chord is ${shownRn(rnText, key)}? (code spelling, e.g. F#m)`,
        })
      : silentTrial({ rn: [rnText] }, cue, {
          key,
          ui: "rn-palette",
          symbol,
          ...extra,
          prompt: `In ${keyName}, ${shownSymbol(symbol)} is which Roman numeral?`,
        });
  },
};

/**
 * What a prompt prints: the lead-sheet symbol ("B°", "F♯m") and the display numeral ("vii°", "♭VII"); the
 * answers keep Oak's code spellings ("Bo", "viio"), which is what the learner types.
 */
const shownKey = (key: KeySpec) => `${key.tonic.replace("#", "♯").replace(/(?<=[A-G])b/, "♭")} ${key.mode}`;
const shownSymbol = (code: string) => chordSymbol(code, "lead-sheet") ?? code;
const shownRn = (text: string, key: KeySpec) => {
  if (text.includes("/")) return text.replace(/o/g, "°");
  const parsed = parseRN(text, key);
  return parsed ? displayRN(parsed) : text;
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
    // In minor the dominant is v until U10.L06 teaches the major V (and vii°, which is only a dominant then: the
    // natural VII is the subtonic, never asked for a function).
    const harmonicV = minor && contextOpen(ctx, CTX.majorV);
    const key = pickKey(ctx, minor ? "minor" : "major");
    const pool = (FUNCTIONS[minor ? "minor" : "major"] ?? []).filter(
      (f) => f.fn === ctx.category && !(minor && !harmonicV && f.index === 7),
    );
    const pick = ctx.rng.pick(pool);
    const seventh = ctx.level.sevenths === true && ctx.rng.next() < 0.5;
    const d = diatonicInKey(key, pick.index, seventh, harmonicV);
    if (ctx.level.heard !== true)
      return silentTrial({ choice: [pick.fn] }, cueOf(ctx, { replays: -1 }), {
        key,
        rn: d.rn,
        prompt: `In ${shownKey(key)}, what is the function of ${shownRn(d.rn, key)}?`,
      });
    // Heard: a four-chord loop I – x – … with the marked chord in bar 3.
    const chords: RnChord[] = [
      diatonicInKey(key, 1, false, harmonicV).chord,
      diatonicInKey(key, ctx.rng.pick([4, 6, 2]), false, harmonicV).chord,
      d.chord,
      diatonicInKey(key, 1, false, harmonicV).chord,
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
  // The bass moves to the nearest octave of its next note, inside E1–A♭3 (a bass player's line, not a root
  // in a fixed octave that jumps a 7th).
  let lastBass: number | null = null;
  const nearestBass = (pc: number): number => {
    const low = above(pc, 28);
    const options = [low, low + 12, low + 24].filter((m) => m <= 56);
    const ref = lastBass ?? 40;
    return options.sort((a, b) => Math.abs(a - ref) - Math.abs(b - ref))[0] as number;
  };
  let k = 0;
  const chordBars: Node[] = [];
  const bassBars: Node[] = [];
  for (const bar of slots) {
    const cs: Node[] = [];
    const bs: Node[] = [];
    for (let i = 0; i < bar.length; i++) {
      const v = voiced[k++] as Voiced;
      const bassPc = mod(v.midis[0] as number, 12);
      const bass = nearestBass(bassPc);
      lastBass = bass;
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
    // The walk-down of U06.L11: C G/B Am G, the bass 1 7 6 5.
    { mode: "major", chords: [[rn("1", "maj")], [rn("5", "maj", 1)], [rn("6", "min")], [rn("5", "maj")]] },
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
  // Minor loops in what U10 teaches (content/specs/U10.md): the key's natural chords from U10.L04 (i–iv–v–i, the
  // L04 hook i–iv–VII–III, the Aeolian loop i–VI–III–VII, VI–VII–i), the major V from U10.L06 and the
  // Andalusian cadence from U10.L07 (`MINOR_BASS_LOOPS`). No Dorian i–IV before U14.
  minor: [
    { mode: "minor", chords: [[rn("1", "min")], [rn("b6", "maj")], [rn("b3", "maj")], [rn("b7", "maj")]] },
    { mode: "minor", chords: [[rn("1", "min")], [rn("4", "min")], [rn("5", "min")], [rn("1", "min")]] },
    { mode: "minor", chords: [[rn("1", "min")], [rn("4", "min")], [rn("b7", "maj")], [rn("b3", "maj")]] },
    { mode: "minor", chords: [[rn("1", "min")], [rn("b6", "maj")], [rn("b7", "maj")], [rn("1", "min")]] },
  ],
  // The bass under secondary dominants (U15.L06): its root is a note of the key (2 under V7/V, 3 under V7/vi,
  // 6 under V7/ii, 1 under V7/IV), so the line is heard in degrees the learner knows while the chord above it
  // steps outside; and the dominant chain of U15.L05 (3 6 2 5).
  chromatic: [
    { mode: "major", chords: [[rn("1", "maj")], [rn("6", "min")], [ap7("5")], [rn("5", "maj")]] },
    { mode: "major", chords: [[rn("1", "maj")], [ap7("6")], [rn("6", "min")], [rn("4", "maj")]] },
    { mode: "major", chords: [[rn("1", "maj")], [ap7("2")], [rn("2", "min")], [rn("5", "maj")]] },
    { mode: "major", chords: [[rn("1", "maj")], [ap7("4")], [rn("4", "maj")], [rn("5", "maj")]] },
    { mode: "major", chords: [[ap7("6")], [ap7("2")], [ap7("5")], [rn("5", "7")]] },
  ],
  // The roots of the borrowed chords (U16): ♭6 and ♭7 climbing home, 4 under iv, ♭3 on the way to IV.
  borrowed: [
    { mode: "major", chords: [[rn("1", "maj")], [rn("b6", "maj")], [rn("b7", "maj")], [rn("1", "maj")]] },
    { mode: "major", chords: [[rn("1", "maj")], [rn("4", "maj")], [rn("4", "min")], [rn("1", "maj")]] },
    { mode: "major", chords: [[rn("1", "maj")], [rn("b3", "maj")], [rn("4", "maj")], [rn("1", "maj")]] },
    { mode: "major", chords: [[rn("1", "maj")], [rn("b7", "maj")], [rn("4", "maj")], [rn("1", "maj")]] },
    { mode: "major", chords: [[rn("1", "maj")], [rn("6", "min")], [rn("b6", "maj")], [rn("5", "maj")]] },
  ],
};
/** V7 of a target degree. */
function ap7(target: Degree): RnChord {
  return { degree: "5", quality: "7", of: target };
}
/** Minor loops that wait for a later lesson: the major V (U10.L06), the Andalusian cadence (U10.L07). */
const MINOR_BASS_LOOPS: readonly { needs: string; mode: ScaleMode; chords: RnChord[][] }[] = [
  {
    needs: CTX.majorV,
    mode: "minor",
    chords: [[rn("1", "min")], [rn("4", "min")], [rn("5", "maj")], [rn("1", "min")]],
  },
  {
    needs: CTX.majorV,
    mode: "minor",
    chords: [[rn("1", "min")], [rn("b6", "maj")], [rn("4", "min")], [rn("5", "maj")]],
  },
  {
    needs: CTX.andalusian,
    mode: "minor",
    chords: [[rn("1", "min")], [rn("b7", "maj")], [rn("b6", "maj")], [rn("5", "maj")]],
  },
];
function minorLoop(ctx: GenCtx): { mode: ScaleMode; chords: RnChord[][] } {
  const later = MINOR_BASS_LOOPS.filter((l) => contextOpen(ctx, l.needs));
  return ctx.rng.pick([...(BASS_LOOPS.minor ?? []), ...later]);
}
function diatonicRootsLoop(ctx: GenCtx): { mode: ScaleMode; chords: RnChord[][] } {
  const key: KeySpec = { tonic: "C", mode: "major" };
  const indices = [1, ...Array.from({ length: 3 }, () => ctx.rng.int(2, 7))];
  return { mode: "major", chords: indices.map((i) => [diatonicChord(key, i)]) };
}
export const bassDegrees: Generator = {
  name: "harmony-bass",
  generate(ctx) {
    if (ctx.category === "lines") return bassLine(ctx);
    // Each category has its own mode (the loops of a major key, or `minor`); only `lines` has both and follows
    // the mode a lesson step asks for (`ctx.mode`, d8).
    const loop =
      ctx.category === "diatonic-roots"
        ? diatonicRootsLoop(ctx)
        : ctx.category === "minor"
          ? minorLoop(ctx)
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

/** What the bass plays on beat 3 of a bar in a U08 line: the 5th, the octave, or an approach to the next root. */
export type BassMove = "fifth" | "octave" | "approach";
/**
 * A bass line of U08 to take down (the `lines` category): four bars of a loop the learner knows, two notes a
 * bar: the root on beat 1, then on beat 3 the chord's 5th (above, or below when above leaves the bass), the
 * root an octave up or down, or a diatonic approach note a step above or below the next bar's root (U08.L02:
 * root and 5th; U08.L03: octave and approach). Every bar has a different move from the bar before when it can,
 * so roots and 5ths sit side by side in the answer (the near miss the family drills). In E1–A♭3.
 */
function bassLine(ctx: GenCtx) {
  // Level 5 opens at U10.L04, so a line may be in a minor key as well (its natural chords).
  const roll = ctx.rng.next();
  const minor = ctx.mode === "minor" || (ctx.mode !== "major" && roll < 0.4);
  const loop = minor ? ctx.rng.pick(BASS_LOOPS.minor ?? []) : ctx.rng.pick(BASS_LOOPS["schema-roots"] ?? []);
  const key = pickKey(ctx, loop.mode);
  const { tracks, bass: roots } = arrangement(ctx, key, loop.chords);
  const steps = MODE_STEPS[key.mode];
  const tonicPc = parsePcOf(key.tonic);
  const scalePcs = steps.map((x) => mod(tonicPc + x, 12));
  const inBass = (m: number) => m >= 28 && m <= 56;
  const midis: number[] = [];
  const moves: BassMove[] = [];
  let last: BassMove | null = null;
  roots.forEach((root, i) => {
    const next = roots[(i + 1) % roots.length] as number;
    const chord = loop.chords[i]?.[0] as RnChord;
    const fifthPc = mod(rnRootPc(chord, key) + 7, 12);
    const options: BassMove[] = ["fifth", "octave", "approach"];
    // The approach: the scale note a step above or below the next root (never the root itself).
    const nextIdx = scalePcs.indexOf(mod(next, 12));
    const approachPcs =
      nextIdx < 0
        ? []
        : [scalePcs[(nextIdx + 1) % 7] as number, scalePcs[(nextIdx + 6) % 7] as number].filter(
            (pc) => pc !== mod(root, 12),
          );
    // The 5th or the octave above or below, whichever leaves the next root nearer (a bass player's choice).
    const nearer = (cands: number[]) =>
      cands.filter(inBass).sort((x, y) => Math.abs(x - next) - Math.abs(y - next))[0] ?? null;
    const secondOf = (m: BassMove): number | null => {
      if (m === "fifth") {
        const up = root + mod(fifthPc - root, 12);
        return nearer([up, up - 12]);
      }
      if (m === "octave") return nearer([root + 12, root - 12]);
      // The approach sits a step from the next root.
      const cands = [-2, -1, 1, 2]
        .map((d) => next + d)
        .filter((x) => approachPcs.includes(mod(x, 12)) && inBass(x));
      return cands.sort((x, y) => Math.abs(x - root) - Math.abs(y - root))[0] ?? null;
    };
    // A move is playable when its note stays within an octave of this root and of the next one.
    const all = options
      .map((o) => ({ o, n: secondOf(o) }))
      .filter((c): c is { o: BassMove; n: number } => c.n !== null);
    const playable = all.filter((c) => Math.abs(c.n - root) <= 12 && Math.abs(c.n - next) <= 12);
    const fresh = playable.filter((c) => c.o !== last);
    const choice = ctx.rng.pick(fresh.length > 0 ? fresh : playable.length > 0 ? playable : all);
    const move = choice.o;
    const second = choice.n;
    midis.push(root, second);
    moves.push(move);
    last = move;
  });
  const bassBars: Node[] = [];
  for (let b = 0; b < roots.length; b++)
    bassBars.push(
      seq([
        atom(spellMidi(midis[2 * b] as number, key).code),
        atom(spellMidi(midis[2 * b + 1] as number, key).code),
      ]),
    );
  const bassTrack = tracks.find((t) => t.label === "bass") as TrackSpec;
  bassTrack.pat = { t: "alt", items: bassBars };
  const piece = buildPiece({ bpm: pickTempo(ctx), bars: roots.length, tracks });
  const degrees = midis.map((m) => degreeOfMidi(m, { tonic: key.tonic, mode: "major" }));
  return trialOf(piece, { degrees }, cueOf(ctx), {
    mode: "choice",
    key,
    ui: "degree-pad",
    sequenceLen: degrees.length,
    singMode: "bassline",
    moves,
  });
}
const parsePcOf = (tonic: string): number => mod(tonicMidi(tonic, 4), 12);

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
  // `schema.aeolian` (U10.L05): i–VI–III–VII, Am F C G in A minor.
  aeolian: {
    mode: "minor",
    chords: [[rn("1", "min")], [rn("b6", "maj")], [rn("b3", "maj")], [rn("b7", "maj")]],
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
/**
 * Loops that are the same four chords with another home (U10.L05: Am F C G is i–VI–III–VII in A minor and
 * vi–IV–I–V in C): played as chords alone they sound alike, so a trial never offers its twin.
 */
const SCHEMA_TWINS: Readonly<Record<string, string>> = { aeolian: "axis-vi", "axis-vi": "aeolian" };
export const schema: Generator = {
  name: "harmony-schema",
  generate(ctx) {
    const loop = SCHEMA_LOOPS[ctx.category] ?? (SCHEMA_LOOPS.axis as (typeof SCHEMA_LOOPS)[string]);
    const key = pickKey(ctx, loop.mode);
    const { tracks } = arrangement(ctx, key, loop.chords, { drums: ctx.level.full === true });
    const piece = buildPiece({ bpm: pickTempo(ctx), bars: loop.chords.length, tracks });
    // The loops the learner has met at this level (never one still closed), the answer's twin left out.
    const twin = SCHEMA_TWINS[ctx.category];
    const options = ctx.level.categories.filter(
      (c) => (c === ctx.category || ctx.openCategories.includes(c)) && c !== twin,
    );
    return trialOf(piece, { choice: [ctx.category] }, cueOf(ctx), { mode: "choice", key, options });
  },
};

// --- har.cadence --------------------------------------------------------------------------------

/** Phrase chords and the soprano's last two scale steps (0 = tonic). */
const CADENCE_PHRASES: Readonly<
  Record<string, { mode: ScaleMode; answer: string; chords: RnChord[]; soprano: (number | string)[][] }>
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
  // U16.L03: the plagal cadence with a minor IV (IV–iv–I), the tune leaning la–le–sol or holding fa.
  "minor-plagal": {
    mode: "major",
    answer: "minor-plagal",
    chords: [rn("1", "maj"), rn("4", "maj"), rn("4", "min"), rn("1", "maj")],
    soprano: [
      [4, 5, "5b", 4],
      [2, 3, 3, 2],
      [0, 0, 0, 0],
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
/** The cadence answers in teaching order (CADENCE_OPTIONS' ids, then ♭VII–I and the minor plagal cadence). */
const CADENCE_ORDER: readonly string[] = ["PAC", "IAC", "HC", "PC", "DC", "bVII-I", "minor-plagal"];
const CADENCE_LABELS: Readonly<Record<string, string>> = {
  "minor-plagal": "Plagal with a minor IV (IV–iv–I)",
};
export const cadence: Generator = {
  name: "harmony-cadence",
  generate(ctx) {
    const phrase = CADENCE_PHRASES[ctx.category] ?? (CADENCE_PHRASES.PAC as (typeof CADENCE_PHRASES)[string]);
    const key = pickKey(ctx, phrase.mode);
    // The tune is the top voice: close triads under it, a bass under them (a cadence is heard in the outer
    // voices, so the melody must never sit inside the chords).
    const triads = closeVoices(phrase.chords, key, 57);
    const sop = ctx.rng.pick(phrase.soprano).map((s) => {
      // The minor key's leading tone is the raised 7th: step 6 of the scale sharpened.
      if (phrase.mode === "minor" && s === 6) return "6#";
      return s;
    });
    const top = Math.max(...triads.flatMap((v) => v.midis));
    let octave = 3;
    while (Math.min(...sop.map((x) => stepToMidi(x, key, octave))) <= top) octave++;
    const chordNodes = phrase.chords.map((c, i) => {
      const v = triads[i] as Voiced;
      const pcs = chordPcs(v.rootPc, c.quality);
      const bassPc = pcs[c.inversion ?? 0] as number;
      const bass = above(bassPc, 40);
      return chordOf([spellMidi(bass, key).code, ...spellVoiced(v, key)]);
    });
    const piece = buildPiece({
      bpm: pickTempo(ctx),
      bars: 1,
      tracks: [
        {
          label: "chords",
          src: "note",
          pat: seq(chordNodes),
          s: pickSound(ctx),
          gain: jitter(ctx, 0.5),
        },
        stepTrack(key, octave, [line(sop)], "piano", { gain: 0.7 }),
      ],
    });
    // The answers the learner has met, each once: a minor-key phrase is still a perfect authentic or a half
    // cadence, so "minor-PAC" and "minor-HC" are categories (what is practised), never answers of their own.
    const open = ctx.level.categories.filter((c) => c === ctx.category || ctx.openCategories.includes(c));
    const answers = new Set(open.map((c) => CADENCE_PHRASES[c]?.answer ?? c));
    const options = CADENCE_ORDER.filter((a) => answers.has(a));
    return trialOf(piece, { choice: [phrase.answer] }, cueOf(ctx), {
      mode: "choice",
      key,
      phrase: ctx.category,
      options,
      // Words for the answers the runner has no label of its own for.
      optionLabels: CADENCE_LABELS,
    });
  },
};

// --- jzz.ii-v -----------------------------------------------------------------------------------

/**
 * Four-bar phrases of `fam.jzz.ii-v`, every chord a seventh so the quality never gives the answer away.
 * Level 1 (J1.L03, content/specs/J1.md S6): does the phrase END with a ii–V–I? Bar 1 is the tonic, which sets the
 * key before anything is asked; the two near misses share most of the gesture: ii–V–vi (the same ii and V, the
 * deceptive landing) and IV–V–I (the same landing, approached from IV). Level 2 (J2.L02): the major ii–V–I against
 * the minor ii–V–i with one altered colour, the ♭9 of the key's own 6th (iiø7–V7♭9–i7).
 */
export const II_V_PHRASES: Readonly<Record<string, { mode: ScaleMode; chords: RnChord[] }>> = {
  "ii-V-I": { mode: "major", chords: [rn("1", "maj7"), rn("2", "m7"), rn("5", "7"), rn("1", "maj7")] },
  "ii-V-vi": { mode: "major", chords: [rn("1", "maj7"), rn("2", "m7"), rn("5", "7"), rn("6", "m7")] },
  "IV-V-I": { mode: "major", chords: [rn("1", "maj7"), rn("4", "maj7"), rn("5", "7"), rn("1", "maj7")] },
  "major-ii-V": { mode: "major", chords: [rn("2", "m7"), rn("5", "7"), rn("1", "maj7"), rn("1", "maj7")] },
  "minor-ii-V": { mode: "minor", chords: [rn("2", "m7b5"), rn("5", "7b9"), rn("1", "m7"), rn("1", "m7")] },
};
/** Level 1 answers: the phrase ends with a ii–V–I, or it does not (J1.L03 S6). */
const ENDS_LABELS = {
  "ii-V-I": "It ends with a ii–V–I",
  other: "It does not end with a ii–V–I",
} as const;
/** Level 2 answers (J2.L02): the two cadences by name. */
const MODE_II_V_LABELS = {
  "major-ii-V": "Major ii–V–I (ii7 V7 Imaj7)",
  "minor-ii-V": "Minor ii–V–i (iiø7 V7♭9 i7)",
} as const;
/** How the keys of a chain move (level 4): down a whole step (the Tune-Up chain) or up a 4th (J2.L01's cycle). */
export const CHAIN_MOVES = { "down-whole-step": -2, "up-fourth": 5 } as const;

export const iiV: Generator = {
  name: "jazz-ii-v",
  generate(ctx) {
    if (ctx.category === "locate") {
      // Eight bars of I/vi/IV/iii fillers with one or two ii–V–I runs; answer: the bars where each ii starts.
      // Bar 1 is always the tonic (the key before the question), and a ii–V never ends the phrase unresolved.
      const key = pickKey(ctx, "major");
      const bars: RnChord[] = [rn("1", "maj7")];
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
        multi: true,
        prompt: "In which bars does a ii–V–I start? Pick every one.",
      });
    }
    if (ctx.category === "chain") {
      // Three ii–V–Is, each into a new key. The first key is named and sounds first; the learner names the
      // other two (heard against it, never from absolute pitch).
      const first = pickKey(ctx, "major");
      const move = ctx.rng.pick(Object.keys(CHAIN_MOVES) as (keyof typeof CHAIN_MOVES)[]);
      const keys = [0, 1, 2].map((i) => {
        const pc = mod(tonicMidi(first.tonic, 4) + i * CHAIN_MOVES[move], 12);
        return keysFor("all", "major").find((k) => mod(tonicMidi(k.tonic, 4), 12) === pc) as KeySpec;
      });
      const chordNodes: Node[] = [];
      for (const k of keys) {
        const voiced = voiceProgression([rn("2", "m7"), rn("5", "7"), rn("1", "maj7")], k);
        for (const v of voiced) chordNodes.push(seq([voicedNode(v, k)]));
      }
      const tracks: TrackSpec[] = [
        {
          label: "chords",
          src: "note",
          pat: { t: "alt", items: chordNodes },
          s: "rhodes",
          gain: jitter(ctx, 0.55),
        },
      ];
      const piece = buildPiece({ bpm: pickTempo(ctx), bars: chordNodes.length, tracks });
      return trialOf(piece, { text: keys.slice(1).map((k) => k.tonic) }, cueOf(ctx), {
        mode: "choice",
        ui: "text",
        textKind: "pc",
        key: first,
        keys,
        firstKey: first.tonic,
        move,
        prompt: `The first ii–V–I lands in ${first.tonic.replace("#", "♯").replace(/^([A-G])b/, "$1♭")}. Name the keys the next two land in.`,
      });
    }
    const phrase = II_V_PHRASES[ctx.category] ?? (II_V_PHRASES["ii-V-I"] as (typeof II_V_PHRASES)[string]);
    const key = pickKey(ctx, phrase.mode);
    const { tracks } = arrangement(
      ctx,
      key,
      phrase.chords.map((c) => [c]),
      { chordSound: ctx.rng.pick(["rhodes", "piano"]), bassSound: "upright" },
    );
    const piece = buildPiece({ bpm: pickTempo(ctx), bars: 4, tracks });
    if (ctx.category === "major-ii-V" || ctx.category === "minor-ii-V") {
      const options = Object.keys(MODE_II_V_LABELS);
      return trialOf(piece, { choice: [ctx.category] }, cueOf(ctx), {
        mode: "choice",
        key,
        options,
        optionLabels: MODE_II_V_LABELS,
        prompt: "A major ii–V–I or a minor ii–V–i?",
      });
    }
    const answer = ctx.category === "ii-V-I" ? "ii-V-I" : "other";
    return trialOf(piece, { choice: [answer] }, cueOf(ctx), {
      mode: "choice",
      key,
      phrase: ctx.category,
      options: Object.keys(ENDS_LABELS),
      optionLabels: ENDS_LABELS,
      prompt: "Does the phrase end with a ii–V–I?",
    });
  },
};

export const _harmony = { stepForDegree, rnRootPc, MODE_STEPS, rest, pickOctave, tonicMidi };
export type { Answer };
