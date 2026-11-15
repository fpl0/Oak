import { PieceRenderError } from "./errors.ts";

/** Little-endian, interleaved 16-bit PCM. Quantization matches Oak's PCM recorder (no dither). */
export function encodeWav(channels: readonly Float32Array[], sampleRate: number): ArrayBuffer {
  const frames = channels[0]?.length ?? 0;
  if (
    (channels.length !== 1 && channels.length !== 2) ||
    channels.some((c) => c.length !== frames) ||
    !Number.isInteger(sampleRate) ||
    sampleRate < 8000 ||
    sampleRate > 96000 ||
    frames * channels.length * 2 > 0xffffffff - 36
  )
    throw new PieceRenderError(
      "invalid-request",
      "WAV needs one or two equal-length channels and a valid sample rate.",
    );
  const bytes = frames * channels.length * 2;
  const out = new ArrayBuffer(44 + bytes);
  const view = new DataView(out);
  const word = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i));
  };
  word(0, "RIFF");
  view.setUint32(4, 36 + bytes, true);
  word(8, "WAVE");
  word(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels.length, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels.length * 2, true);
  view.setUint16(32, channels.length * 2, true);
  view.setUint16(34, 16, true);
  word(36, "data");
  view.setUint32(40, bytes, true);
  let offset = 44;
  for (let i = 0; i < frames; i++)
    for (const channel of channels) {
      const value = channel[i] ?? 0;
      if (!Number.isFinite(value))
        throw new PieceRenderError("invalid-request", "WAV samples must be finite.");
      const x = Math.max(-1, Math.min(1, value));
      view.setInt16(offset, x < 0 ? x * 0x8000 : x * 0x7fff, true);
      offset += 2;
    }
  return out;
}
