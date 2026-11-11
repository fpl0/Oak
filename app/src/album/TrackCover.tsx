// A released track's own cover (the "Tree Rings" of its current version), for places outside the album that show
// one: Today's album strip, the Coda. It reads the track's versions and analyses the current one (cached for good).
import type { AlbumTrack } from "@oak/api";
import { useAlbumTrack } from "../lib/queries.ts";
import { AlbumCover } from "../ui/AlbumCover.tsx";
import { useCoverMusic } from "./music.ts";

export function TrackCover({ track, size = 56 }: { track: AlbumTrack; size?: number }) {
  const detail = useAlbumTrack(track.id);
  const version =
    detail.data?.versions.find((v) => v.version === track.currentVersion) ??
    detail.data?.versions.at(-1) ??
    null;
  const { music, pending } = useCoverMusic(
    version ? { sketchId: version.sketchId, sketchVersion: version.sketchVersion } : null,
    track.flavour,
  );
  return (
    <AlbumCover
      seed={track.coverSeed}
      title={track.title}
      music={music}
      loading={!detail.isError && (pending || version === null)}
      size={size}
      plain
    />
  );
}
