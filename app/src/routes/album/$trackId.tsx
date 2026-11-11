// `/album/$trackId?v=` (ux §5.3): one track, one version at a time. The screen is app/src/album.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { TrackPage } from "../../album/TrackPage.tsx";

const searchSchema = z.object({ v: z.coerce.number().int().positive().optional().catch(undefined) });

export const Route = createFileRoute("/album/$trackId")({
  validateSearch: (s) => searchSchema.parse(s),
  component: Track,
});

function Track() {
  const { trackId } = Route.useParams();
  const { v } = Route.useSearch();
  return <TrackPage key={trackId} trackId={trackId} v={v} />;
}
