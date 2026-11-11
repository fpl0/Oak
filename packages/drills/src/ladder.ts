// Generated transcription-ladder material (contracts §2.9): L1 drum loops, L2 bass lines, L3 four-chord
// loops, L4 short melodies, each at a realism level R0 (bare, slow, one layer) to R4 (full arrangement,
// faster, swung or syncopated, kit and instrument variety). Returns the hidden reference code and its
// events; never authored by hand.
import type { KeySpec, LearnerProfile, NEvent } from "@oak/content-kit";
import { rat } from "@oak/content-kit";
import { buildPiece, type TrackSpec } from "./build.ts";
import { melodySteps } from "./gen/melody.ts";
import { barNode, gridBeats } from "./gen/rhythm.ts";
import { keysFor, type RnChord, spellMidi } from "./kernel.ts";
import { above, rn, voiceProgression } from "./music.ts";
import { atom, chordOf, line, type Node, rest, seq } from "./pat.ts";
import { KITS } from "./pools.ts";
import { createRng } from "./rng.ts";

const LOOPS: readonly RnChord[][] = [
  [rn("1", "maj"), rn("5", "maj"), rn("6", "min"), rn("4", "maj")],
  [rn("1", "maj"), rn("6", "min"), rn("4", "maj"), rn("5", "maj")],
  [rn("6", "min"), rn("4", "maj"), rn("1", "maj"), rn("5", "maj")],
  [rn("1", "maj"), rn("4", "maj"), rn("5", "maj"), rn("4", "maj")],
  [rn("1", "maj"), rn("b7", "maj"), rn("4", "maj"), rn("1", "maj")],
];
const KICKS: readonly number[][] = [
  [0, 8],
  [0, 6, 8],
  [0, 8, 10],
  [0, 3, 8, 11],
  [0, 6, 10],
];

/** L1 to L4 at realism R0 to R4. */
export function generateLadderPiece(
  level: 1 | 2 | 3 | 4,
  realism: 0 | 1 | 2 | 3 | 4,
  seed: number,
  profile: LearnerProfile,
): { code: string; events: NEvent[]; cps: number; bars: number; preload: string[] } {
  const rng = createRng(seed);
  const bpm = rng.int(72 + realism * 8, 84 + realism * 12);
  const bars = level === 4 ? 2 : realism >= 3 ? 4 : 2;
  const key: KeySpec = rng.pick(keysFor(realism >= 2 ? "≤4acc" : "≤2acc", "major"));
  const tracks: TrackSpec[] = [];
  const bank = realism >= 2 ? rng.pick(KITS) : null;
  const kit = bank ? { bank } : {};
  const swing = realism >= 3 && rng.next() < 0.4 ? { amount: rat(1, 3), per: 4 } : undefined;
  const wantDrums =
    level === 1 ||
    (level === 2 && realism >= 2) ||
    (level === 3 && realism >= 2) ||
    (level === 4 && realism >= 3);
  if (wantDrums) {
    const kick = rng.pick(KICKS.slice(0, 2 + realism));
    tracks.push({ label: "kick", src: "s", pat: barNode(gridBeats(kick, 4, 4), "bd"), ...kit });
    if (level === 1 || realism >= 1)
      tracks.push({
        label: "snare",
        src: "s",
        pat: barNode(gridBeats([4, 12], 4, 4), realism >= 4 ? "cp" : "sd"),
        ...kit,
      });
    if (realism >= 1 || level === 1)
      tracks.push({
        label: "hats",
        src: "s",
        pat: seq([atom("hh", realism >= 4 ? 16 : 8)]),
        gain: 0.5,
        ...kit,
        ...(swing && realism < 4 ? { swing } : {}),
      });
  }
  const loop = rng.pick(LOOPS.slice(0, 2 + Math.min(3, realism)));
  const voiced = voiceProgression(loop, key);
  const roots = voiced.map((v) => above((v.midis[0] as number) % 12, 36));
  if (level === 2 || (level === 3 && realism >= 1) || (level === 4 && realism >= 2)) {
    // Bass: roots, with octave and fifth moves from R2.
    const barsOf = roots.map((r) =>
      realism >= 2
        ? line([spellMidi(r, key).code, null, spellMidi(r + 12, key).code, spellMidi(r + 7, key).code])
        : seq([atom(spellMidi(r, key).code)]),
    );
    tracks.push({
      label: "bass",
      src: "note",
      pat: { t: "alt", items: barsOf },
      s: realism >= 3 ? "upright" : "ebass",
    });
  }
  if (level === 3 || (level === 4 && realism >= 1)) {
    const items: Node[] = voiced.map((v) =>
      seq([chordOf(v.midis.slice(1).map((m) => spellMidi(m, key).code))]),
    );
    tracks.push({
      label: "chords",
      src: "note",
      pat: { t: "alt", items },
      s: realism >= 2 ? "rhodes" : "piano",
      gain: 0.5,
    });
  }
  if (level === 4) {
    // Melody inside the learner's comfortable range, so it can be sung back.
    const octave = Math.max(2, Math.min(5, Math.floor((profile.comfLow + profile.comfHigh) / 2 / 12) - 1));
    const steps = melodySteps(rng, {
      length: 6 + realism,
      lowest: 0,
      highest: 7,
      leaps: realism >= 2,
      leapMax: 2 + realism,
      endOnTonic: true,
    });
    const per = Math.ceil(steps.length / bars);
    const melBars: Node[] = [];
    for (let b = 0; b < bars; b++) {
      const chunk = steps.slice(b * per, (b + 1) * per);
      melBars.push(chunk.length === 0 ? seq([rest]) : line(chunk));
    }
    tracks.push({
      label: "mel",
      src: "n",
      pat: { t: "alt", items: melBars },
      key,
      octave,
      s: realism >= 3 ? "tenor" : "piano",
    });
  }
  const piece = buildPiece({ bpm, bars, tracks });
  return { code: piece.code, events: piece.events, cps: piece.cps, bars, preload: piece.preload };
}
