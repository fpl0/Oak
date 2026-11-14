// Progress in Wave 6: the advanced tracks as open branches with their honest note (tracks-model.ts), and, from the
// day the core is complete, the line that stays (finale-model.ts `progressEnding`): one entry, not a banner, with
// the way back to the ending, the record and the Oak.
import { Link } from "@tanstack/react-router";
import { GitBranch } from "lucide-react";
import { Card, Chip } from "../../ui/kit/basics.tsx";
import { useTrackRows } from "../day-hooks.ts";
import { FINALE_COPY, type ProgressEnding } from "../finale-model.ts";

/**
 * The tracks, once Jazz or Rhythm is open (U13.CP): each named for what it is, "open", and what can be done there
 * today. A track with no lesson written says so; it is never a button, never a count of what is missing. Before the
 * U13 checkpoint the card is absent (the side lessons have their own line in the course card).
 */
export function TracksCard() {
  const rows = useTrackRows();
  if (!rows.some((r) => r.open && r.trackId !== "A")) return null;
  return (
    <Card className="p-4" data-testid="progress-tracks">
      <div className="mb-1 flex items-center gap-2">
        <GitBranch aria-hidden className="size-4 text-text-3" />
        <h2 className="text-h3">Tracks</h2>
      </div>
      <p className="mb-3 text-sm text-text-2">
        Branches off the core, open from the U13 checkpoint. The core stays your path; a track is never
        required.
      </p>
      <ul className="flex flex-col divide-y divide-border">
        {rows.map((r) => (
          <li
            key={r.trackId}
            className="flex flex-col gap-0.5 py-2.5"
            data-track={r.trackId}
            data-open={r.open}
          >
            <span className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="font-medium">{r.title}</span>
              <Chip tone={r.open ? "accent" : "neutral"}>{r.open ? "open" : "ahead"}</Chip>
            </span>
            <span className="text-sm text-text-2">{r.what}</span>
            <span className="text-sm text-text-3" data-testid="track-note">
              {r.next ? `Next: ${r.next}.` : r.note}
            </span>
            {r.gates.some((g) => !g.met) && r.open && (
              <span className="text-sm text-text-3">
                Still to open:{" "}
                {r.gates
                  .filter((g) => !g.met)
                  .map((g) => g.opens)
                  .join(", ")}
                .
              </span>
            )}
          </li>
        ))}
      </ul>
      <Link
        to="/oak"
        search={{ view: "course" }}
        className="mt-2 inline-block text-sm text-link underline-offset-2 hover:underline"
      >
        See the branches on the Oak
      </Link>
    </Card>
  );
}

/** The permanent record of the ending: its title, its date, the road, and three links. */
export function EndingEntry({ ending }: { ending: ProgressEnding }) {
  const [open, play, oak] = FINALE_COPY.progressLinks;
  return (
    <Card className="border-accent/50 bg-lane-in p-4" data-testid="progress-ending">
      <p className="text-sm text-text-2" data-testid="progress-ending-date">
        {ending.dateLine}
      </p>
      <h2 className="font-display text-h2">{ending.title}</h2>
      {ending.road && <p className="mt-1 text-text-2">{ending.road}</p>}
      <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <Link
          to="/session/coda"
          search={{ ending: 1 }}
          className="text-link underline-offset-2 hover:underline"
          data-testid="open-ending"
        >
          {open}
        </Link>
        <Link to="/album" className="text-link underline-offset-2 hover:underline">
          {play}
        </Link>
        <Link to="/oak" search={{ view: "tree" }} className="text-link underline-offset-2 hover:underline">
          {oak}
        </Link>
      </p>
    </Card>
  );
}
