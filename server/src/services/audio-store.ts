// Audio on disk: the learner's own files by sha256 (`<data>/audio/<sha256>.<ext>`, peaks next to them)
// and recorded album versions (`<data>/album/<trackId>/v<n>.<ext>`). Served with Range support.
// Audio never leaves the machine (contracts §11.10).
import { createHash } from "node:crypto";
import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

const EXT_OF: Readonly<Record<string, string>> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/flac": "flac",
  "audio/x-flac": "flac",
  "audio/ogg": "ogg",
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/aiff": "aiff",
  "audio/x-aiff": "aiff",
};
const MIME_OF: Readonly<Record<string, string>> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  flac: "audio/flac",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  webm: "audio/webm",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  aac: "audio/aac",
  aif: "audio/aiff",
  aiff: "audio/aiff",
};

/** Upload limit for one audio file (a long song in WAV fits; contracts says nothing, 300 MB is generous). */
export const MAX_AUDIO_BYTES = 300 * 1024 * 1024;
/** Waveform peaks of one file. */
export const MAX_PEAKS_BYTES = 16 * 1024 * 1024;

export function extFor(mime: string, name: string): string {
  const fromMime = EXT_OF[mime.split(";")[0]?.trim().toLowerCase() ?? ""];
  if (fromMime !== undefined) return fromMime;
  const m = /\.([a-z0-9]{2,5})$/i.exec(name);
  const ext = m?.[1]?.toLowerCase();
  return ext !== undefined && MIME_OF[ext] !== undefined ? ext : "bin";
}
export function mimeFor(ext: string, fallback = "application/octet-stream"): string {
  return MIME_OF[ext.toLowerCase()] ?? fallback;
}

/** Recognises the common audio containers by their first bytes; `null` when it is not audio we know. */
export function sniffAudio(bytes: Uint8Array): string | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes.length < 12) return null;
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE") return "audio/wav";
  if (ascii(0, 4) === "fLaC") return "audio/flac";
  if (ascii(0, 4) === "OggS") return "audio/ogg";
  if (ascii(0, 3) === "ID3" || (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0)) return "audio/mpeg";
  if (ascii(4, 8) === "ftyp") return "audio/mp4";
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return "audio/webm";
  if (ascii(0, 4) === "FORM" && (ascii(8, 12) === "AIFF" || ascii(8, 12) === "AIFC")) return "audio/aiff";
  return null;
}

/** Duration, sample rate and channels of a PCM WAV; nulls for anything else (the browser reports the rest). */
export function wavInfo(bytes: Uint8Array): {
  durationS: number | null;
  sampleRate: number | null;
  channels: number | null;
} {
  const none = { durationS: null, sampleRate: null, channels: null };
  if (sniffAudio(bytes) !== "audio/wav") return none;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let off = 12;
  let channels: number | null = null;
  let sampleRate: number | null = null;
  let byteRate: number | null = null;
  while (off + 8 <= bytes.length) {
    const id = String.fromCharCode(...bytes.subarray(off, off + 4));
    const size = view.getUint32(off + 4, true);
    if (id === "fmt " && off + 24 <= bytes.length) {
      channels = view.getUint16(off + 10, true);
      sampleRate = view.getUint32(off + 12, true);
      byteRate = view.getUint32(off + 16, true);
    } else if (id === "data") {
      const dataBytes = Math.min(size, bytes.length - off - 8);
      return { durationS: byteRate ? dataBytes / byteRate : null, sampleRate, channels };
    }
    off += 8 + size + (size % 2);
  }
  return { durationS: null, sampleRate, channels };
}

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export class AudioStore {
  constructor(
    readonly audioDir: string,
    readonly albumDir: string,
  ) {}

  /** A path inside one of the two directories, refusing anything that would escape them. */
  #inside(base: string, rel: string): string {
    const abs = resolve(base, rel);
    const r = relative(base, abs);
    if (r === "" || r.startsWith("..") || r.includes(`..${sep}`)) throw new Error(`path escapes ${base}`);
    return abs;
  }

  ownPath(id: string, ext: string): string {
    if (!/^[0-9a-f]{64}$/.test(id)) throw new Error("bad audio id");
    return this.#inside(this.audioDir, `${id}.${ext}`);
  }
  peaksPath(id: string): string {
    if (!/^[0-9a-f]{64}$/.test(id)) throw new Error("bad audio id");
    return this.#inside(this.audioDir, `${id}.peaks`);
  }
  albumPath(trackId: string, version: number, ext: string): string {
    if (!/^[A-Za-z0-9_-]+$/.test(trackId)) throw new Error("bad track id");
    return this.#inside(this.albumDir, join(trackId, `v${version}.${ext}`));
  }
  /** Wave 6 (d20): take 1 keeps the version's own file name (`v1.wav`); later takes are `v1-t2.wav`, … */
  albumTakePath(trackId: string, version: number, take: number, ext: string): string {
    if (take <= 1) return this.albumPath(trackId, version, ext);
    if (!/^[A-Za-z0-9_-]+$/.test(trackId)) throw new Error("bad track id");
    return this.#inside(this.albumDir, join(trackId, `v${version}-t${take}.${ext}`));
  }
  /** Stored paths are relative to the data directory's audio or album folder. */
  resolveStored(stored: string): string {
    if (stored.startsWith("album/")) return this.#inside(this.albumDir, stored.slice("album/".length));
    if (stored.startsWith("audio/")) return this.#inside(this.audioDir, stored.slice("audio/".length));
    return this.#inside(this.audioDir, stored);
  }
  storedName(abs: string): string {
    if (abs.startsWith(this.albumDir)) return `album/${relative(this.albumDir, abs).split(sep).join("/")}`;
    return `audio/${relative(this.audioDir, abs).split(sep).join("/")}`;
  }

  write(abs: string, bytes: Uint8Array): void {
    mkdirSync(dirname(abs), { recursive: true, mode: 0o700 });
    writeFileSync(abs, bytes, { mode: 0o600 });
  }
  remove(abs: string): void {
    rmSync(abs, { force: true });
  }
  removeDir(trackId: string): void {
    if (!/^[A-Za-z0-9_-]+$/.test(trackId)) return;
    rmSync(this.#inside(this.albumDir, trackId), { recursive: true, force: true });
  }
  exists(abs: string): boolean {
    try {
      return statSync(abs).isFile();
    } catch {
      return false;
    }
  }
}

/**
 * The type a media GET is served with: an `audio/…` type, else the one its extension names, else opaque bytes.
 * A stored type comes from the database, which an imported backup writes: `text/html` or `text/javascript` there
 * must never turn a same-origin media URL into a page or a script.
 */
export function mediaType(stored: string, abs: string): string {
  const t = stored.split(";")[0]?.trim().toLowerCase() ?? "";
  if (/^audio\/[a-z0-9][a-z0-9.+-]*$/.test(t)) return t;
  const ext = /\.([a-z0-9]{2,5})$/i.exec(abs)?.[1] ?? "";
  return mimeFor(ext);
}

/**
 * A file response with single-range support (`<audio>` seeks with `Range: bytes=a-b`). Multi-range
 * requests and invalid ranges get the whole file; an unsatisfiable range gets 416.
 */
export function serveFile(
  abs: string,
  req: Request,
  opts: { mime: string; cacheControl?: string; media?: boolean },
): Response {
  const file = Bun.file(abs);
  const size = file.size;
  const headers = new Headers({
    "content-type":
      opts.media && opts.mime !== "application/octet-stream" ? mediaType(opts.mime, abs) : opts.mime,
    "accept-ranges": "bytes",
    "cache-control": opts.cacheControl ?? "no-store",
    "x-content-type-options": "nosniff",
  });
  // The learner's media is never a document: opened on its own it gets no script, no plugin, no same-origin access.
  if (opts.media) headers.set("content-security-policy", "default-src 'none'; sandbox");
  const range = req.headers.get("range");
  const m = range === null ? null : /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  // `bytes=5-3` is not a valid range (RFC 9110 §14.1.1): the header is ignored, the whole file is sent.
  const invalid = m !== null && m[1] !== "" && m[2] !== "" && Number(m[2]) < Number(m[1]);
  if (m !== null && !invalid && !(m[1] === "" && m[2] === "")) {
    let start: number;
    let end: number;
    if (m[1] === "") {
      const suffix = Number(m[2]);
      start = Math.max(0, size - suffix);
      end = size - 1;
    } else {
      start = Number(m[1]);
      end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
    }
    if (start >= size || start > end) {
      headers.set("content-range", `bytes */${size}`);
      return new Response(null, { status: 416, headers });
    }
    headers.set("content-range", `bytes ${start}-${end}/${size}`);
    headers.set("content-length", String(end - start + 1));
    return new Response(req.method === "HEAD" ? null : file.slice(start, end + 1), { status: 206, headers });
  }
  headers.set("content-length", String(size));
  return new Response(req.method === "HEAD" ? null : file, { status: 200, headers });
}
