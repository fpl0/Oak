// Chord families: triad quality, seventh quality, inversion and chord spelling. Stimuli are voiced by
// Oak's voicer (code V), never by Strudel's `voicing()`.
import type { ChordQuality } from "@oak/content-kit";
import { buildPiece } from "../build.ts";
import { CHORD_TONES, chordDisplay, LETTERS, spellChord } from "../kernel.ts";
import {
  lowIntervalOk,
  spellVoiced,
  type Voiced,
  type VoicingKind,
  voiceChord,
  voiceProgression,
} from "../music.ts";
import { atom, chordOf, seq } from "../pat.ts";
import {
  cueOf,
  type Generator,
  list,
  pickKey,
  pickSound,
  pickTempo,
  silentTrial,
  trialOf,
} from "./common.ts";
import { chordTrack, register, voicedNode } from "./keyed.ts";

const INVERSIONS = ["root", "first", "second", "third"] as const;

/** One voiced chord of `quality` in the level's register, inversion and voicing randomized (code V). */
function randomVoiced(
  ctx: Parameters<Generator["generate"]>[0],
  quality: ChordQuality,
  opts: { inversion?: number; rootless?: boolean } = {},
): Voiced {
  const [lo] = register(ctx, [43, 60]);
  const kinds = list<VoicingKind>(ctx.level, "voicings", ["close"]);
  const members = CHORD_TONES[quality].semis.length;
  const randomInv = ctx.level.inversions === true;
  for (let attempt = 0; attempt < 20; attempt++) {
    const rootPc = ctx.rng.int(0, 11);
    const inversion = opts.inversion ?? (randomInv ? ctx.rng.int(0, Math.min(3, members - 1)) : 0);
    const bassLo = ctx.rng.int(lo, lo + 9);
    const v = voiceChord(rootPc, quality, {
      inversion,
      kind: ctx.rng.pick(kinds),
      bass: [bassLo, bassLo + 11],
      ...(opts.rootless ? { rootless: true } : {}),
    });
    const midis = opts.rootless ? v.midis.filter((_m, i) => i > 0 || inversion !== 0) : v.midis;
    const out = { ...v, midis };
    if (lowIntervalOk(out.midis) && Math.max(...out.midis) <= 84) return out;
  }
  return voiceChord(0, quality, { inversion: opts.inversion ?? 0, bass: [48, 59] });
}

function chordPiece(ctx: Parameters<Generator["generate"]>[0], v: Voiced) {
  const names = spellVoiced(v, null);
  const arpeggiate = ctx.level.arpeggiate === true && ctx.rng.next() < 0.5;
  const pat = arpeggiate
    ? seq([...names.map((n) => atom(n)), chordOf(names)], [...names.map(() => 1), names.length])
    : seq([chordOf(names)]);
  return buildPiece({
    bpm: pickTempo(ctx),
    meter: "2/4",
    bars: 1,
    tracks: [{ label: "chords", src: "note", pat, s: pickSound(ctx) }],
  });
}

export const qualityId: Generator = {
  name: "chord-quality",
  generate(ctx) {
    const quality = ctx.category as ChordQuality;
    const rootless =
      ctx.level.rootless === true && CHORD_TONES[quality].semis.length >= 4 && ctx.rng.next() < 0.5;
    const v = randomVoiced(ctx, quality, rootless ? { rootless: true } : {});
    const piece = chordPiece(ctx, v);
    return trialOf(piece, { qualities: [quality] }, cueOf(ctx), {
      mode: "choice",
      rootPc: v.rootPc,
      inversion: v.inversion,
      rootless,
      midis: v.midis,
    });
  },
};

export const inversion: Generator = {
  name: "chord-inversion",
  generate(ctx) {
    if (ctx.category === "spot") {
      // A progression of four root-position chords with one inverted: which bar?
      const key = pickKey(ctx, "major");
      const chords = voiceProgression(
        [
          { degree: "1", quality: "maj" },
          { degree: "6", quality: "min" },
          { degree: "4", quality: "maj" },
          { degree: "5", quality: "maj" },
        ],
        key,
      );
      const which = ctx.rng.int(1, 3);
      const target = chords[which] as Voiced;
      const inv = ctx.rng.int(1, 2);
      chords[which] = voiceChord(target.rootPc, target.quality, {
        inversion: inv,
        bass: [40, 52],
        upperFloor: 55,
      });
      const piece = buildPiece({
        bpm: pickTempo(ctx),
        bars: 4,
        tracks: [
          chordTrack(
            ctx,
            key,
            chords.map((c) => [c]),
            { sound: pickSound(ctx), gain: 0.6 },
          ),
        ],
      });
      return trialOf(piece, { number: which + 1 }, cueOf(ctx), {
        mode: "choice",
        ui: "bar-buttons",
        bars: 4,
        key,
      });
    }
    const inv = INVERSIONS.indexOf(ctx.category as (typeof INVERSIONS)[number]);
    const sevenths = ctx.level.sevenths === true || inv === 3;
    const quality: ChordQuality = sevenths
      ? ctx.rng.pick(["7", "maj7", "m7"] as ChordQuality[])
      : ctx.rng.pick(["maj", "min"] as ChordQuality[]);
    const v = randomVoiced(ctx, quality, { inversion: Math.max(0, inv) });
    const piece = chordPiece(ctx, v);
    return trialOf(piece, { choice: [ctx.category] }, cueOf(ctx), {
      mode: "choice",
      quality,
      rootPc: v.rootPc,
      midis: v.midis,
    });
  },
};

const NATURAL_ROOTS = LETTERS as unknown as string[];
const ALL_ROOTS = ["C", "C#", "Db", "D", "Eb", "E", "F", "F#", "Gb", "G", "Ab", "A", "Bb", "B"];
const SPELL_QUALITIES: Readonly<Record<string, ChordQuality[]>> = {
  "triad-naturals": ["maj", "min"],
  triads: ["maj", "min", "dim", "aug"],
  sevenths: ["maj7", "7", "m7", "m7b5", "dim7"],
  extended: ["9", "maj9", "m9", "13", "7b9", "7#9", "7#11", "m11"],
};
export const spell: Generator = {
  name: "chord-spell",
  generate(ctx) {
    const qualities = SPELL_QUALITIES[ctx.category] ?? ["maj"];
    const quality = ctx.rng.pick(qualities);
    for (;;) {
      const root = ctx.rng.pick(ctx.category === "triad-naturals" ? NATURAL_ROOTS : ALL_ROOTS);
      const notes = spellChord(root, quality);
      // Triple accidentals never; double accidentals only from the 7th level on.
      if (notes.some((n) => /bbb|###/.test(n))) continue;
      if (ctx.category !== "extended" && ctx.category !== "sevenths" && notes.some((n) => /bb|##/.test(n)))
        continue;
      return silentTrial({ text: notes }, cueOf(ctx, { replays: -1 }), {
        ui: "text",
        textKind: "note",
        root,
        quality,
        prompt: `Spell ${chordDisplay(root, quality)} from the root up.`,
      });
    }
  },
};
export { voicedNode };
