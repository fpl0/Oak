// Scale-degree families (Functional Ear Trainer method): fet-major, fet-minor, fet-chromatic, deg.sing,
// deg.resolve, deg.tonic and the n-index concept family. The FET trial is a context bar and the target
// bar; the resolution (degrees 2–4 down, ♯4 and 5–7 up, step by step to the tonic) is played after the
// answer and may be sung on 2–3 trials of a set (contracts §8.3).
import type { Answer, Degree, KeySpec, LearnerProfile, ScaleMode, Trial } from "@oak/content-kit";
import { buildPiece } from "../build.ts";
import { gradeAnswer, gradeSungTrial } from "../grade.ts";
import {
  degreeSemis,
  keysFor,
  MODE_STEPS,
  SYLLABLES,
  scaleArg,
  scaleNames,
  stepForDegree,
  stepToMidi,
  tonicMidi,
} from "../kernel.ts";
import { resolutionSteps, stepsInRange, voiceProgression } from "../music.ts";
import { atom, line, rest, seq } from "../pat.ts";
import type { TrialResponse } from "../types.ts";
import {
  cueOf,
  type GenCtx,
  type Generator,
  num,
  pickKey,
  pickSound,
  pickTempo,
  silentTrial,
  str,
  trialOf,
} from "./common.ts";
import {
  categoryDegree,
  chordTrack,
  contextBar,
  degreeCategory,
  pickOctave,
  register,
  singTargets,
  stepTrack,
} from "./keyed.ts";

/** Open degree categories of this level. */
function openDegrees(ctx: GenCtx): Degree[] {
  const open = ctx.level.categories.filter((c) => ctx.openCategories.includes(c));
  return (open.length > 0 ? open : ctx.level.categories).map(categoryDegree);
}

const LOOPS: Readonly<Record<"major" | "minor", { degree: Degree; quality: "maj" | "min" }[]>> = {
  major: [
    { degree: "1", quality: "maj" },
    { degree: "5", quality: "maj" },
    { degree: "6", quality: "min" },
    { degree: "4", quality: "maj" },
  ],
  minor: [
    { degree: "1", quality: "min" },
    { degree: "b6", quality: "maj" },
    { degree: "b3", quality: "maj" },
    { degree: "b7", quality: "maj" },
  ],
};

/** Builds a FET trial for a mode: context + target(s), resolution, sung-resolution targets. */
function fetTrial(ctx: GenCtx, mode: ScaleMode) {
  const key = pickKey(ctx, mode);
  const [lo, hi] = register(ctx, [60, 72]);
  const octave = pickOctave(ctx.rng, key, lo, hi);
  const tonic = tonicMidi(key.tonic, octave);
  const seqLen = num(ctx.level, "seqLen", 1);
  const pool = openDegrees(ctx);
  const first = categoryDegree(ctx.category);
  const degrees: Degree[] = [first];
  while (degrees.length < seqLen) degrees.push(ctx.rng.pick(pool));
  const steps = degrees.map((d) => {
    const options = stepsInRange(d, key, tonic, lo, hi);
    return options.length > 0 ? ctx.rng.pick(options) : stepForDegree(d, key);
  });
  const sound = pickSound(ctx);
  const bpm = pickTempo(ctx);
  const loop = ctx.level.loop === true;
  const cue = cueOf(ctx, { context: loop ? "none" : (ctx.level.context ?? "cadence") });
  const tracks = [];
  let targetBar: number;
  if (loop) {
    const minor = MODE_STEPS[mode][2] === 3;
    const chords = voiceProgression(LOOPS[minor ? "minor" : "major"], key);
    tracks.push(
      chordTrack(
        ctx,
        key,
        chords.map((c) => [c]),
        { gain: 0.45 },
      ),
    );
    targetBar = 2;
    tracks.push(stepTrack(key, octave, [null, null, seq(steps.map((s) => atom(s))), null], sound));
  } else {
    const context = contextBar(ctx, key, cue.context);
    if (context) {
      tracks.push(chordTrack(ctx, key, [context, null]));
      targetBar = 1;
      tracks.push(stepTrack(key, octave, [null, seq(steps.map((s) => atom(s)))], sound));
    } else {
      targetBar = 0;
      tracks.push(stepTrack(key, octave, [seq(steps.map((s) => atom(s)))], sound));
    }
  }
  const piece = buildPiece({ bpm, bars: loop ? 4 : targetBar + 1, tracks });
  const last = steps[steps.length - 1] as number | string;
  const path = resolutionSteps(last, key);
  const resolution = buildPiece({ bpm, bars: 1, tracks: [stepTrack(key, octave, [line(path)], sound)] });
  const beatSec = 60 / bpm;
  const resolutionTargets = singTargets(
    ctx,
    path.map((s) => stepToMidi(s, key, octave)),
    beatSec,
  );
  return { key, octave, degrees, steps, piece, resolution, cue, targetBar, resolutionTargets, sound, bpm };
}

/** FET identification (major, minor and chromatic families share it; the mode comes from the level). */
export const fet: Generator = {
  name: "degree-id",
  generate(ctx) {
    const mode = str<ScaleMode>(ctx.level, "mode", "major");
    const t = fetTrial(ctx, mode);
    return trialOf(
      t.piece,
      { degrees: t.degrees },
      t.cue,
      {
        mode: "choice",
        key: t.key,
        octave: t.octave,
        steps: t.steps,
        targetBar: t.targetBar,
        cueBars: t.targetBar,
        syllables: ctx.level.syllables === true,
        resolutionTargets: t.resolutionTargets,
        resolutionMode: "resolution",
        // Levels 1–2 play the path first; from level 3 the learner sings first (contracts §8.3).
        playPathFirst: ctx.levelNo <= 2,
      },
      t.resolution,
    );
  },
  exposure(_rng, level, _def) {
    const cats = level.categories.slice(0, 3);
    const key: KeySpec = { tonic: "C", mode: str<ScaleMode>(level, "mode", "major") };
    return cats.map((c) => {
      const d = categoryDegree(c);
      const step = stepForDegree(d, key);
      const piece = buildPiece({
        bpm: 90,
        bars: 1,
        tracks: [stepTrack(key, 4, [line(resolutionSteps(step, key))], "piano")],
      });
      return { code: piece.code, caption: `${d} (${SYLLABLES[d]}) and its way home`, bars: 1 };
    });
  },
  categorySkill(category, def) {
    // A category may name its node (fet-major: 1, 3, 5 are E04, the rest E05); else the family's first.
    const declared = def.categories.find((c) => c.id === category)?.skill;
    if (declared) return declared;
    const skill = def.skills[0]?.skill ?? "E05";
    return `${skill.split("/")[0]}/${category}` as never;
  },
};

/** Grades the sung resolution of a FET trial (feeds `fam.deg.resolve`; never the identification credit). */
export function gradeSungResolution(trial: Trial<Answer>, response: TrialResponse, profile: LearnerProfile) {
  return gradeSungTrial(trial, response, profile, "resolutionTargets", "resolutionMode");
}

// --- deg.sing -----------------------------------------------------------------------------------

export const degSing: Generator = {
  name: "degree-sing",
  generate(ctx) {
    const t = fetTrial(ctx, "major");
    const degree = t.degrees[0] as Degree;
    const midi = stepToMidi(t.steps[0] as number | string, t.key, t.octave);
    // Only the context plays; the learner sings the asked degree, then hears it with its resolution.
    const context = contextBar(ctx, t.key, t.cue.context === "none" ? "cadence" : t.cue.context);
    const piece = buildPiece({
      bpm: t.bpm,
      bars: 1,
      tracks: [chordTrack(ctx, t.key, [context])],
    });
    return trialOf(
      piece,
      { degrees: [degree] },
      t.cue,
      {
        mode: "sing",
        key: t.key,
        prompt: `Sing ${degree}`,
        singMode: "degree",
        singTargets: singTargets(ctx, [midi], 2, 0),
        responseAt: 1 / piece.cps,
      },
      t.resolution,
    );
  },
};

// --- deg.resolve --------------------------------------------------------------------------------

export const degResolve: Generator = {
  name: "degree-resolve",
  generate(ctx) {
    // Category "4-3-2-1", "b6-5".
    const path = ctx.category.split("-") as Degree[];
    const minor = path.some((d) => d.startsWith("b"));
    const key = pickKey(ctx, minor ? "minor" : "major");
    const [lo, hi] = register(ctx, [55, 72]);
    const octave = pickOctave(ctx.rng, key, lo, hi);
    // Paths that rise to the tonic end on the tonic an octave up.
    const steps = path.map((d) => stepForDegree(d, key));
    const rising =
      path.length > 1 &&
      degreeSemis(path[path.length - 1] as Degree) === 0 &&
      degreeSemis(path[0] as Degree) >= 6;
    const nums = steps.map((s, i) => (rising && i === steps.length - 1 && typeof s === "number" ? s + 7 : s));
    const bpm = pickTempo(ctx);
    const context = contextBar(ctx, key, ctx.level.context ?? "cadence");
    const sound = pickSound(ctx);
    const piece = buildPiece({
      bpm,
      bars: 2,
      tracks: [
        chordTrack(ctx, key, [context, null]),
        stepTrack(key, octave, [null, seq([atom(nums[0] as number | string), rest, rest, rest])], sound),
      ],
    });
    const resolution = buildPiece({ bpm, bars: 1, tracks: [stepTrack(key, octave, [line(nums)], sound)] });
    const midis = nums.map((s) => stepToMidi(s, key, octave));
    return trialOf(
      piece,
      { degrees: path },
      cueOf(ctx, { context: ctx.level.context ?? "cadence" }),
      {
        mode: "sing",
        key,
        singMode: "resolution",
        singTargets: singTargets(ctx, midis, 60 / bpm, 0),
        responseAt: 2 / piece.cps,
      },
      resolution,
    );
  },
};

// --- deg.tonic ----------------------------------------------------------------------------------

const TONIC_LOOPS: Readonly<
  Record<string, { mode: ScaleMode; chords: { degree: Degree; quality: "maj" | "min" }[] }>
> = {
  "pop-loop": { mode: "major", chords: LOOPS.major },
  "aeolian-loop": { mode: "minor", chords: LOOPS.minor },
  "dorian-loop": {
    mode: "dorian",
    chords: [
      { degree: "1", quality: "min" },
      { degree: "4", quality: "maj" },
      { degree: "1", quality: "min" },
      { degree: "4", quality: "maj" },
    ],
  },
  "mixolydian-loop": {
    mode: "mixolydian",
    chords: [
      { degree: "1", quality: "maj" },
      { degree: "b7", quality: "maj" },
      { degree: "4", quality: "maj" },
      { degree: "1", quality: "maj" },
    ],
  },
};

export const tonic: Generator = {
  name: "degree-tonic",
  generate(ctx) {
    const loop = TONIC_LOOPS[ctx.category];
    const mode: ScaleMode = loop?.mode ?? "major";
    const key = pickKey(ctx, mode);
    const [lo, hi] = register(ctx, [57, 76]);
    const octave = pickOctave(ctx.rng, key, lo, hi);
    const sound = pickSound(ctx);
    const bpm = pickTempo(ctx);
    const tracks = [];
    let bars = 2;
    if (loop) {
      bars = 4;
      const voiced = voiceProgression(loop.chords, key);
      tracks.push(
        chordTrack(
          ctx,
          key,
          voiced.map((v) => [v]),
          { gain: 0.45 },
        ),
      );
      // The bass states each root (spelled in the key).
      tracks.push({
        label: "bass",
        src: "n" as const,
        pat: { t: "alt" as const, items: loop.chords.map((c) => atom(stepForDegree(c.degree, key))) },
        key,
        octave: 2,
        s: "ebass",
      });
    } else {
      // A stepwise phrase over I–IV–V–I that ends on 1 (L1) or on 3 or 5 (L2).
      const end = ctx.category === "phrase-1" ? 0 : ctx.rng.pick([2, 4]);
      const notes: number[] = [];
      let cur = ctx.rng.int(0, 4);
      for (let i = 0; i < 7; i++) {
        notes.push(cur);
        cur = Math.max(0, Math.min(6, cur + ctx.rng.pick([-1, 1, 1, -1, 2, -2])));
      }
      notes.push(end);
      const chords = voiceProgression(
        [
          { degree: "1", quality: "maj" },
          { degree: "4", quality: "maj" },
          { degree: "5", quality: "maj" },
          { degree: "1", quality: "maj" },
        ],
        key,
      );
      tracks.push(chordTrack(ctx, key, [chords.slice(0, 2), chords.slice(2)], { gain: 0.4 }));
      tracks.push(stepTrack(key, octave, [line(notes.slice(0, 4)), line(notes.slice(4))], sound));
    }
    const piece = buildPiece({ bpm, bars, tracks });
    const names = scaleNames(key);
    const tonicName = names[0] as string;
    const others = ctx.rng.shuffle(names.slice(1).filter((_n, i) => [2, 3, 4, 5].includes(i + 1)));
    const options = ctx.rng.shuffle([tonicName, others[0] as string, others[1] as string]);
    const base = tonicMidi(key.tonic, 3);
    const choiceAudio = options.map((n) => {
      const idx = names.indexOf(n);
      const midi = base + (MODE_STEPS[mode][idx] as number);
      return { id: n, audio: `note(${midi}).s("piano")` };
    });
    return trialOf(piece, { choice: [tonicName] }, cueOf(ctx), {
      mode: "choice",
      key,
      options,
      choiceAudio,
      // Sing alternative: the tonic, in the comfort range.
      singMode: "pitch",
      singTargets: singTargets(ctx, [tonicMidi(key.tonic, octave)], 2, 0),
      responseAt: bars / piece.cps,
    });
  },
  grade(trial, response, profile, def) {
    return response.frames && response.frames.length > 0
      ? gradeSungTrial(trial, response, profile)
      : gradeAnswer(trial, response, def);
  },
};

// --- deg.index (n ↔ degree ↔ note name) ------------------------------------------------------------

const INDEX_MODES: readonly ScaleMode[] = ["dorian", "phrygian", "lydian", "mixolydian", "locrian"];
const CHROMATIC_PAIRS: readonly Degree[] = ["#4", "b7", "b3", "b6", "b2"];

export const nIndex: Generator = {
  name: "degree-index",
  generate(ctx) {
    const cat = ctx.category;
    const cue = cueOf(ctx, { replays: -1 });
    if (cat === "chromatic") {
      const d = ctx.rng.pick(CHROMATIC_PAIRS);
      const key = pickKey(ctx, "major");
      const step = stepForDegree(d, key);
      const toN = ctx.rng.next() < 0.5;
      return silentTrial(
        toN ? { text: [String(step)] } : { degrees: [d] },
        cue,
        {
          key,
          ui: toN ? "text" : "degree-pad",
          textKind: "free",
          prompt: toN
            ? `In \`.scale("${scaleArg(key, 4)}")\`, which \`n\` value plays degree ${d}?`
            : `In \`.scale("${scaleArg(key, 4)}")\`, which degree does \`n("${step}")\` play?`,
        },
        `n("${step}").scale("${scaleArg(key, 4)}")`,
      );
    }
    const mode: ScaleMode = cat === "minor" ? "minor" : cat === "modes" ? ctx.rng.pick(INDEX_MODES) : "major";
    const key =
      cat === "deg-to-n" || cat === "n-to-deg" ? pickKeyFrom(ctx, ["C", "G", "F"], mode) : pickKey(ctx, mode);
    const idx = ctx.rng.int(0, 6);
    const n = idx + (ctx.rng.next() < 0.2 ? 7 : 0);
    const arg = scaleArg(key, 4);
    const degreeNo = String(idx + 1);
    if (cat === "deg-to-n")
      return silentTrial(
        { number: idx },
        { ...cue },
        {
          key,
          ui: "number",
          prompt: `Which \`n\` plays degree ${degreeNo} in \`.scale("${arg}")\`?`,
        },
      );
    if (cat === "n-to-deg")
      return silentTrial({ number: Number(degreeNo) }, cue, {
        key,
        ui: "number",
        prompt: `\`n("${n}").scale("${arg}")\` plays which degree?`,
      });
    // n → note name in the key (L2+), minor (L3), modes (L4).
    const name = scaleNames(key)[idx] as string;
    return silentTrial(
      { text: [name] },
      cue,
      {
        key,
        ui: "text",
        textKind: "note",
        prompt: `Which note does \`n("${n}").scale("${arg}")\` play? (letter name)`,
      },
      `n("${n}").scale("${arg}")`,
    );
  },
};
function pickKeyFrom(ctx: GenCtx, tonics: string[], mode: ScaleMode): KeySpec {
  const prev = ctx.previous?.params.key as KeySpec | undefined;
  const fresh = tonics.filter((t) => t !== prev?.tonic);
  return { tonic: ctx.rng.pick(fresh.length > 0 ? fresh : tonics), mode };
}
export const _keysFor = keysFor;
export { degreeCategory };
