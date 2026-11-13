// Settings › Data, Wave 5: the album's recordings — the takes recorded for capstone releases (and promoted sketches),
// one per album version that has one. They live in ~/.oak/album, stay with their version and go into a backup
// whenever "Include audio" is on. The total comes from the server (`BackupInfo.albumAudioBytes`); each size from
// the recording's own endpoint (a one-byte range request answers with the whole size in Content-Range), as for the
// learner's own audio (own-audio.ts).
import type { AlbumTrack, AlbumTrackDetail } from "@oak/api";
import { useQueries, useQuery } from "@tanstack/react-query";
import { formatBytes } from "../../../lib/format.ts";
import { albumAudioUrl, apiQuery, useAlbum } from "../../../lib/queries.ts";
import { sizeFromContentRange } from "./own-audio.ts";

export interface AlbumAudioRow {
  trackId: string;
  title: string;
  side: AlbumTrack["side"];
  trackNo: number;
  version: number;
  /** The version the album plays (the track's current one). */
  current: boolean;
  durationS: number | null;
  /** Size of the recording, `null` while unknown. */
  bytes: number | null;
}

const SIDE_ORDER: Record<AlbumTrack["side"], number> = { A: 0, B: 1, Bside: 2 };

/** A stable key for a recording: `<trackId>/v<n>` (the same form the re-record confirm uses). */
export const recordingKey = (trackId: string, version: number) => `${trackId}/v${version}`;

/** One row per album version with a recording: side A first, by track number, newest version first. */
export function albumAudioRows(
  tracks: readonly AlbumTrack[],
  details: Readonly<Record<string, Pick<AlbumTrackDetail, "versions"> | undefined>>,
  sizes: Readonly<Record<string, number | null>>,
): AlbumAudioRow[] {
  const out: AlbumAudioRow[] = [];
  for (const t of tracks) {
    for (const v of details[t.id]?.versions ?? []) {
      if (!v.hasAudio) continue;
      out.push({
        trackId: t.id,
        title: t.title,
        side: t.side,
        trackNo: t.trackNo,
        version: v.version,
        current: v.version === t.currentVersion,
        durationS: v.durationS,
        bytes: sizes[recordingKey(t.id, v.version)] ?? null,
      });
    }
  }
  return out.sort(
    (a, b) => SIDE_ORDER[a.side] - SIDE_ORDER[b.side] || a.trackNo - b.trackNo || b.version - a.version,
  );
}

/** The total: the server's figure when it gives one, else the sum of the known sizes (`known` false if any is missing). */
export function albumAudioTotal(
  rows: readonly AlbumAudioRow[],
  serverBytes: number | undefined,
): { files: number; bytes: number; known: boolean } {
  if (serverBytes !== undefined) return { files: rows.length, bytes: serverBytes, known: true };
  let bytes = 0;
  let known = true;
  for (const r of rows) {
    if (r.bytes === null) known = false;
    else bytes += r.bytes;
  }
  return { files: rows.length, bytes, known };
}

/**
 * The "Include audio" help's tail: " Your own recordings are 24 KB of that. The album's recordings are 1.2 MB."
 * (empty when neither is known).
 */
export function audioShare(own: number | null, album: number | null): string {
  const parts: string[] = [];
  if (own !== null) parts.push(` Your own recordings are ${formatBytes(own)} of that.`);
  if (album !== null)
    parts.push(` The album's recordings are ${formatBytes(album)}${own === null ? " of that" : ""}.`);
  return parts.join("");
}

/** "Side A · track 3 · v2". */
export function albumRowPlace(r: Pick<AlbumAudioRow, "side" | "trackNo" | "version">): string {
  const side = r.side === "Bside" ? "B-side" : `Side ${r.side}`;
  return `${side} · track ${r.trackNo} · v${r.version}`;
}

async function sizeOf(url: string): Promise<number | null> {
  try {
    const r = await fetch(url, { headers: { "X-Oak": "1", Range: "bytes=0-0" } });
    const size =
      sizeFromContentRange(r.headers.get("content-range")) ??
      (r.status === 200 ? Number(r.headers.get("content-length") ?? Number.NaN) : Number.NaN);
    await r.body?.cancel();
    return Number.isFinite(size) ? size : null;
  } catch {
    return null;
  }
}

/** The album's recordings with their sizes. */
export function useAlbumRecordings() {
  const album = useAlbum();
  const tracks = album.data?.tracks ?? [];
  const detailQueries = useQueries({
    queries: tracks.map((t) => apiQuery("album.track", { params: { id: t.id } })),
  });
  const details: Record<string, AlbumTrackDetail | undefined> = {};
  tracks.forEach((t, i) => {
    details[t.id] = detailQueries[i]?.data;
  });
  const withAudio = albumAudioRows(tracks, details, {});
  const keys = withAudio.map((r) => recordingKey(r.trackId, r.version));
  const sizes = useQuery({
    queryKey: ["settings", "album-audio-sizes", keys],
    enabled: keys.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const out: Record<string, number | null> = {};
      await Promise.all(
        withAudio.map(async (r) => {
          out[recordingKey(r.trackId, r.version)] = await sizeOf(albumAudioUrl(r.trackId, r.version));
        }),
      );
      return out;
    },
  });
  const rows = albumAudioRows(tracks, details, sizes.data ?? {});
  const detailsPending = detailQueries.some((q) => q.isPending);
  return { album, rows, sizes, detailsPending };
}
