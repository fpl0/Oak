import { PieceRenderError } from "./errors.ts";

export const MAX_PIECE_BARS = 128;
export const MAX_TAIL_S = 30;
/** Peak threshold matches capstone/record.ts. Tail threshold is the requested −60 dBFS. */
export const SILENT_PEAK = 10 ** (-70 / 20);
export const TAIL_PEAK = 0.001;
export const QUIET_END_S = 0.05;

export function renderLength(bars: number, cps: number, sampleRate: number) {
  if (!Number.isInteger(bars) || bars <= 0)
    throw new PieceRenderError("length", "The piece needs a readable arrangement with whole bars.");
  if (bars > MAX_PIECE_BARS)
    throw new PieceRenderError("too-long", `The piece has ${bars} bars; exports support at most 128.`);
  if (!Number.isFinite(cps) || cps <= 0)
    throw new PieceRenderError("invalid-request", "The piece needs a positive, finite tempo.");
  const seconds = bars / cps;
  // Bound memory as well as musical length (128 bars at an almost-zero tempo is unbounded).
  if (seconds > 600)
    throw new PieceRenderError("too-long", "The piece exceeds the ten-minute export memory budget.");
  return {
    seconds,
    pieceFrames: Math.ceil(seconds * sampleRate),
    frames: Math.ceil((seconds + MAX_TAIL_S) * sampleRate),
  };
}

/** Keep the whole form, including intentional rests; trim only its trailing release/reverb. */
export function trimAndMeasure(left: Float32Array, right: Float32Array, pieceFrames: number, rate: number) {
  let last = pieceFrames - 1;
  let peak = 0;
  for (let i = 0; i < left.length; i++) {
    const magnitude = Math.max(Math.abs(left[i] ?? 0), Math.abs(right[i] ?? 0));
    if (!Number.isFinite(magnitude))
      throw new PieceRenderError("engine", "The audio engine produced a non-finite sample.");
    peak = Math.max(peak, magnitude);
    if (magnitude >= TAIL_PEAK) last = Math.max(last, i);
  }
  if (peak < SILENT_PEAK)
    throw new PieceRenderError(
      "silent",
      "The take was silent. Check the sounds and track mutes, then export again.",
    );
  const quietFrames = Math.ceil(QUIET_END_S * rate);
  if (last >= left.length - quietFrames)
    throw new PieceRenderError(
      "tail-limit",
      "The sound still rings after the 30-second tail limit. Shorten its release or feedback.",
    );
  const frames = last < pieceFrames ? pieceFrames : last + 1 + quietFrames;
  let sum = 0;
  for (let i = 0; i < frames; i++) sum += (left[i] ?? 0) ** 2 + (right[i] ?? 0) ** 2;
  return {
    left: left.slice(0, frames),
    right: right.slice(0, frames),
    peak,
    rms: Math.sqrt(sum / (2 * frames)),
  };
}
