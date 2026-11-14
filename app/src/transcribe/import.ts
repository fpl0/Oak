// Own audio in (contracts §6.12 L7; wave4.md §5.3): the learner drops or picks a file; it is checked and decoded
// here first (so a file the browser cannot play never reaches the store), then stored by the local server's
// audio store (`audio.upload`, sha256, 300 MiB) and opened as an own-audio project. The file never leaves the
// machine: the server is on 127.0.0.1 and the tutor only ever gets code (ux §7.11 "Own audio").
import { AUDIO_UPLOAD_MAX_BYTES, OWN_AUDIO_CHECKLIST } from "@oak/api";

export const PRIVACY_COPY = "Your audio file stays on this device. Claude only sees your transcription code.";

/** The audio files the browser can usually decode (the server keeps whatever it is given, up to the limit). */
/** For the kit's FileDropZone (`accept`): audio types and the extensions browsers decode. */
export const AUDIO_ACCEPT = [
  "audio/*",
  ".wav",
  ".wave",
  ".flac",
  ".ogg",
  ".oga",
  ".opus",
  ".mp3",
  ".m4a",
  ".mp4",
  ".aac",
  ".webm",
  ".aif",
  ".aiff",
] as const;
/** The accepted files in words, for the drop zone's refusal. */
export const AUDIO_KINDS = "WAV, FLAC, MP3, AAC (m4a), Ogg or AIFF";

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

/**
 * The row a mapped recording adds (L7 in full-arrangement mode; content/specs/CF.md "Own audio"): the API's list
 * has no form row yet (requested of the server engineer with this ID and label), and the checklist record takes
 * any ID.
 */
export const FORM_CHECK_ROW = {
  id: "form",
  label: "The sections start where the recording's sections start",
} as const;

export type ChecklistRow = { readonly id: string; readonly label: string };

/** The checklist's rows: the API's, and the form row once the recording's sections are mapped. */
export function checklistRows(withForm: boolean): readonly ChecklistRow[] {
  if (!withForm || OWN_AUDIO_CHECKLIST.some((r) => (r.id as string) === FORM_CHECK_ROW.id))
    return OWN_AUDIO_CHECKLIST;
  return [FORM_CHECK_ROW, ...OWN_AUDIO_CHECKLIST];
}

/** The self score (0–1) of a checklist: the mean of the answered rows over 2; `null` until one is answered. */
export function selfScoreOf(
  checklist: Readonly<Record<string, number>>,
  rows: readonly ChecklistRow[] = OWN_AUDIO_CHECKLIST,
): number | null {
  const vals = rows.map((r) => checklist[r.id]).filter((v): v is number => typeof v === "number");
  if (vals.length === 0) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / (vals.length * 2)) * 100) / 100;
}

export function checklistProgress(
  checklist: Readonly<Record<string, number>>,
  rows: readonly ChecklistRow[] = OWN_AUDIO_CHECKLIST,
): {
  answered: number;
  total: number;
} {
  return {
    answered: rows.filter((r) => typeof checklist[r.id] === "number").length,
    total: rows.length,
  };
}
