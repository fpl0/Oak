// Key families: mode identification (vamps and melodies), scale spelling and the circle of fifths.
import type { Degree, KeySpec, ScaleMode } from "@oak/content-kit";
import { buildPiece } from "../build.ts";
import {
  allKeys,
  keyAccidentals,
  keysFor,
  mod,
  parsePc,
  type RnChord,
  scaleNames,
  tonicMidi,
} from "../kernel.ts";
import { rn, voiceProgression } from "../music.ts";
import { line } from "../pat.ts";
import {
  cueOf,
  type Generator,
  metKeys,
  pickKey,
  pickSound,
  pickTempo,
  silentTrial,
  trialOf,
} from "./common.ts";
import { chordTrack, pickOctave, stepTrack } from "./keyed.ts";
import { melodySteps } from "./melody.ts";

/** Mode ID of the family → scale mode and its characteristic two-chord vamp. */
export const MODE_VAMPS: Readonly<Record<string, { mode: ScaleMode; vamp: RnChord[]; colour: number }>> = {
  major: { mode: "major", vamp: [rn("1", "maj"), rn("4", "maj"), rn("5", "maj"), rn("1", "maj")], colour: 6 },
  minor: {
    mode: "minor",
    vamp: [rn("1", "min"), rn("b6", "maj"), rn("b7", "maj"), rn("1", "min")],
    colour: 5,
  },
  dorian: {
    mode: "dorian",
    vamp: [rn("1", "min"), rn("4", "maj"), rn("1", "min"), rn("4", "maj")],
    colour: 5,
  },
  mixolydian: {
    mode: "mixolydian",
    vamp: [rn("1", "maj"), rn("b7", "maj"), rn("1", "maj"), rn("b7", "maj")],
    colour: 6,
  },
  lydian: {
    mode: "lydian",
    vamp: [rn("1", "maj"), rn("2", "maj"), rn("1", "maj"), rn("2", "maj")],
    colour: 3,
  },
  phrygian: {
    mode: "phrygian",
    vamp: [rn("1", "min"), rn("b2", "maj"), rn("1", "min"), rn("b2", "maj")],
    colour: 1,
  },
};

export const modeId: Generator = {
  name: "key-mode",
  generate(ctx) {
    const m = MODE_VAMPS[ctx.category] ?? (MODE_VAMPS.major as (typeof MODE_VAMPS)[string]);
    const key = pickKey(ctx, m.mode);
    const octave = pickOctave(ctx.rng, key, 60, 71);
    const melodyOnly = ctx.level.melodyOnly === true;
    // A melody that touches the mode's colour note (Dorian ♮6, Mixolydian ♭7, Lydian ♯4, Phrygian ♭2).
    const steps = melodySteps(ctx.rng, { length: 7, lowest: 0, highest: 7, leaps: true, leapMax: 3 });
    steps[ctx.rng.int(2, 5)] = m.colour;
    steps[steps.length - 1] = 0;
    const sound = pickSound(ctx);
    const tracks = [];
    if (!melodyOnly) {
      const voiced = voiceProgression(m.vamp, key);
      tracks.push(
        chordTrack(
          ctx,
          key,
          voiced.map((v) => [v]),
          { gain: 0.45 },
        ),
      );
    }
    tracks.push(
      stepTrack(key, octave, [line(steps.slice(0, 4)), line(steps.slice(4, 7)), line([0]), line([0])], sound),
    );
    const piece = buildPiece({ bpm: pickTempo(ctx), bars: 4, tracks });
    return trialOf(piece, { choice: [ctx.category] }, cueOf(ctx), { mode: "choice", key, steps });
  },
};

// --- key.scale-spell ----------------------------------------------------------------------------

const SPELL_MODES: Readonly<Record<string, ScaleMode[]>> = {
  "major-2acc": ["major"],
  major: ["major"],
  "natural-minor": ["minor"],
  "harmonic-minor": ["harmonic minor"],
  "melodic-minor": ["melodic minor"],
  pentatonic: ["major pentatonic", "minor pentatonic"],
  blues: ["blues"],
  dorian: ["dorian"],
  mixolydian: ["mixolydian"],
  lydian: ["lydian"],
  phrygian: ["phrygian"],
  locrian: ["locrian"],
};
export const scaleSpell: Generator = {
  name: "key-scale-spell",
  generate(ctx) {
    const mode = ctx.rng.pick<ScaleMode>(SPELL_MODES[ctx.category] ?? ["major"]);
    const key = pickKey(ctx, mode, ctx.category === "major-2acc" ? "≤2acc" : ctx.level.keys);
    const notes = scaleNames(key);
    return silentTrial({ text: notes }, cueOf(ctx, { replays: -1 }), {
      key,
      ui: "text",
      textKind: "note",
      prompt: `Spell ${key.tonic} ${mode} from ${key.tonic} up: ${spellCount(notes.length)}, with a sharp (#) or a flat (b) where the scale needs one, separated by spaces.`,
    });
  },
};

/**
 * How many notes a spelling has, in words. The format is said in words, never shown as an example: any
 * row of letters is the answer for some key (C D E F G A B is C major's).
 */
function spellCount(n: number): string {
  const words = ["", "one", "two", "three", "four", "five", "six", "seven", "eight"];
  return n === 7 ? "seven letters, each once" : `${words[n] ?? String(n)} notes, each once`;
}

// --- key.circle ---------------------------------------------------------------------------------

/**
 * The major keys of the course on the circle, flat side to sharp side: every step clockwise is a fifth up.
 * Each answer of the dominant category is one of these spellings, so "a fifth up from B" is F♯ (6 sharps),
 * never G♭, and nothing asks past F♯ or D♭.
 */
export const CIRCLE_MAJOR: readonly string[] = [
  "Db",
  "Ab",
  "Eb",
  "Bb",
  "F",
  "C",
  "G",
  "D",
  "A",
  "E",
  "B",
  "F#",
];

/** The spelled key at `semis` above a key's tonic, in the mode, with the fewest accidentals. */
function keyAt(key: KeySpec, semis: number, mode: ScaleMode): KeySpec {
  const pc = mod(parsePc(key.tonic).pc + semis, 12);
  return allKeys(mode).find((k) => parsePc(k.tonic).pc === pc) as KeySpec;
}
const ENHARMONIC_KEYS: readonly [string, string][] = [
  ["F#", "Gb"],
  ["C#", "Db"],
  ["B", "Cb"],
];
export const circle: Generator = {
  name: "key-circle",
  generate(ctx) {
    const cue = cueOf(ctx, { replays: -1 });
    const key = pickKey(ctx, "major");
    switch (ctx.category) {
      case "dominant": {
        // A neighbouring pair of the circle, both met (sharp keys and flat keys open with their lessons).
        const met = new Set(metKeys(ctx, "all", "major").map((k) => k.tonic));
        const pairs = CIRCLE_MAJOR.slice(0, -1)
          .map((t, i) => [t, CIRCLE_MAJOR[i + 1] as string] as const)
          .filter(([a, b]) => met.has(a) && met.has(b));
        const prev = (ctx.previous?.params.key as KeySpec | undefined)?.tonic;
        const up = ctx.rng.next() < 0.5;
        const fresh = pairs.filter(([a, b]) => (up ? a : b) !== prev);
        const [lower, upper] = ctx.rng.pick(fresh.length > 0 ? fresh : pairs);
        const from: KeySpec = { tonic: up ? lower : upper, mode: "major" };
        const answer = up ? upper : lower;
        return silentTrial({ text: [answer] }, cue, {
          key: from,
          ui: "text",
          textKind: "note",
          prompt: `Which major key is one step ${up ? "clockwise (a fifth up)" : "anticlockwise (a fifth down)"} from ${from.tonic} major? Write its letter, then # or b if it has a sharp or a flat.`,
        });
      }
      case "relative": {
        const toMinor = ctx.rng.next() < 0.5;
        const from = toMinor ? key : pickKey(ctx, "minor");
        const answer = toMinor ? keyAt(from, 9, "minor") : keyAt(from, 3, "major");
        // Same signature: spell the answer with the same accidentals as the given key.
        const fixed = sameSignatureSpelling(answer, keyAccidentals(from));
        return silentTrial({ text: [`${fixed.tonic} ${fixed.mode}`] }, cue, {
          key: from,
          ui: "text",
          textKind: "key",
          prompt: `What is the relative ${toMinor ? "minor" : "major"} of ${from.tonic} ${from.mode}?`,
        });
      }
      case "parallel": {
        // Parallel minor has three more flats (three fewer sharps).
        const diff = keyAccidentals(key) - keyAccidentals({ tonic: key.tonic, mode: "minor" });
        return silentTrial({ number: diff }, cue, {
          key,
          ui: "number",
          prompt: `How many more flats (or fewer sharps) does ${key.tonic} minor have than ${key.tonic} major?`,
        });
      }
      default: {
        const [a, b] = ctx.rng.pick(ENHARMONIC_KEYS);
        const flip = ctx.rng.next() < 0.5;
        return silentTrial({ text: [flip ? a : b] }, cue, {
          ui: "text",
          textKind: "note",
          prompt: `Which major key sounds the same as ${flip ? b : a} major?`,
        });
      }
    }
  },
};
function sameSignatureSpelling(key: KeySpec, accidentals: number): KeySpec {
  const pc = parsePc(key.tonic).pc;
  const candidates = [...keysFor("all", key.mode), ...enharmonicTwins(key.mode)].filter(
    (k) => parsePc(k.tonic).pc === pc && keyAccidentals(k) === accidentals,
  );
  return candidates[0] ?? key;
}
function enharmonicTwins(mode: ScaleMode): KeySpec[] {
  const tonics = ["F#", "Gb", "C#", "Db", "B", "Cb", "D#", "Eb", "A#", "Bb", "G#", "Ab"];
  return tonics.map((tonic) => ({ tonic, mode }));
}
export const _key = { tonicMidi, scaleNames };
export type { Degree };
