// Settings › Data, Wave 4: the learner's own recordings (Transcribe's own-audio projects). They live in
// ~/.oak/audio, never leave the machine, and go into a backup whenever "Include audio" is on (the server's backup
// takes every `audio_files` row). Sizes come from the audio endpoint itself (a one-byte range request answers with
// the whole size in Content-Range), since no endpoint lists audio files (requested under apiNotes).
import type { Transcription } from "@oak/api";
import { useQuery } from "@tanstack/react-query";
import { audioUrl } from "../../../lib/queries.ts";

export interface OwnAudioRow {
  projectId: string;
  title: string;
  audioId: string;
  /** Size of the recording, `null` while unknown or when the file is gone. */
  bytes: number | null;
  /** Other projects that use the same recording (the store dedupes by content). */
  sharedWith: number;
  updatedAt: string;
}

/** One row per own-audio project with a recording, newest first. */
export function ownAudioRows(
  items: readonly Pick<Transcription, "id" | "title" | "sourceKind" | "audioId" | "updatedAt">[],
  sizes: Readonly<Record<string, number | null>>,
): OwnAudioRow[] {
  const own = items.filter(
    (t): t is typeof t & { audioId: string } => t.sourceKind === "own-audio" && t.audioId !== null,
  );
  const uses = new Map<string, number>();
  for (const t of own) uses.set(t.audioId, (uses.get(t.audioId) ?? 0) + 1);
  return own
    .map((t) => ({
      projectId: t.id,
      title: t.title,
      audioId: t.audioId,
      bytes: sizes[t.audioId] ?? null,
      sharedWith: (uses.get(t.audioId) ?? 1) - 1,
      updatedAt: t.updatedAt,
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Distinct recordings and their total size (a recording two projects share counts once). */
export function ownAudioTotal(rows: readonly OwnAudioRow[]): {
  files: number;
  bytes: number;
  known: boolean;
} {
  const seen = new Map<string, number | null>();
  for (const r of rows) seen.set(r.audioId, r.bytes);
  let bytes = 0;
  let known = true;
  for (const b of seen.values()) {
    if (b === null) known = false;
    else bytes += b;
  }
  return { files: seen.size, bytes, known };
}

/** The total size out of a `Content-Range: bytes 0-0/12345` header, or `null`. */
export function sizeFromContentRange(header: string | null): number | null {
  const m = header === null ? null : /\/(\d+)\s*$/.exec(header);
  return m ? Number(m[1]) : null;
}

/** The confirm question for deleting one project (contracts §11.6: the native dialog names what goes). */
export function deleteQuestion(row: OwnAudioRow, sizeText: string | null): string {
  const rec = sizeText ? `its recording (${sizeText})` : "its recording";
  return row.sharedWith > 0
    ? `Delete the transcription “${row.title}”? Its code versions and notes go; the recording stays, because ${row.sharedWith === 1 ? "another project uses" : `${row.sharedWith} other projects use`} it. This cannot be undone.`
    : `Delete the transcription “${row.title}” and ${rec}? Its code versions and notes go too. This cannot be undone; a backup you exported earlier still has it.`;
}

async function sizeOf(id: string): Promise<number | null> {
  try {
    const r = await fetch(audioUrl(id), { headers: { "X-Oak": "1", Range: "bytes=0-0" } });
    const size =
      sizeFromContentRange(r.headers.get("content-range")) ??
      (r.status === 200 ? Number(r.headers.get("content-length") ?? Number.NaN) : Number.NaN);
    await r.body?.cancel();
    return Number.isFinite(size) ? size : null;
  } catch {
    return null;
  }
}

/** Sizes of the given recordings, by audio ID. */
export function useAudioSizes(ids: readonly string[]) {
  const key = [...new Set(ids)].sort();
  return useQuery({
    queryKey: ["settings", "audio-sizes", key],
    enabled: key.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const out: Record<string, number | null> = {};
      await Promise.all(
        key.map(async (id) => {
          out[id] = await sizeOf(id);
        }),
      );
      return out;
    },
  });
}
