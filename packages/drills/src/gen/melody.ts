// Melody families: dictation (contour → degree pad → code → staff), echo (sing back), sight-singing,
// and the daily "Read it" family (two bars on the staff, the learner writes the code).
import type { Answer, Degree, KeySpec, ScaleMode } from "@oak/content-kit";
import { buildPiece } from "../build.ts";
import {
  chordCode,
  degreeOfMidi,
  MODE_STEPS,
  scaleArg,
  spellMidi,
  stepToMidi,
  tonicMidi,
} from "../kernel.ts";
import { atom, line, type Node, rest, seq } from "../pat.ts";
import type { Rng } from "../types.ts";
import {
  cueOf,
  type GenCtx,
  type Generator,
  num,
  pickKey,
  pickSound,
  pickTempo,
  range,
  str,
  trialOf,
} from "./common.ts";
import { chordTrack, contextBar, pickOctave, register, singTargets, stepTrack } from "./keyed.ts";

/** A melodic line as scale steps of a seven-note mode (0 = tonic; may go below 0 or above 6). */
export function melodySteps(
  rng: Rng,
  opts: {
    length: number;
    lowest: number;
    highest: number;
    leaps: boolean;
    leapMax: number;
    endOnTonic?: boolean;
  },
): number[] {
  const out: number[] = [rng.pick([0, 2, 4].filter((s) => s >= opts.lowest && s <= opts.highest))];
  while (out.length < opts.length) {
    const cur = out[out.length - 1] as number;
    const moves = [-1, 1, -1, 1, -2, 2];
    if (opts.leaps) for (let k = 2; k <= opts.leapMax; k++) moves.push(k, -k);
    const options = moves.map((m) => cur + m).filter((s) => s >= opts.lowest && s <= opts.highest);
    out.push(rng.pick(options.length > 0 ? options : [cur]));
  }
  if (opts.endOnTonic) out[out.length - 1] = (out[out.length - 1] as number) >= 4 ? 7 : 0;
  return out;
}

/** One bar of a melody: quarters (rhythm given) or a mix of quarters, eighth pairs and a half. */
function rhythmBars(
  rng: Rng,
  notes: (number | string)[],
  bars: number,
  varied: boolean,
): { nodes: Node[]; used: number } {
  const out: Node[] = [];
  let i = 0;
  for (let b = 0; b < bars; b++) {
    const beats: Node[] = [];
    const w: number[] = [];
    let beat = 0;
    while (beat < 4) {
      if (i >= notes.length) {
        beats.push(rest);
        w.push(4 - beat);
        beat = 4;
        break;
      }
      const r = rng.next();
      if (varied && r < 0.25 && i + 1 < notes.length) {
        beats.push(seq([atom(notes[i] as number), atom(notes[i + 1] as number)]));
        w.push(1);
        i += 2;
        beat += 1;
      } else if (varied && r < 0.4 && beat <= 2) {
        beats.push(atom(notes[i] as number));
        w.push(2);
        i += 1;
        beat += 2;
      } else {
        beats.push(atom(notes[i] as number));
        w.push(1);
        i += 1;
        beat += 1;
      }
    }
    out.push(w.every((x) => x === 1) ? seq(beats) : seq(beats, w));
  }
  return { nodes: out, used: i };
}

interface MelodyMaterial {
  key: KeySpec;
  octave: number;
  steps: (number | string)[];
  degrees: Degree[];
  midis: number[];
  bars: number;
  cueBars: number;
  tracks: ReturnType<typeof stepTrack>[];
  bpm: number;
  sound: string;
}
function melodyMaterial(ctx: GenCtx, withContext: boolean): MelodyMaterial {
  const mode = str<ScaleMode>(ctx.level, "mode", "major");
  const key = pickKey(ctx, mode);
  const [lo, _hi] = register(ctx, [57, 76]);
  const octave = pickOctave(ctx.rng, key, lo, lo + 11);
  const [minLen, maxLen] = range(ctx.level, "length", [3, 4]);
  const length = ctx.rng.int(minLen, maxLen);
  const [lowest, highest] = range(ctx.level, "steps", [0, 4]);
  const leapMax = num(ctx.level, "leapMax", 1);
  const plain = melodySteps(ctx.rng, {
    length,
    lowest,
    highest,
    leaps: leapMax > 2,
    leapMax,
    endOnTonic: ctx.level.endOnTonic === true,
  });
  // L7: chromatic neighbours / blue notes; L8: arpeggio lines (chord tones only).
  let steps: (number | string)[] = plain;
  if (ctx.level.chromatic === true) {
    steps = plain.map((s, i) =>
      i > 0 && i < plain.length - 1 && ctx.rng.next() < 0.25 && s % 7 !== 0
        ? `${s}${ctx.rng.pick(["#", "b"])}`
        : s,
    );
    // Keep chromatic steps that Strudel and the degree pad agree on (no "2#" = 4 in major, …).
    steps = steps.map((s, i) => {
      if (typeof s !== "string") return s;
      const m = stepToMidi(s, key, octave);
      const neighbours = [stepToMidi(plain[i] as number, key, octave)];
      const diatonic = MODE_STEPS[key.mode].map((x) => x % 12);
      const pcFromTonic = (((m - tonicMidi(key.tonic, octave)) % 12) + 12) % 12;
      return diatonic.includes(pcFromTonic) || neighbours.includes(m) ? (plain[i] as number) : s;
    });
  }
  if (ctx.level.arpeggio === true) steps = plain.map((s) => [0, 2, 4, 6, 7, 9][Math.abs(s) % 6] as number);
  const bars = num(ctx.level, "bars", 1);
  const varied = ctx.level.rhythm === "dictated";
  const sound = pickSound(ctx);
  const bpm = pickTempo(ctx);
  const tracks = [];
  const placed = rhythmBars(ctx.rng, steps, bars, varied);
  const melodyBars = placed.nodes;
  steps = steps.slice(0, placed.used);
  let cueBars = 0;
  const context = withContext ? contextBar(ctx, key, ctx.level.context ?? "cadence") : null;
  if (context) {
    cueBars = 1;
    tracks.push(chordTrack(ctx, key, [context, ...melodyBars.map(() => null)]));
    tracks.push(stepTrack(key, octave, [null, ...melodyBars], sound));
  } else tracks.push(stepTrack(key, octave, melodyBars, sound));
  const midis = steps.map((s) => stepToMidi(s, key, octave));
  const degrees = midis.map((m) => degreeOfMidi(m, { tonic: key.tonic, mode: "major" }));
  return { key, octave, steps, degrees, midis, bars, cueBars, tracks, bpm, sound };
}

function contour(midis: readonly number[]): "up" | "down" | "arch" | "valley" {
  const first = midis[0] as number;
  const last = midis[midis.length - 1] as number;
  const max = Math.max(...midis);
  const min = Math.min(...midis);
  if (max > first && max > last && max - Math.max(first, last) >= 2) return "arch";
  if (min < first && min < last && Math.min(first, last) - min >= 2) return "valley";
  return last >= first ? "up" : "down";
}

export const melDictation: Generator = {
  name: "melody-dictation",
  generate(ctx) {
    let m = melodyMaterial(ctx, true);
    const ui = str(ctx.level, "ui", "degree-pad");
    if (ui === "contour") {
      // Contour level: pick a clear shape (retry a few seeds' worth of material).
      for (let k = 0; k < 8 && m.midis[0] === m.midis[m.midis.length - 1]; k++) m = melodyMaterial(ctx, true);
    }
    const piece = buildPiece({ bpm: m.bpm, bars: m.cueBars + m.bars, tracks: m.tracks });
    const params = { key: m.key, octave: m.octave, steps: m.steps, cueBars: m.cueBars, ui };
    const cue = cueOf(ctx, { context: ctx.level.context ?? "cadence" });
    if (ui === "contour")
      return trialOf(piece, { choice: [contour(m.midis)] }, cue, { ...params, mode: "choice" });
    if (ui === "degree-pad")
      return trialOf(piece, { degrees: m.degrees }, cue, {
        ...params,
        mode: "choice",
        sequenceLen: m.degrees.length,
      });
    return trialOf(piece, { degrees: m.degrees }, cue, {
      ...params,
      mode: "code",
      answerTrack: "mel",
      answerFromBar: m.cueBars,
      answerBars: m.bars,
      answerKey: { key: m.key, octave: m.octave },
    });
  },
};

export const melEcho: Generator = {
  name: "melody-echo",
  generate(ctx) {
    const m = melodyMaterial(ctx, true);
    const piece = buildPiece({ bpm: m.bpm, bars: m.cueBars + m.bars, tracks: m.tracks });
    const melEvents = piece.events.filter((e) => e.track === "mel");
    const start = m.cueBars;
    const shiftTargets = singTargets(
      ctx,
      melEvents.map((e) => e.midi as number),
      1,
    );
    const targets = melEvents.map((e, i) => {
      const on = (e.onset[0] / e.onset[1] - start) / piece.cps;
      const off = on + e.dur[0] / e.dur[1] / piece.cps;
      return { midi: (shiftTargets[i] as { midi: number }).midi, on, off };
    });
    return trialOf(
      piece,
      { midi: targets.map((t) => t.midi) },
      cueOf(ctx, { context: ctx.level.context ?? "cadence" }),
      {
        mode: "sing",
        key: m.key,
        singMode: "echo",
        singTargets: targets,
        responseAt: (m.cueBars + m.bars) / piece.cps,
      },
    );
  },
};

/** The staff view of a melody: note names with octave in the key's spelling, one duration per note. */
function staffOf(piece: ReturnType<typeof buildPiece>, key: KeySpec, track: string, clef: "treble" | "bass") {
  const evs = piece.events.filter((e) => e.track === track);
  return {
    clef,
    key,
    notes: evs.map((e) => spellMidi(e.midi as number, key).name),
    durations: evs.map((e) => `${e.dur[0]}/${e.dur[1]}`),
  };
}

export const melSight: Generator = {
  name: "melody-sight",
  generate(ctx) {
    const m = melodyMaterial(ctx, false);
    const piece = buildPiece({ bpm: m.bpm, bars: m.bars, tracks: m.tracks });
    const clef = str<"treble" | "bass">(ctx.level, "clef", "treble");
    const targets = singTargets(ctx, m.midis, 60 / m.bpm);
    return trialOf(
      piece,
      { midi: targets.map((t) => t.midi) },
      cueOf(ctx, { context: "tonic-chord", countInBars: 1, click: true }),
      {
        mode: "sing",
        key: m.key,
        singMode: "sight",
        showStaff: true,
        playFirst: false,
        degreeLabels: ctx.level.labels === true,
        staff: staffOf(piece, m.key, "mel", clef),
        singTargets: rhythmTargets(
          piece,
          "mel",
          targets.map((t) => t.midi),
        ),
        responseAt: 0,
      },
    );
  },
};
function rhythmTargets(piece: ReturnType<typeof buildPiece>, track: string, midis: number[]) {
  return piece.events
    .filter((e) => e.track === track)
    .map((e, i) => {
      const on = e.onset[0] / e.onset[1] / piece.cps;
      return { midi: midis[i] as number, on, off: on + e.dur[0] / e.dur[1] / piece.cps };
    });
}

// --- not.read ("Read it") -----------------------------------------------------------------------

const LEAD_SHEET: readonly { degree: number; quality: "maj" | "min" }[] = [
  { degree: 0, quality: "maj" },
  { degree: 5, quality: "min" },
  { degree: 3, quality: "maj" },
  { degree: 4, quality: "maj" },
  { degree: 1, quality: "min" },
  { degree: 2, quality: "min" },
];
export const notRead: Generator = {
  name: "notation-read",
  generate(ctx) {
    if (ctx.category === "lead-sheet") {
      const key = pickKey(ctx, "major");
      const names = keySymbols(key);
      const symbols = Array.from({ length: 4 }, (_, i) =>
        i === 0 ? (names[0] as string) : ctx.rng.pick(names),
      );
      return {
        params: {
          key,
          ui: "text",
          textKind: "chord",
          leadSheet: symbols,
          prompt: "Write the chords of these four bars.",
        },
        code: `chords: chord("<${symbols.join(" ")}>").voicing().s("piano")`,
        events: [],
        cps: 0.5,
        preload: [],
        cue: cueOf(ctx, { replays: -1 }),
        expected: { text: symbols } satisfies Answer,
      };
    }
    const bass = ctx.category === "bass";
    const accidentals = ctx.category === "accidentals";
    const key = accidentals ? pickKey(ctx, "major", "≤4acc") : pickKey(ctx, "major", "≤2acc");
    const [lo, hi] = bass ? [41, 59] : [62, 79];
    const octave = pickOctave(ctx.rng, key, lo, hi - 7);
    const tonic = tonicMidi(key.tonic, octave);
    const lowest = Math.ceil(-7 * ((tonic - lo) / 12));
    const highest = Math.floor(7 * ((hi - tonic) / 12));
    const steps = melodySteps(ctx.rng, {
      length: 7,
      lowest: Math.max(-3, lowest),
      highest: Math.min(9, highest),
      leaps: true,
      leapMax: 3,
    });
    const melodyBars = rhythmBars(ctx.rng, steps, 2, true).nodes;
    const sound = pickSound(ctx);
    const piece = buildPiece({
      bpm: pickTempo(ctx),
      bars: 2,
      tracks: [
        {
          label: "mel",
          src: "note",
          pat: {
            t: "alt",
            items: melodyBars.map((b) => mapAtoms(b, (v) => spellMidi(stepToMidi(v, key, octave), key).code)),
          },
          s: sound,
        },
      ],
    });
    return trialOf(piece, {}, cueOf(ctx, { replays: -1 }), {
      mode: "code",
      ui: "code",
      key,
      showStaff: true,
      playFirst: false,
      staff: staffOf(piece, key, "mel", bass ? "bass" : "treble"),
      answerTrack: "mel",
      answerFromBar: 0,
      answerBars: 2,
      prompt: "Write these two bars as code.",
    });
  },
};
function mapAtoms(node: Node, f: (v: string) => string): Node {
  switch (node.t) {
    case "atom":
      return { ...node, v: f(node.v) };
    case "rest":
      return node;
    default:
      return { ...node, items: node.items.map((n) => mapAtoms(n, f)) } as Node;
  }
}
function keySymbols(key: KeySpec): string[] {
  return LEAD_SHEET.map((c) =>
    chordCode(spellMidi(tonicMidi(key.tonic, 4) + (MODE_STEPS.major[c.degree] as number), key).pc, c.quality),
  );
}
export const _melody = { scaleArg, line };
