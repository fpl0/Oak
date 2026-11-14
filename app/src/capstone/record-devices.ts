// "Your devices so far" (content/specs/CF.md): which of the learner's own released Side A tracks already use each
// device, with the bars. Each track's current version is analysed once in the browser grader host (capstone mode,
// the first pass of the piece: the same reading its cover is grown from) and cached per track version for good, since
// a released version's code never changes. A version that no longer evaluates simply has no devices.
import type { AlbumTrackDetail, KeySpec, MeterId, SketchDetail } from "@oak/api";
import { keyEstimate, lintStrict, normalize } from "@oak/grader";
import { useQueries } from "@tanstack/react-query";
import { callApi } from "../lib/api.ts";
import { graderHost } from "../lib/grader-client.ts";
import { useAlbum } from "../lib/queries.ts";
import { type DeviceHit, recordTracks, type TrackDevices } from "./devices.ts";
import { hasPitches, MAX_CAPSTONE_BARS, pieceAnalysis, pieceBars, truncate } from "./piece.ts";

export interface TrackPiece {
  code: string;
  bars: number;
  hits: DeviceHit[];
}

/** The devices of one piece of code, with their bars (the grader's `deviceList`). `null`: it does not evaluate. */
export async function devicesOfCode(
  code: string,
  o: { meter: MeterId; key: KeySpec | null; reviewBeforeRun?: boolean },
): Promise<TrackPiece | null> {
  if (o.reviewBeforeRun && lintStrict(code).length > 0) return null;
  const host = await graderHost();
  const ev = await host.analyze(code, {
    mode: "capstone",
    bars: MAX_CAPSTONE_BARS,
    lint: null,
    meter: o.meter,
  });
  if (!ev.ok) return null;
  const full = normalize(ev, { meter: o.meter });
  const bars = pieceBars(code, full.all);
  const n = truncate(full, bars);
  const key = o.key ?? (hasPitches(n) ? (keyEstimate(n.all)[0]?.key ?? null) : null);
  const analysis = pieceAnalysis(n, { code, meter: o.meter, key, bars });
  return { code, bars, hits: (analysis.deviceList ?? []).map((d) => ({ ...d })) };
}

async function trackPiece(trackId: string): Promise<(TrackPiece & { version: number }) | null> {
  const detail: AlbumTrackDetail = await callApi("album.track", { params: { id: trackId } });
  const v = detail.versions.find((x) => x.version === detail.currentVersion);
  if (!v) return null;
  const sketch: SketchDetail = await callApi("sketches.get", { params: { id: v.sketchId } });
  const sv = sketch.versions.find((x) => x.version === v.sketchVersion);
  if (!sv) return null;
  const piece = await devicesOfCode(sv.code, {
    meter: sv.meter ?? "4/4",
    key: sv.key ?? null,
    reviewBeforeRun: sv.flags.reviewBeforeRun === true,
  });
  return piece ? { ...piece, version: v.version } : null;
}

/**
 * Every released Side A track's devices, and the code of each (so the card can play two bars of it). `pending`
 * while any is still being read; a track that fails to load or to run is left out.
 */
export function useRecordDevices(except: string, enabled = true) {
  const album = useAlbum();
  const list = enabled ? recordTracks(album.data?.tracks ?? [], except) : [];
  const pieces = useQueries({
    queries: list.map((t) => ({
      queryKey: ["capstone-devices", t.id, t.currentVersion] as const,
      queryFn: () => trackPiece(t.id),
      staleTime: Number.POSITIVE_INFINITY,
      gcTime: 60 * 60_000,
      retry: 0,
    })),
  });
  const tracks: (TrackDevices & { code: string; bars: number })[] = [];
  list.forEach((t, i) => {
    const p = pieces[i]?.data;
    if (p) tracks.push({ trackId: t.id, title: t.title, no: t.no, hits: p.hits, code: p.code, bars: p.bars });
  });
  return {
    tracks,
    pending: enabled && (album.isPending || pieces.some((q) => q.isPending)),
  };
}
