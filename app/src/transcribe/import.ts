// Own audio in (contracts §6.12 L7; wave4.md §5.3): the learner drops or picks a file; it is checked and decoded
// here first (so a file the browser cannot play never reaches the store), then stored by the local server's
// audio store (`audio.upload`, sha256, 300 MiB) and opened as an own-audio project. The file never leaves the
// machine: the server is on 127.0.0.1 and the tutor only ever gets code (ux §7.11 "Own audio").
import { AUDIO_UPLOAD_MAX_BYTES, OWN_AUDIO_CHECKLIST } from "@oak/api";

export const DROP_COPY = "Drop an audio file — it stays on this device.";
export const PRIVACY_COPY = "Your audio file stays on this device. Claude only sees your transcription code.";

const AUDIO_EXT = /\.(wav|wave|flac|ogg|oga|opus|mp3|m4a|mp4|aac|webm|aif|aiff)$/i;

/** Why a file cannot be used, or `null` when it can be tried. */
export function fileProblem(file: { name: string; size: number; type: string }): string | null {
  if (file.size === 0) return "That file is empty.";
  if (file.size > AUDIO_UPLOAD_MAX_BYTES)
    return `That file is ${Math.round(file.size / 1024 / 1024)} MB; the limit is ${Math.round(AUDIO_UPLOAD_MAX_BYTES / 1024 / 1024)} MB.`;
  const audioType = file.type.startsWith("audio/") || file.type === "video/mp4" || file.type === "video/webm";
  if (!audioType && !AUDIO_EXT.test(file.name))
    return "That doesn't look like an audio file. Try WAV, FLAC, MP3, AAC (m4a), Ogg or AIFF.";
  return null;
}

/** The project title from the file name: no extension, separators as spaces, at most 200 characters. */
export function titleOf(fileName: string): string {
  const t = fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
  return t || "Untitled recording";
}

// --- the self-assessed checklist (L7) --------------------------------------------------------------------

export const CHECK_LEVELS = [
  { value: 0, label: "Not yet" },
  { value: 1, label: "Partly" },
  { value: 2, label: "Yes" },
] as const;

/** The self score (0–1) of a checklist: the mean of the answered rows over 2; `null` until one is answered. */
export function selfScoreOf(checklist: Readonly<Record<string, number>>): number | null {
  const vals = OWN_AUDIO_CHECKLIST.map((r) => checklist[r.id]).filter(
    (v): v is number => typeof v === "number",
  );
  if (vals.length === 0) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / (vals.length * 2)) * 100) / 100;
}

export function checklistProgress(checklist: Readonly<Record<string, number>>): {
  answered: number;
  total: number;
} {
  return {
    answered: OWN_AUDIO_CHECKLIST.filter((r) => typeof checklist[r.id] === "number").length,
    total: OWN_AUDIO_CHECKLIST.length,
  };
}
