import pack from "../../../../sounds/pack.lock.json";
import { PieceRenderError } from "./errors.ts";
import type { FrameRequest, RenderPieceRequest } from "./types.ts";

export const RENDER_TIMEOUT_MS = 60_000;

/** Validate before constructing a frame; copy mutable selection state at the request boundary. */
export function validateRequest(request: RenderPieceRequest): FrameRequest {
  if (!request || typeof request.code !== "string" || !request.code.trim())
    throw new PieceRenderError("invalid-request", "Choose a piece with code to export.");
  const sampleRate = request.sampleRate ?? 48000;
  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 96000)
    throw new PieceRenderError("invalid-request", "Use a whole sample rate between 8000 and 96000 Hz.");
  const timeout = request.timeoutMs ?? RENDER_TIMEOUT_MS;
  if (!Number.isFinite(timeout) || timeout <= 0 || timeout > 300_000)
    throw new PieceRenderError("invalid-request", "The render timeout must be between 0 and 300000 ms.");
  if (
    request.band &&
    (typeof request.band.code !== "string" ||
      !request.band.code.trim() ||
      !Array.isArray(request.band.tracks) ||
      request.band.tracks.some((t) => !["drums", "bass", "chords"].includes(t)))
  )
    throw new PieceRenderError("invalid-request", "The Band selection needs its code and track roles.");
  return {
    code: request.code,
    band: request.band ? { ...request.band, tracks: [...request.band.tracks] } : null,
    key: request.key ? { ...request.key } : null,
    muted: [...(request.mutes?.muted ?? [])],
    solo: request.mutes?.solo ?? null,
    sampleRate,
    soundsRoot: request.soundsRoot ?? pack.publicRoot,
  };
}

export function localUrl(path: string, base: string): string {
  let url: URL;
  try {
    url = new URL(path, base);
  } catch {
    throw new PieceRenderError("invalid-request", "The render frame or sound pack URL is invalid.");
  }
  if (url.origin !== new URL(base).origin || !["http:", "https:"].includes(url.protocol))
    throw new PieceRenderError("invalid-request", "The render frame and sound pack must be on Oak's origin.");
  return url.href;
}
