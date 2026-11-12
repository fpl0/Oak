// The browser gate's reel: one clip of every corpus class, across the voices from bass to soprano, all at
// 48 kHz. Shared by the fixture maker (which renders it into reel.wav) and the spec (which renders the same
// clips again for their truth tracks: the corpus is deterministic).
import type { PitchFrame } from "@oak/pitch";
import { type ClipSpec, type CorpusClip, corpusSpecs, renderClip } from "@oak/pitch/corpus";
import { frameTruth, type GateCounts, type GateReport, gateReport, scoreClip } from "@oak/pitch/gate";

export const REEL_IDS = [
  "steady/bass",
  "vibrato/soprano",
  "scoop-drift/tenor",
  "breathy/alto",
  "noise/baritone/snr20",
  "noise/mezzo/snr15",
  "weak-fundamental/alto",
  "weak-fundamental/bass",
  "glide-legato/mezzo",
  "consonant/tenor",
  // Both bleed levels, as in the Bun corpus: the louder one alone reports its first kick-and-bass downbeat
  // (−43 dBFS, above the −45 dBFS voicing gate) as a voice for about 70 ms.
  "bleed/baritone/50",
  "bleed/soprano/58",
  "silence-room/hum-60",
  "silence-room/keyboard",
  "silence-room/fan",
] as const;

export function reelSpecs(): ClipSpec[] {
  const all = new Map(corpusSpecs().map((s) => [s.id, s]));
  return REEL_IDS.map((id) => {
    const s = all.get(id);
    if (!s) throw new Error(`reel: no corpus clip ${id}`);
    return s;
  });
}

export interface ReelMeta {
  sampleRate: number;
  duration: number;
  segments: { id: string; start: number; duration: number }[];
}

/** The reel's clips, rendered again for their truth (deterministic: the same samples as in reel.wav). */
export function reelClips(): CorpusClip[] {
  return reelSpecs().map(renderClip);
}

/**
 * Where the file started on the frames' clock: the offset (searched in 5 ms steps from `from` to `to`) at which
 * the frames' raw voicing (clarity ≥ 0.9, above −45 dBFS) agrees best with where the reel has a voice. Pitch is
 * not used, so the alignment cannot flatter the accuracy figures.
 */
export function alignReel(
  frames: readonly PitchFrame[],
  clips: readonly CorpusClip[],
  meta: ReelMeta,
  from: number,
  to: number,
): number {
  const byId = new Map(clips.map((c) => [c.id, c]));
  let best = from;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let off = from; off <= to; off += 0.005) {
    let score = 0;
    for (const f of frames) {
      const t = f.t - off;
      const seg = meta.segments.find((s) => t >= s.start && t < s.start + s.duration);
      const clip = seg ? byId.get(seg.id) : undefined;
      if (!seg || !clip) continue;
      const truth = frameTruth(clip, t - seg.start);
      if (truth.state === "ignore") continue;
      const v = f.clarity >= 0.9 && f.rms >= 10 ** (-45 / 20);
      score += v === (truth.state === "voiced") ? 1 : -1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = off;
    }
  }
  return best;
}

/** Scores the frames of a reel take clip by clip (each with its own tracker and room) into the gate report. */
export function scoreReel(
  frames: readonly PitchFrame[],
  clips: readonly CorpusClip[],
  meta: ReelMeta,
  offsetSec: number,
): GateReport {
  const results: { clip: CorpusClip; counts: GateCounts }[] = [];
  for (const seg of meta.segments) {
    const clip = clips.find((c) => c.id === seg.id);
    if (!clip) continue;
    const start = offsetSec + seg.start;
    // Frames whose whole window lies inside the clip.
    const own = frames
      .filter((f) => f.t >= start + 2048 / meta.sampleRate && f.t <= start + seg.duration)
      .map((f) => ({ ...f, t: f.t - start }));
    results.push({ clip, counts: scoreClip(clip, own) });
  }
  return gateReport(results);
}
