// Which track version a release's take belongs to (pure; engine.ts `releaseTrack`).
import type { AlbumTrackDetail } from "@oak/api";
/** The track version that holds this draft (the newest such), else the track's current version. */
export function releasedVersionOf(
  track: Pick<AlbumTrackDetail, "currentVersion" | "versions">,
  sketchId: string,
  sketchVersion: number,
): number {
  return (
    track.versions.findLast((v) => v.sketchId === sketchId && v.sketchVersion === sketchVersion)?.version ??
    track.currentVersion
  );
}
