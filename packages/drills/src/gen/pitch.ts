// Pitch families: compare (higher / lower / same), match (sing the note), steps (half or whole) and the
// keyboard concept family (white keys, black keys, enharmonics).
import { buildPiece } from "../build.ts";
import { spellMidi } from "../kernel.ts";
import { atom, line, seq } from "../pat.ts";
import { cueOf, type Generator, num, pickSound, pickTempo, silentTrial, trialOf } from "./common.ts";
import { register, singTargets } from "./keyed.ts";

const code = (m: number): string => spellMidi(m, null).code;

export const compare: Generator = {
  name: "pitch-compare",
  generate(ctx) {
    const [lo, hi] = register(ctx, [48, 84]);
    const min = num(ctx.level, "minSemis", 4);
    const max = num(ctx.level, "maxSemis", 12);
    const a = ctx.rng.int(lo + max, hi - max);
    const dist = ctx.rng.int(min, max);
    const b = ctx.category === "same" ? a : ctx.category === "higher" ? a + dist : a - dist;
    const timbres = ctx.level.timbres === true;
    const s1 = pickSound(ctx);
    const s2 = timbres ? pickSound(ctx) : s1;
    const tracks =
      s1 === s2
        ? [{ label: "mel", src: "note" as const, pat: line([code(a), code(b)]), s: s1 }]
        : [
            { label: "mel", src: "note" as const, pat: line([code(a), null]), s: s1 },
            { label: "keys", src: "note" as const, pat: line([null, code(b)]), s: s2 },
          ];
    const piece = buildPiece({ bpm: pickTempo(ctx), meter: "2/4", bars: 1, tracks });
    return trialOf(piece, { choice: [ctx.category] }, cueOf(ctx), {
      mode: "choice",
      semitones: b - a,
      prompt: "Is the second note higher, lower or the same?",
    });
  },
};

export const match: Generator = {
  name: "pitch-match",
  generate(ctx) {
    const { comfLow, comfHigh } = ctx.profile;
    const wide = ctx.level.wide === true;
    const span = comfHigh - comfLow;
    // L1–L3: the middle of the comfortable range; L4: anywhere inside it.
    const lo = wide ? comfLow + 1 : comfLow + Math.floor(span / 3);
    const hi = wide ? comfHigh - 1 : comfHigh - Math.floor(span / 3);
    const midi = ctx.rng.int(Math.min(lo, hi), Math.max(lo, hi));
    const sound = wide ? pickSound(ctx) : "piano";
    const piece = buildPiece({
      bpm: 120,
      bars: 1,
      tracks: [{ label: "mel", src: "note", pat: seq([atom(code(midi))]), s: sound }],
    });
    const silence = num(ctx.level, "silenceSec", 0);
    const live = ctx.level.live === true;
    const startSec = live ? 0 : 1 / piece.cps + silence;
    return trialOf(piece, { midi: [midi] }, cueOf(ctx), {
      mode: "sing",
      singMode: "pitch",
      liveTrace: live || ctx.level.traceAfter !== true,
      singTargets: singTargets(ctx, [midi], 2, 0),
      responseAt: startSec,
    });
  },
};

export const steps: Generator = {
  name: "pitch-steps",
  generate(ctx) {
    const [lo, hi] = register(ctx, [55, 79]);
    const size = ctx.category === "half" ? 1 : 2;
    const down = ctx.level.descending === true && ctx.rng.next() < 0.5;
    const a = ctx.rng.int(lo + 2, hi - 2);
    const b = down ? a - size : a + size;
    const piece = buildPiece({
      bpm: pickTempo(ctx),
      meter: "2/4",
      bars: 1,
      tracks: [{ label: "mel", src: "note", pat: line([code(a), code(b)]), s: pickSound(ctx) }],
    });
    return trialOf(piece, { choice: [ctx.category] }, cueOf(ctx), {
      mode: "choice",
      direction: down ? "down" : "up",
      showKeyboard: ctx.level.images === true,
    });
  },
};

const WHITE = [0, 2, 4, 5, 7, 9, 11];
const ENHARMONIC: readonly [string, number][] = [
  ["E#", 5],
  ["B#", 0],
  ["Cb", 11],
  ["Fb", 4],
];
export const keyboard: Generator = {
  name: "pitch-keyboard",
  generate(ctx) {
    const cue = cueOf(ctx, { replays: -1 });
    const octave = ctx.rng.int(3, 5);
    if (ctx.category === "enharmonic") {
      const [name, pc] = ctx.rng.pick(ENHARMONIC);
      const midi = 12 * (octave + 1) + pc;
      return silentTrial({ midi: [midi] }, cue, { ui: "keyboard", pcOnly: true, prompt: `Click ${name}.` });
    }
    const black = ctx.category === "black";
    const pcs = black ? [1, 3, 6, 8, 10] : WHITE;
    const pc = ctx.rng.pick(pcs);
    const midi = 12 * (octave + 1) + pc;
    // Name the key shown: a black key accepts either spelling.
    return silentTrial({ text: [spellMidi(midi, null).pc] }, cue, {
      ui: "text",
      textKind: black ? "pc" : "note",
      showKey: midi,
      prompt: "Name the highlighted key.",
    });
  },
};
