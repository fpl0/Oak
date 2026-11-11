// The release ceremony (ux §2.3): the rings cover draws itself, pith outwards, and the album slot fills. With
// reduced motion the cover is simply there. "Continue" hands the block back to the session runner.
import { Link } from "@tanstack/react-router";
import type { CoverMusic } from "../album/music.ts";
import { AlbumCover } from "../ui/AlbumCover.tsx";
import { Button, buttonClass } from "../ui/kit/Button.tsx";
import { Callout } from "../ui/kit/Controls.tsx";
import { Dialog } from "../ui/kit/Dialog.tsx";

export interface CeremonyData {
  trackId: string;
  capstoneId: string;
  title: string;
  side: "A" | "B" | "Bside";
  trackNo: number;
  version: number;
  coverSeed: string;
  music: CoverMusic | null;
  linerNotes: string;
  audioError: string | null;
  recorded: boolean;
}

export function sideLabel(side: CeremonyData["side"]): string {
  return side === "Bside" ? "B-side" : `Side ${side}`;
}

export function Ceremony({
  data,
  inSession,
  onContinue,
  onClose,
}: {
  data: CeremonyData;
  inSession: boolean;
  onContinue(): void;
  onClose(): void;
}) {
  return (
    <Dialog open onClose={onClose} title="Released" hideTitle className="w-[min(94vw,40rem)]">
      <div className="flex flex-col items-center gap-5 py-2 text-center" data-testid="release-ceremony">
        <AlbumCover seed={data.coverSeed} title={data.title} music={data.music} size={300} draw />
        <div>
          <p className="text-sm text-text-3">
            {sideLabel(data.side)} · track {data.trackNo}
            {data.version > 1 ? ` · version ${data.version}` : ""}
          </p>
          <h2 className="font-display text-h1">{data.title}</h2>
          <p className="mt-1 text-text-2" aria-live="polite">
            {data.version > 1 ? `Version ${data.version} is on the album.` : "It's on the album."}
          </p>
        </div>
        {data.audioError && (
          <Callout tone="attention" title="The recording didn't upload" className="text-left">
            {data.audioError} The track is released; you can record it again from its page.
          </Callout>
        )}
        <div className="flex flex-wrap justify-center gap-2">
          <Link
            to="/album/$trackId"
            params={{ trackId: data.trackId }}
            className={buttonClass("secondary", "lg")}
          >
            Open the track
          </Link>
          {inSession ? (
            <Button variant="primary" size="lg" onClick={onContinue} autoFocus>
              Continue to the coda
            </Button>
          ) : (
            <Link to="/album" className={buttonClass("primary", "lg")} autoFocus>
              See the album
            </Link>
          )}
        </div>
      </div>
    </Dialog>
  );
}
