// Key families: mode identification (vamps and melodies), scale spelling and the circle of fifths.
import { type Degree, type KeySpec, MINOR_OPTIONS, MODE_OPTIONS, type ScaleMode } from "@oak/content-kit";
import { buildPiece } from "../build.ts";
import { gradeAnswer, normalizeAnswerText, splitTyped } from "../grade.ts";
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
  type GenCtx,
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

/**
 * The colours `fam.key.mode` asks for (MODE_OPTIONS' ids): the scale, the 0-based scale steps the tune must touch
 * so that no other colour fits what sounds (major needs its 4th and its 7th, natural minor its 2nd and its ♭6,
 * each mode its one changed note), and the loops it is heard over. The loops come in near-miss pairs that differ
 * by one note (content/specs/U14.md: a mode is a known scale with one note changed): i–iv against Dorian's
 * i–IV, I–V–IV–I against Mixolydian's I–v–IV–I and I–♭VII–IV–I, I–ii against Lydian's I–II, i–♭VII against
 * Phrygian's i–♭vii. So the shape of the loop never gives the answer away; the changed note does.
 */
export interface ModeColour {
  mode: ScaleMode;
  need: number[];
  vamps: RnChord[][];
}
export const MODE_VAMPS: Readonly<Record<string, ModeColour>> = {
  major: {
    mode: "major",
    need: [3, 6],
    vamps: [
      [rn("1", "maj"), rn("4", "maj"), rn("5", "maj"), rn("1", "maj")],
      [rn("1", "maj"), rn("5", "maj"), rn("4", "maj"), rn("1", "maj")],
      [rn("1", "maj"), rn("2", "min"), rn("1", "maj"), rn("2", "min")],
    ],
  },
  minor: {
    mode: "minor",
    need: [5, 1],
    vamps: [
      [rn("1", "min"), rn("b6", "maj"), rn("b7", "maj"), rn("1", "min")],
      [rn("1", "min"), rn("4", "min"), rn("1", "min"), rn("4", "min")],
      [rn("1", "min"), rn("b7", "maj"), rn("1", "min"), rn("b7", "maj")],
    ],
  },
  dorian: {
    mode: "dorian",
    need: [5],
    vamps: [
      [rn("1", "min"), rn("4", "maj"), rn("1", "min"), rn("4", "maj")],
      [rn("1", "min"), rn("2", "min"), rn("1", "min"), rn("2", "min")],
      [rn("1", "min"), rn("4", "maj"), rn("b7", "maj"), rn("1", "min")],
    ],
  },
  mixolydian: {
    mode: "mixolydian",
    need: [6],
    vamps: [
      [rn("1", "maj"), rn("b7", "maj"), rn("4", "maj"), rn("1", "maj")],
      [rn("1", "maj"), rn("5", "min"), rn("4", "maj"), rn("1", "maj")],
      [rn("1", "maj"), rn("b7", "maj"), rn("1", "maj"), rn("b7", "maj")],
    ],
  },
  lydian: {
    mode: "lydian",
    need: [3],
    vamps: [
      [rn("1", "maj"), rn("2", "maj"), rn("1", "maj"), rn("2", "maj")],
      [rn("1", "maj"), rn("2", "maj"), rn("3", "min"), rn("2", "maj")],
    ],
  },
  phrygian: {
    mode: "phrygian",
    need: [1],
    vamps: [
      [rn("1", "min"), rn("b2", "maj"), rn("1", "min"), rn("b2", "maj")],
      [rn("1", "min"), rn("b7", "min"), rn("1", "min"), rn("b7", "min")],
      [rn("1", "min"), rn("b2", "maj"), rn("b3", "maj"), rn("b2", "maj")],
    ],
  },
};
/** The order and the words of the answers (content-kit MODE_OPTIONS). */
const MODE_ORDER: readonly string[] = MODE_OPTIONS.map((o) => o.id);
const MODE_LABELS: Readonly<Record<string, string>> = Object.fromEntries(
  MODE_OPTIONS.map((o) => [o.id, o.label]),
);

/**
 * "Which minor?" by ear (U10.L06–L08, MINOR_OPTIONS' ids): the same tune in each form, climbing home 5 · 6 · 7 · 1
 * in bar 2, so the two notes below home tell them apart: ♭6 ♭7 natural, ♭6 7 harmonic (the gap of three half
 * steps), 6 7 melodic; major has its major 3rd in bar 1 as well. Each is written over its own scale
 * (`A4:harmonic:minor`), as U10.L06 and L08 write them.
 */
export const CLIMBS: Readonly<Record<string, ScaleMode>> = {
  major: "major",
  minor: "minor",
  "harmonic minor": "harmonic minor",
  "melodic minor": "melodic minor",
};
const WHICH_MINOR = ["major", "minor", "harmonic minor", "melodic minor"];

export const modeId: Generator = {
  name: "key-mode",
  generate(ctx) {
    const minorForms = ctx.level.categories.some((c) => c === "harmonic minor" || c === "melodic minor");
    if (minorForms && CLIMBS[ctx.category]) return whichMinor(ctx);
    const m = MODE_VAMPS[ctx.category] ?? (MODE_VAMPS.major as ModeColour);
    const key = pickKey(ctx, m.mode);
    const octave = pickOctave(ctx.rng, key, 60, 71);
    const melodyOnly = ctx.level.melodyOnly === true;
    // A tune that touches every note the colour is told by: its one changed note (Dorian ♮6, Mixolydian ♭7,
    // Lydian ♯4, Phrygian ♭2), or for major and natural minor the two notes a mode would change.
    const steps = melodySteps(ctx.rng, { length: 7, lowest: 0, highest: 7, leaps: true, leapMax: 3 });
    const places = ctx.rng.shuffle([1, 2, 3, 4, 5]);
    m.need.forEach((step, i) => {
      steps[places[i] as number] = step;
    });
    steps[steps.length - 1] = 0;
    const sound = pickSound(ctx);
    const tracks = [];
    if (!melodyOnly) {
      const voiced = voiceProgression(ctx.rng.pick(m.vamps), key);
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
    // The answers are the level's colours the learner has met, in MODE_OPTIONS' order and words.
    const open = ctx.level.categories.filter((c) => c === ctx.category || ctx.openCategories.includes(c));
    const options = MODE_ORDER.filter((c) => open.includes(c));
    return trialOf(piece, { choice: [ctx.category] }, cueOf(ctx), {
      mode: "choice",
      key,
      steps,
      options,
      optionLabels: Object.fromEntries(options.map((o) => [o, MODE_LABELS[o] as string])),
      prompt:
        options.length > 2
          ? "Which colour is it? Find home, hear whether the 3rd is major or minor, then listen for the one changed note."
          : "Which scale is this in?",
    });
  },
};

/** Level 2 of `fam.key.mode`: a tune alone, major or which minor; the options are the forms the learner has met. */
function whichMinor(ctx: GenCtx) {
  const mode = CLIMBS[ctx.category] as ScaleMode;
  // The keys of natural minor (harmonic and melodic minor share its signature).
  const tonic = pickKey(ctx, mode === "major" ? "major" : "minor").tonic;
  const key: KeySpec = { tonic, mode };
  const octave = pickOctave(ctx.rng, key, 57, 67);
  // Bar 1 moves around home and touches the 3rd (major 3 or ♭3), bar 2 climbs home, bars 3–4 hold it.
  const bar1 = melodySteps(ctx.rng, { length: 4, lowest: 0, highest: 4, leaps: true, leapMax: 2 });
  bar1[0] = 0;
  if (!bar1.includes(2)) bar1[ctx.rng.int(1, 3)] = 2;
  const climb = [4, 5, 6, 7];
  const steps = [...bar1, ...climb, 7];
  const tracks = [stepTrack(key, octave, [line(bar1), line(climb), line([7]), line([7])], pickSound(ctx))];
  const piece = buildPiece({ bpm: pickTempo(ctx), bars: 4, tracks });
  const open = ctx.level.categories.filter((c) => c === ctx.category || ctx.openCategories.includes(c));
  const options = WHICH_MINOR.filter((c) => open.includes(c));
  return trialOf(piece, { choice: [ctx.category] }, cueOf(ctx), {
    mode: "choice",
    key,
    steps,
    options,
    optionLabels: Object.fromEntries(options.map((o) => [o, MINOR_LABELS[o] as string])),
    prompt: "Major, or which minor?",
  });
}
const MINOR_LABELS: Readonly<Record<string, string>> = {
  major: "Major",
  ...Object.fromEntries(MINOR_OPTIONS.map((o) => [o.id, o.label])),
};

// --- key.scale-spell ----------------------------------------------------------------------------

const SPELL_MODES: Readonly<Record<string, ScaleMode[]>> = {
  "major-2acc": ["major"],
  major: ["major"],
  "natural-minor": ["minor"],
  "harmonic-minor": ["harmonic minor"],
  "melodic-minor": ["melodic minor"],
  // Major pentatonic from U11.L01, minor pentatonic from U11.L02, the blues scale from U11.L03.
  pentatonic: ["major pentatonic"],
  "minor-pentatonic": ["minor pentatonic"],
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
    const notes = mode === "blues" ? bluesNames(key.tonic) : scaleNames(key);
    const how =
      mode === "melodic minor"
        ? " going up (raised 6 and 7)"
        : mode === "blues"
          ? " (the blue note between 4 and 5 as ♭5 or ♯4, either is right)"
          : "";
    return silentTrial({ text: notes }, cueOf(ctx, { replays: -1 }), {
      key,
      ui: "text",
      textKind: "note",
      ...(mode === "blues" ? { blueNoteAt: 3 } : {}),
      prompt: `Spell ${key.tonic} ${mode} from ${key.tonic} up${how}: ${spellCount(notes.length)}, with a sharp (#) or a flat (b) where the scale needs one, separated by spaces.`,
    });
  },
  grade(trial, response, _profile, def) {
    // The blues scale's blue note is right as ♭5 or as ♯4 (U11.L03 spells it by direction); every other note
    // keeps its one spelling.
    const at = trial.params.blueNoteAt;
    const want = trial.expected.text;
    const got = splitTyped(want, response.answer?.text);
    if (typeof at === "number" && want && got && got[at] !== undefined) {
      const w = want[at] as string;
      const g = normalizeAnswerText(got[at] as string);
      const same = (a: string, b: string) => {
        try {
          return parsePc(a).pc === parsePc(b.charAt(0).toUpperCase() + b.slice(1)).pc;
        } catch {
          return false;
        }
      };
      const blueOk = same(w, g) && /^[A-Ga-g](#|b)$/.test(g);
      if (blueOk) {
        const fixed = [...got];
        fixed[at] = w;
        return gradeAnswer(trial, { ...response, answer: { ...response.answer, text: fixed } }, def);
      }
    }
    return gradeAnswer(trial, response, def);
  },
};

/**
 * The blues scale spelled up from its tonic: the minor pentatonic (1 ♭3 4 5 ♭7) with the blue note between 4 and
 * 5, written as ♭5 unless that needs a double flat or C♭/F♭ (then as ♯4): A C D E♭ E G, E♭ G♭ A♭ A B♭ D♭.
 */
export function bluesNames(tonic: string): string[] {
  const pent = scaleNames({ tonic, mode: "minor pentatonic" });
  const four = pent[2] as string;
  const five = pent[3] as string;
  const flat = (n: string) => (n.endsWith("#") ? n.slice(0, -1) : `${n}b`);
  const sharp = (n: string) => (n.endsWith("b") ? n.slice(0, -1) : `${n}#`);
  const flat5 = flat(five);
  const sharp4 = sharp(four);
  const awkward = (n: string) => /bb$|##$|^[CF]b$|^[BE]#$/.test(n);
  const blue = awkward(flat5) && !awkward(sharp4) ? sharp4 : flat5;
  return [pent[0], pent[1], four, blue, five, pent[4]] as string[];
}

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
          prompt: `What is the relative ${toMinor ? "minor" : "major"} of ${shown(from.tonic)} ${from.mode}? Write the key: its letter (with # or b if it has one), then ${toMinor ? "minor" : "major"}.`,
        });
      }
      case "parallel": {
        // The parallel minor: the same home, three more flats (three fewer sharps) than its major. Asked as the
        // minor key's own signature, so the answer changes with the key; only majors whose parallel minor is a
        // key the course writes (D minor yes, D♭ minor no: that one is C♯ minor).
        const minors = new Set(keysFor("all", "minor").map((k) => k.tonic));
        const majors = metKeys(ctx, "all", "major").filter((k) => minors.has(k.tonic));
        const prev = (ctx.previous?.params.key as KeySpec | undefined)?.tonic;
        const pool = majors.filter((k) => k.tonic !== prev);
        const major = ctx.rng.pick(pool.length > 0 ? pool : majors);
        const n = keyAccidentals({ tonic: major.tonic, mode: "minor" });
        return silentTrial({ text: [signatureText(n)] }, cue, {
          key: major,
          ui: "text",
          textKind: "free",
          prompt: `${shown(major.tonic)} minor is the parallel minor of ${shown(major.tonic)} major. How many sharps or flats does its key signature have? Write it as 2#, 3b or 0.`,
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
const shown = (tonic: string): string => tonic.replace("#", "♯").replace(/^([A-G])b/, "$1♭");
/** A signature as the decks write it: "2#", "3b", "0". */
const signatureText = (n: number): string => (n === 0 ? "0" : n > 0 ? `${n}#` : `${-n}b`);
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
